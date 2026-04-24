from __future__ import annotations

import hashlib
import json
import logging
import threading
from typing import Any, List, Optional, Tuple
from urllib.parse import urlparse

from crawler.core.url import normalize as _normalize_url
from crawler.config import SKIP_EXTENSIONS

logger = logging.getLogger(__name__)

class RedisFrontier:
    """Highly optimized Distributed Frontier.
    
    Optimizations:
    1. Lua-based atomic push (Reduces RTT).
    2. L1 Local visited cache (Reduces redundant Redis queries).
    3. Pipelined batch processing.
    """
    
    # Lua script for atomic: if not visited then stage in pending
    _PUSH_LUA = """
    local visited = redis.call('SISMEMBER', KEYS[1], ARGV[1])
    if visited == 0 then
        redis.call('RPUSH', KEYS[2], ARGV[2])
        return 1
    end
    return 0
    """

    def __init__(
        self,
        seed_url: str,
        max_pages: int,
        max_depth: int,
        *,
        writer: Any,
        scan_job_id: int,
        redis_url: str,
        auto_seed: bool = True,
    ):
        try:
            import redis
            self._redis = redis.from_url(redis_url, decode_responses=False)
            self._push_script = self._redis.register_script(self._PUSH_LUA)
        except ImportError:
            raise ImportError("Distributed mode requires 'redis' package. Install it via 'pip install redis'.")

        self._max_pages = max_pages
        self._max_depth = max_depth
        self._writer = writer
        self._scan_job_id = scan_job_id
        
        self._visited_key = f"crawler:v:{scan_job_id}"
        self._queue_key = f"crawler:q:{scan_job_id}"
        self._pending_key = f"crawler:p:{scan_job_id}"
        
        # L1 Cache: reduces SISMEMBER traffic for URLs found by this node
        self._l1_visited: set[bytes] = set()
        self._l1_lock = threading.Lock()
        
        parsed = urlparse(seed_url)
        self._domain = parsed.netloc.lower().replace("www.", "")

        if auto_seed:
            self.push(seed_url, 0)
            self.flush_batch()

    def fingerprint(self, url: str) -> bytes:
        return hashlib.md5(url.encode("utf-8")).digest()

    def _is_allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "") == self._domain

    def push(self, url: str, depth: int) -> None:
        if depth > self._max_depth: return
        normalized = _normalize_url(url)
        if not self._is_allowed(normalized): return

        fp = self.fingerprint(normalized)
        
        # Optimization: Check L1 Cache first (No Network RTT)
        with self._l1_lock:
            if fp in self._l1_visited: return
            
        score = 50 # Default score
        # Use Lua script to atomically check global visited and stage
        # Keys: [visited_key, pending_key], Args: [fingerprint, payload]
        payload = f"{normalized}|{depth}|{score}"
        self._push_script(keys=[self._visited_key, self._pending_key], args=[fp, payload])

    def flush_batch(self) -> int:
        # Atomic pull from pending
        p = self._redis.pipeline()
        p.lrange(self._pending_key, 0, -1)
        p.delete(self._pending_key)
        res = p.execute()
        
        raw_items = res[0]
        if not raw_items: return 0
            
        # Parse optimized payload: "url|depth|score"
        items = []
        for raw in raw_items:
            u, d, s = raw.decode().split('|')
            items.append({"url": u, "depth": int(d), "score": int(s)})
            
        db_items = [(i["url"], i["depth"]) for i in items]
        
        try:
            page_ids = self._writer.insert_pages_batch(self._scan_job_id, db_items)
        except Exception:
            for raw in raw_items: self._redis.lpush(self._pending_key, raw)
            raise

        # Atomic commit to global visited and priority queue
        p = self._redis.pipeline()
        for item, pid in zip(items, page_ids):
            fp = self.fingerprint(item["url"])
            p.sadd(self._visited_key, fp)
            # Compact queue payload: [url, depth, pid]
            p.zadd(self._queue_key, {f"{item['url']}|{item['depth']}|{pid}": -item["score"]})
        p.execute()
        
        # Update L1 Cache with successful items
        with self._l1_lock:
            for item in items:
                self._l1_visited.add(self.fingerprint(item["url"]))
        
        return len(items)

    def pop(self) -> Optional[Tuple[str, int, int]]:
        # ZPOPMIN is atomic across all nodes
        res = self._redis.zpopmin(self._queue_key)
        if not res: return None
        
        payload_raw, neg_score = res[0]
        u, d, pid = payload_raw.decode().split('|')
        return (u, int(d), int(pid))

    def is_done(self) -> bool:
        return self._redis.zcard(self._queue_key) == 0

    @property
    def visited_count(self) -> int:
        return self._redis.scard(self._visited_key)

    def mark_visited(self, urls: list[str]) -> None:
        if not urls: return
        p = self._redis.pipeline()
        for u in urls:
            fp = self.fingerprint(_normalize_url(u))
            p.sadd(self._visited_key, fp)
            with self._l1_lock: self._l1_visited.add(fp)
        p.execute()

    def seed_existing(self, rows: list[tuple[str, int, int]]) -> None:
        p = self._redis.pipeline()
        for url, depth, page_id in rows:
            normalized = _normalize_url(url)
            fp = self.fingerprint(normalized)
            p.sadd(self._visited_key, fp)
            p.zadd(self._queue_key, {f"{normalized}|{depth}|{page_id}": -50})
            with self._l1_lock: self._l1_visited.add(fp)
        p.execute()
