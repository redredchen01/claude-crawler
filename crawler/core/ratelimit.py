from __future__ import annotations

"""Per-domain token-bucket rate limiter.

Replaces the MVP's global `time.sleep(rate_limit)` with politeness that is
correct under concurrency: each domain gets its own bucket, so workers
crawling different domains never block each other, and workers on the same
domain serialize through the bucket.
"""

import random
import threading
import time
from urllib.parse import urlparse

class TokenBucket:
    """Classic token bucket with adaptive rate limiting and Circuit Breaker.

    Refill rate: `rate` tokens/second. Capacity is 1.
    Supports multiplicative decrease on 429 errors and slow recovery.
    R26: Circuit Breaker for consecutive failures.
    """

    def __init__(self, rate: float):
        if rate <= 0:
            raise ValueError(f"rate must be positive, got {rate}")
        self._base_rate = rate
        self._current_rate = rate
        self._interval = 1.0 / rate
        self._next_allowed = time.monotonic()
        self._lock = threading.Lock()
        self._last_error_time = 0.0
        self._fail_count = 0
        self._circuit_open_until = 0.0

    def update_rate(self, new_rate: float) -> None:
        """Update the refill rate. Thread-safe."""
        with self._lock:
            self._current_rate = max(0.1, new_rate)
            self._interval = 1.0 / self._current_rate

    def report_429(self) -> None:
        """Multiplicative Decrease: cut rate by 50% on rate-limit error."""
        with self._lock:
            now = time.monotonic()
            # Guard: don't cut multiple times for concurrent requests in the same window
            if now - self._last_error_time > 1.0:
                self._last_error_time = now
                self._current_rate = max(0.1, self._current_rate * 0.5)
                self._interval = 1.0 / self._current_rate
            self._fail_count += 1

    def report_failure(self) -> None:
        """Track consecutive non-429 failures for circuit breaking."""
        with self._lock:
            self._fail_count += 1
            if self._fail_count >= 10:
                # Open circuit for 5 minutes
                self._circuit_open_until = time.monotonic() + 300
                logger.error(f"Circuit Breaker OPEN for domain. Halting for 300s.")

    def report_success(self) -> None:
        """Reset failure counter on successful request."""
        with self._lock:
            self._fail_count = 0

    def is_open(self) -> bool:
        """Check if the circuit is currently open (blocked)."""
        with self._lock:
            return time.monotonic() < self._circuit_open_until

    def acquire(self) -> None:
        """Block until the next token is available.

        Includes slow recovery (Additive Increase) if no errors seen recently.
        Also honors Circuit Breaker status.
        """
        # R26: Check circuit status before waiting
        while self.is_open():
            time.sleep(1.0)

        while True:
            with self._lock:
                now = time.monotonic()

                # Recovery: if no errors for 10s, slowly creep rate back up towards base_rate
                if (
                    now - self._last_error_time > 10.0
                    and self._current_rate < self._base_rate
                ):
                    # Increase by 0.1 tokens/sec every 10s
                    self._current_rate = min(self._base_rate, self._current_rate + 0.1)
                    self._interval = 1.0 / self._current_rate

                if now >= self._next_allowed:
                    # Apply jitter to the interval for the NEXT request
                    jitter = random.uniform(0.85, 1.15)
                    self._next_allowed = now + (self._interval * jitter)
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

    def report_429(self, url: str) -> None:
        """Report a 429 error for the given URL's domain to trigger backoff."""
        self._bucket_for(url).report_429()

    def report_failure(self, url: str) -> None:
        self._bucket_for(url).report_failure()

    def report_success(self, url: str) -> None:
        self._bucket_for(url).report_success()

    def is_blocked(self, url: str) -> bool:
        return self._bucket_for(url).is_open()
