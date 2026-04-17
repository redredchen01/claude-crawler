"""BFS URL queue for crawling — thread-safe."""

import collections
import logging
import threading
from urllib.parse import urlparse

from crawler.config import SKIP_EXTENSIONS
from crawler.core.url import normalize as _normalize_url

logger = logging.getLogger(__name__)


class Frontier:
    """BFS frontier that tracks visited URLs and enforces domain/depth/page limits.

    Thread-safe: a single :class:`threading.Lock` guards ``_queue``,
    ``_visited``, and ``_pending_batch`` so worker threads can concurrently
    ``push`` discovered links while another worker ``pop``\\s the next URL.

    ``push()`` stages the URL in ``_pending_batch`` (under the lock,
    microseconds-fast), and the worker calls :meth:`flush_batch` after
    finishing its link iteration. ``flush_batch`` makes a single
    ``insert_pages_batch`` round-trip to the writer (one fsync per page,
    not per link) and only then moves the URLs into ``_visited`` and
    ``_queue``. This keeps the lock-held region trivial even when a page
    discovers thousands of links. ``pop()`` always returns 3-tuples
    ``(url, depth, page_id)``.
    """

    def __init__(self, seed_url: str, max_pages: int, max_depth: int,
                 *, writer, scan_job_id: int, auto_seed: bool = True):
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._writer = writer
        self._scan_job_id = scan_job_id
        self._queue: collections.deque = collections.deque()
        self._visited: set[str] = set()
        self._pending_batch: list[tuple[str, int]] = []
        self._lock = threading.Lock()

        parsed = urlparse(seed_url)
        self._domain = parsed.netloc.lower()

        if auto_seed:
            normalized = _normalize_url(seed_url)
            with self._lock:
                self._visited.add(normalized)
                self._pending_batch.append((normalized, 0))
            # Flush the seed immediately so the engine sees a populated
            # queue on the first pop().
            self.flush_batch()

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
        """Stage URL for the next batch flush. Thread-safe; lock-held
        region is microseconds (just dedup + list.append).
        """
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
            self._pending_batch.append((normalized, depth))

    def flush_batch(self) -> int:
        """Persist all staged URLs via one writer round-trip and move them
        onto the in-memory queue with their assigned page_ids.

        Called by the worker after iterating a parsed page's links. Returns
        the number of URLs flushed (0 when the staging buffer is empty).

        On writer failure the staged URLs are returned to ``_pending_batch``
        for retry on a future flush. Importantly, they STAY in ``_visited``
        — removing them would let a concurrent re-discovery from another
        worker re-stage the same URL, which after a successful retry would
        produce two queue entries with the same page_id and cause the same
        page to be processed twice (counter inflation). The pending_batch
        path is the only retry channel; re-discovery is intentionally
        blocked. If the writer is permanently unhealthy the engine's
        :meth:`WriterThread.is_alive` health check fires and aborts.
        """
        with self._lock:
            if not self._pending_batch:
                return 0
            batch = self._pending_batch
            self._pending_batch = []
        # Writer call OUTSIDE the lock — this is the whole point of the
        # batch protocol. The lock is held only for the in-memory list swap.
        try:
            page_ids = self._writer.insert_pages_batch(
                self._scan_job_id, batch,
            )
        except BaseException:
            # Roll the staged items back into the buffer for retry. Keep
            # them in _visited so concurrent re-discovery doesn't double-
            # stage them.
            with self._lock:
                self._pending_batch = batch + self._pending_batch
            raise
        with self._lock:
            for (url, depth), page_id in zip(batch, page_ids):
                self._queue.append((url, depth, page_id))
        return len(batch)

    def pop(self) -> tuple[str, int, int] | None:
        """Return next ``(url, depth, page_id)`` or ``None`` if empty.

        Thread-safe.
        """
        with self._lock:
            if not self._queue:
                return None
            return self._queue.popleft()

    def mark_visited(self, urls) -> None:
        """Mark URLs as already-seen *without* enqueuing.

        Used exclusively by the engine's resume path to pre-populate
        ``_visited`` with every URL already in the ``pages`` table, so
        re-discovered links don't get re-pushed. Production crawl-from-seed
        code uses :meth:`push` (which dedups against _visited).
        """
        with self._lock:
            for url in urls:
                self._visited.add(_normalize_url(url))

    def seed_existing(self, rows) -> None:
        """Pre-populate the queue with already-persisted (url, depth, page_id) rows.

        Used exclusively by the engine's resume path to put pending pages
        from a prior killed run back into the worker queue without going
        through the writer (the rows already exist in the ``pages`` table).
        Production crawl-from-seed code uses :meth:`push` + :meth:`flush_batch`.

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
