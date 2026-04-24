import hashlib
import heapq
import logging
import re
import threading
from typing import Any
from urllib.parse import urlparse

from crawler.config import SKIP_EXTENSIONS
from crawler.core.url import normalize as _normalize_url

logger = logging.getLogger(__name__)

# Noise URL patterns (system, git, login, etc.)
_NOISE_URL_RE = re.compile(
    r"/(?:cdn-cgi|login|signup|register|logout|rss|feed|search|history|membership|support|email-protection|track|stats)\b|[-/](?:blob|commits|branches|tags|merge_requests|pipelines|jobs)\b",
    re.I,
)

# High-value URL patterns (articles, videos, posts)
_DETAIL_HINT_RE = re.compile(
    r"/(?:archives|v|p|post|item|product|video|article|detail)/\d+|/\d+\.html$|/v/|/p/",
    re.I,
)


from crawler.core.frontier_base import BaseFrontier

class Frontier(BaseFrontier):
    """Predictive BFS frontier using a priority queue.
...
    Scores URLs based on their likelihood of being detail pages:
    - Default: 50
    - Detail Hints: 80
    - Shallow Depth: +10
    """

    def __init__(
        self,
        seed_url: str,
        max_pages: int,
        max_depth: int,
        *,
        writer: Any, # R15: Now required
        scan_job_id: int, # R15: Now required
        auto_seed: bool = True,
    ):
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._writer = writer
        self._scan_job_id = scan_job_id

        # Priority Queue: (priority_score, url, depth, page_id)
        # heapq is a min-heap, so we store priority as negative to get max-priority first
        self._queue: list[tuple[int, str, int, int]] = []
        self._visited: set[bytes] = set()
        self._pending_batch: list[tuple[str, int, int]] = []  # (url, depth, score)
        self._lock = threading.Lock()

        parsed = urlparse(seed_url)
        # Tactical Fix: Store domain without 'www' for cross-matching
        self._domain = parsed.netloc.lower().replace("www.", "")

        if auto_seed:
            normalized = _normalize_url(seed_url)
            with self._lock:
                # Do NOT add to _visited here, let flush_batch handle it
                self._pending_batch.append((normalized, 0, 100))  # Seed is max priority
            self.flush_batch()

    def fingerprint(self, url: str) -> bytes:
        return hashlib.md5(url.encode("utf-8")).digest()

    def _score_url(self, url: str, depth: int) -> int:
        """Heuristic scoring for URL priority."""
        score = 50
        path = urlparse(url).path.lower()

        # 1. Detail Hints (Strong boost)
        if _DETAIL_HINT_RE.search(path):
            score += 30

        # 2. Depth Penalty (Shallow pages first)
        score += max(0, (3 - depth) * 5)

        # 3. Extension boost (content types)
        if path.endswith(".html") or path.endswith(".htm"):
            score += 10

        return score

    def _is_allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        target_domain = parsed.netloc.lower().replace("www.", "")
        if target_domain != self._domain:
            return False

        path_lower = parsed.path.lower()
        if _NOISE_URL_RE.search(path_lower):
            return False

        for ext in SKIP_EXTENSIONS:
            if path_lower.endswith(ext):
                return False
        return True

    def push(self, url: str, depth: int) -> None:
        if depth > self._max_depth:
            return
        normalized = _normalize_url(url)
        if not self._is_allowed(normalized):
            return

        fp = self.fingerprint(normalized)
        with self._lock:
            if len(self._visited) >= self._max_pages:
                return
            if fp in self._visited:
                return
            # R8: Do NOT add to _visited yet. Only stage it.
            # This allows re-discovery if the batch flush fails.
            score = self._score_url(normalized, depth)
            self._pending_batch.append((normalized, depth, score))

    def flush_batch(self) -> int:
        with self._lock:
            if not self._pending_batch:
                return 0
            batch = self._pending_batch
            self._pending_batch = []
            
            # R8 corrected: Mark as visited BEFORE attempting persistence
            # to prevent other workers from double-staging these same URLs.
            for (url, depth, score) in batch:
                self._visited.add(self.fingerprint(url))

        # Prepare for DB (only URL and depth for now)
        db_items = [(url, depth) for (url, depth, score) in batch]
        logger.debug(f"Frontier flush_batch: submitting {len(db_items)} items")

        try:
            # Blocking call outside the Frontier lock
            page_ids = self._writer.insert_pages_batch(
                self._scan_job_id,
                db_items,
            )
            logger.debug(f"Frontier flush_batch: received {len(page_ids)} IDs")
        except Exception as e:
            logger.error(f"Frontier flush_batch: writer error {e}")
            with self._lock:
                # Put back into pending for retry by next worker.
                # They stay in _visited, so no duplicate discovery.
                self._pending_batch = batch + self._pending_batch
            raise

        # Successful persistence: items already in _visited, just need to add to _queue
        with self._lock:
            for (url, depth, score), page_id in zip(batch, page_ids):
                # Heapq: store -score for max-heap behavior
                heapq.heappush(self._queue, (-score, url, depth, page_id))
                logger.debug(f"Frontier flush_batch: added {url} to queue")
        return len(batch)

    def pop(self) -> tuple[str, int, int] | None:
        with self._lock:
            if not self._queue:
                return None
            neg_score, url, depth, page_id = heapq.heappop(self._queue)
            logger.debug(f"Frontier pop: {url} (score={-neg_score}, qsize={len(self._queue)})")
            return (url, depth, page_id)

    def mark_visited(self, urls: list[str]) -> None:
        with self._lock:
            for url in urls:
                self._visited.add(self.fingerprint(_normalize_url(url)))

    def seed_existing(self, rows: list[tuple[str, int, int]]) -> None:
        """Add existing rows (usually from DB) directly to the queue."""
        with self._lock:
            for url, depth, page_id in rows:
                normalized = _normalize_url(url)
                # We assume these are already marked visited or shouldn't be filtered out
                # because they came from our own DB.
                score = self._score_url(normalized, depth)
                heapq.heappush(self._queue, (-score, normalized, depth, page_id))

    def is_done(self) -> bool:
        with self._lock:
            return len(self._queue) == 0

    @property
    def visited_count(self) -> int:
        with self._lock:
            return len(self._visited)
