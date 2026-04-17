"""BFS URL queue for crawling — thread-safe."""

import collections
import threading
from typing import Optional
from urllib.parse import urlparse

from crawler.config import SKIP_EXTENSIONS
from crawler.core.url import normalize as _normalize_url


class Frontier:
    """BFS frontier that tracks visited URLs and enforces domain/depth/page limits.

    Thread-safe: a single :class:`threading.Lock` guards ``_queue`` and
    ``_visited`` so worker threads can concurrently ``push`` discovered links
    while another worker ``pop``\\s the next URL.

    Two modes:
      * **Plain**: ``pop()`` returns ``(url, depth)`` 2-tuples. Used by tests
        and any caller that doesn't need DB-backed resume.
      * **Writer-aware**: when ``writer`` and ``scan_job_id`` are supplied,
        ``push()`` calls ``writer.insert_page(...)`` synchronously, so every
        discovered URL is persisted as ``status='pending'`` *before* it goes
        on the in-memory queue. ``pop()`` returns ``(url, depth, page_id)``
        3-tuples. This is what Unit 8's idempotent re-run depends on — a
        process kill mid-crawl leaves the frontier reconstructible from the
        ``pages`` table on the next run.
    """

    def __init__(self, seed_url: str, max_pages: int, max_depth: int,
                 *, writer=None, scan_job_id: Optional[int] = None,
                 auto_seed: bool = True):
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._writer = writer
        self._scan_job_id = scan_job_id
        self._writer_mode = writer is not None and scan_job_id is not None
        self._queue: collections.deque = collections.deque()
        self._visited: set[str] = set()
        self._lock = threading.Lock()

        parsed = urlparse(seed_url)
        self._domain = parsed.netloc.lower()

        if auto_seed:
            normalized = _normalize_url(seed_url)
            self._visited.add(normalized)
            self._enqueue(normalized, 0)

    def _enqueue(self, url: str, depth: int) -> None:
        """Push to internal queue, persisting via writer when in writer mode."""
        if self._writer_mode:
            page_id = self._writer.insert_page(self._scan_job_id, url, depth)
            self._queue.append((url, depth, page_id))
        else:
            self._queue.append((url, depth))

    @staticmethod
    def _normalize(url: str) -> str:
        """Deprecated shim — delegates to crawler.core.url.normalize."""
        return _normalize_url(url)

    def _is_allowed(self, url: str) -> bool:
        """Check domain match and extension filter. Pure — no shared state."""
        parsed = urlparse(url)
        if parsed.netloc.lower() != self._domain:
            return False
        path_lower = parsed.path.lower()
        for ext in SKIP_EXTENSIONS:
            if path_lower.endswith(ext):
                return False
        return True

    def push(self, url: str, depth: int) -> None:
        """Add URL if same domain, not visited, within limits. Thread-safe."""
        if depth > self._max_depth:
            return
        normalized = _normalize_url(url)
        if not self._is_allowed(normalized):
            return
        with self._lock:
            if len(self._visited) >= self._max_pages:
                return
            if normalized in self._visited:
                return
            self._visited.add(normalized)
            self._enqueue(normalized, depth)

    def pop(self):
        """Return next item or None if empty.

        Tuple shape depends on mode: ``(url, depth)`` in plain mode,
        ``(url, depth, page_id)`` in writer-aware mode. Thread-safe.
        """
        with self._lock:
            if not self._queue:
                return None
            return self._queue.popleft()

    def mark_visited(self, urls) -> None:
        """Mark URLs as already-seen *without* enqueuing.

        Resume path uses this to pre-populate ``_visited`` with every URL
        already in the ``pages`` table, so re-discovered links don't get
        re-pushed.
        """
        with self._lock:
            for url in urls:
                self._visited.add(_normalize_url(url))

    def seed_existing(self, rows) -> None:
        """Pre-populate the queue with already-persisted (url, depth, page_id) rows.

        Unlike :meth:`push`, this *unconditionally* enqueues — the resume
        path may have already called :meth:`mark_visited` on the same URLs
        to dedup re-discovered links, which would otherwise make this a
        no-op and leave pending work stranded.
        """
        with self._lock:
            for url, depth, page_id in rows:
                normalized = _normalize_url(url)
                self._visited.add(normalized)
                self._queue.append((normalized, depth, page_id))

    def is_done(self) -> bool:
        """Queue empty. Thread-safe."""
        with self._lock:
            return len(self._queue) == 0

    @property
    def visited_count(self) -> int:
        with self._lock:
            return len(self._visited)
