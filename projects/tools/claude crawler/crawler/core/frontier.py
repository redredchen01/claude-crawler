"""BFS URL queue for crawling — thread-safe."""

import collections
import threading
from urllib.parse import urlparse

from crawler.config import SKIP_EXTENSIONS
from crawler.core.url import normalize as _normalize_url


class Frontier:
    """BFS frontier that tracks visited URLs and enforces domain/depth/page limits.

    Thread-safe: a single `threading.Lock` guards `_queue` and `_visited` so
    worker threads can concurrently `push` discovered links while another
    worker `pop`s the next URL to crawl. The lock is coarse-grained
    (one lock per Frontier) — simpler than split read/write locks and
    sufficient at our concurrency target (default 8 workers).
    """

    def __init__(self, seed_url: str, max_pages: int, max_depth: int):
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._queue: collections.deque[tuple[str, int]] = collections.deque()
        self._visited: set[str] = set()
        self._lock = threading.Lock()

        parsed = urlparse(seed_url)
        self._domain = parsed.netloc.lower()

        normalized = _normalize_url(seed_url)
        self._visited.add(normalized)
        self._queue.append((normalized, 0))

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
            self._queue.append((normalized, depth))

    def pop(self) -> tuple[str, int] | None:
        """Return next (url, depth) or None if empty. Thread-safe."""
        with self._lock:
            if not self._queue:
                return None
            return self._queue.popleft()

    def is_done(self) -> bool:
        """Queue empty. Thread-safe."""
        with self._lock:
            return len(self._queue) == 0

    @property
    def visited_count(self) -> int:
        with self._lock:
            return len(self._visited)
