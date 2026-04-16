"""BFS URL queue for crawling."""

import collections
from urllib.parse import urlparse, urlunparse

from crawler.config import SKIP_EXTENSIONS


class Frontier:
    """BFS frontier that tracks visited URLs and enforces domain/depth/page limits."""

    def __init__(self, seed_url: str, max_pages: int, max_depth: int):
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._queue: collections.deque[tuple[str, int]] = collections.deque()
        self._visited: set[str] = set()

        parsed = urlparse(seed_url)
        self._domain = parsed.netloc.lower()

        normalized = self._normalize(seed_url)
        self._visited.add(normalized)
        self._queue.append((normalized, 0))

    @staticmethod
    def _normalize(url: str) -> str:
        """Strip fragment and trailing slash for dedup."""
        parsed = urlparse(url)
        path = parsed.path.rstrip("/") or "/"
        return urlunparse((parsed.scheme, parsed.netloc.lower(), path,
                           parsed.params, parsed.query, ""))

    def _is_allowed(self, url: str) -> bool:
        """Check domain match and extension filter."""
        parsed = urlparse(url)
        if parsed.netloc.lower() != self._domain:
            return False
        path_lower = parsed.path.lower()
        for ext in SKIP_EXTENSIONS:
            if path_lower.endswith(ext):
                return False
        return True

    def push(self, url: str, depth: int) -> None:
        """Add URL if same domain, not visited, within limits."""
        if len(self._visited) >= self._max_pages:
            return
        if depth > self._max_depth:
            return
        normalized = self._normalize(url)
        if normalized in self._visited:
            return
        if not self._is_allowed(normalized):
            return
        self._visited.add(normalized)
        self._queue.append((normalized, depth))

    def pop(self) -> tuple[str, int] | None:
        """Return next (url, depth) or None if empty."""
        if not self._queue:
            return None
        return self._queue.popleft()

    def is_done(self) -> bool:
        """Queue empty or max_pages reached (and queue drained)."""
        return len(self._queue) == 0

    @property
    def visited_count(self) -> int:
        return len(self._visited)
