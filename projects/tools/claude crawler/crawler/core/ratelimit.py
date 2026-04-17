"""Per-domain token-bucket rate limiter.

Replaces the MVP's global `time.sleep(rate_limit)` with politeness that is
correct under concurrency: each domain gets its own bucket, so workers
crawling different domains never block each other, and workers on the same
domain serialize through the bucket.
"""

import threading
import time
from urllib.parse import urlparse


class TokenBucket:
    """Classic token bucket — `acquire()` blocks until a token is available.

    Refill rate: `rate` tokens/second. Bucket capacity is 1 (strict pacing,
    no burst). This means the bucket never hands out more than `rate` tokens
    per second on average; there's no credit for idle periods.

    Invariant: exactly one token is consumed per `acquire()` call.
    """

    def __init__(self, rate: float):
        if rate <= 0:
            raise ValueError(f"rate must be positive, got {rate}")
        self._rate = rate
        self._interval = 1.0 / rate
        self._next_allowed = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until the next token is available, then consume it."""
        while True:
            with self._lock:
                now = time.monotonic()
                if now >= self._next_allowed:
                    self._next_allowed = now + self._interval
                    return
                wait = self._next_allowed - now
            time.sleep(wait)


class DomainRateLimiter:
    """Keyed rate limiter: one `TokenBucket` per domain, created lazily.

    Different domains never contend. Same-domain callers serialize through
    that domain's bucket.
    """

    def __init__(self, default_rate: float):
        if default_rate <= 0:
            raise ValueError(f"default_rate must be positive, got {default_rate}")
        self._default_rate = default_rate
        self._buckets: dict[str, TokenBucket] = {}
        self._buckets_lock = threading.Lock()

    def _bucket_for(self, url: str) -> TokenBucket:
        domain = urlparse(url).netloc.lower()
        with self._buckets_lock:
            bucket = self._buckets.get(domain)
            if bucket is None:
                bucket = TokenBucket(self._default_rate)
                self._buckets[domain] = bucket
            return bucket

    def acquire(self, url: str) -> None:
        """Block until the URL's domain has a token available, then consume it."""
        self._bucket_for(url).acquire()
