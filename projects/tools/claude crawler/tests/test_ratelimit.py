"""Tests for crawler.core.ratelimit — TokenBucket and DomainRateLimiter."""

import threading
import time

import pytest

from crawler.core.ratelimit import TokenBucket, DomainRateLimiter


# Generous tolerance for timing-sensitive tests on CI hardware.
_TIMING_TOL = 0.3  # ±30% — tests check order-of-magnitude, not exact timing


class TestTokenBucketRate:
    def test_single_threaded_pacing(self):
        """Rate=10 → 10 acquires take ~1s."""
        bucket = TokenBucket(rate=10.0)
        start = time.monotonic()
        for _ in range(10):
            bucket.acquire()
        elapsed = time.monotonic() - start
        # 10 acquires at 10/s = 1s ± tolerance.
        assert 0.8 <= elapsed <= 1.4, f"elapsed {elapsed:.3f}s not in [0.8, 1.4]"

    def test_rate_must_be_positive(self):
        with pytest.raises(ValueError):
            TokenBucket(rate=0)
        with pytest.raises(ValueError):
            TokenBucket(rate=-1.0)

    def test_concurrent_acquires_serialize(self):
        """8 threads racing for a rate=5.0 bucket → 40 acquires take ~8s.

        Verifies the bucket enforces its rate under concurrency — workers
        are serialized, not parallelized.
        """
        bucket = TokenBucket(rate=5.0)
        barrier = threading.Barrier(8)

        def worker():
            barrier.wait()
            for _ in range(5):
                bucket.acquire()

        threads = [threading.Thread(target=worker) for _ in range(8)]
        start = time.monotonic()
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        elapsed = time.monotonic() - start
        # 40 acquires at 5/s = 8s.
        assert 7.0 <= elapsed <= 10.0, f"elapsed {elapsed:.3f}s not in [7.0, 10.0]"

    def test_fast_rate_does_not_block_uselessly(self):
        """Very high rate → acquires complete essentially instantly."""
        bucket = TokenBucket(rate=10_000.0)
        start = time.monotonic()
        for _ in range(100):
            bucket.acquire()
        elapsed = time.monotonic() - start
        # 100 acquires at 10k/s = 0.01s; allow some scheduler noise.
        assert elapsed < 0.5, f"elapsed {elapsed:.3f}s unexpectedly slow"


class TestDomainRateLimiter:
    def test_different_domains_are_independent(self):
        """Two domains at rate=5 → 5 acquires each in parallel = ~1s total,
        not ~2s as would be the case if they shared a bucket.
        """
        limiter = DomainRateLimiter(default_rate=5.0)
        results: list[float] = []
        results_lock = threading.Lock()

        def worker(url: str):
            local_start = time.monotonic()
            for _ in range(5):
                limiter.acquire(url)
            with results_lock:
                results.append(time.monotonic() - local_start)

        t_start = time.monotonic()
        t1 = threading.Thread(target=worker, args=("https://a.com/x",))
        t2 = threading.Thread(target=worker, args=("https://b.com/x",))
        t1.start(); t2.start()
        t1.join(); t2.join()
        total = time.monotonic() - t_start

        # Each worker does 5 acquires at 5/s = ~1s (minus the first-token freebie).
        # Running in parallel on different domains, total should match per-worker time.
        assert total < 1.5, f"total {total:.3f}s implies domains are NOT independent"

    def test_same_domain_serializes(self):
        """Two threads hitting the same domain share the bucket."""
        limiter = DomainRateLimiter(default_rate=5.0)

        def worker():
            for _ in range(5):
                limiter.acquire("https://shared.com/x")

        start = time.monotonic()
        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start(); t2.start()
        t1.join(); t2.join()
        elapsed = time.monotonic() - start

        # 10 acquires at 5/s = 2s ± tolerance.
        assert 1.5 <= elapsed <= 3.0, f"elapsed {elapsed:.3f}s not in [1.5, 3.0]"

    def test_domain_extracted_from_url(self):
        """Buckets are keyed by netloc, not full URL."""
        limiter = DomainRateLimiter(default_rate=100.0)
        # Same-netloc calls hit the same bucket even with different paths/queries.
        start = time.monotonic()
        for _ in range(50):
            limiter.acquire("https://example.com/different-paths")
            limiter.acquire("https://example.com/other-paths?q=1")
        elapsed = time.monotonic() - start
        # 100 acquires (50+50) at 100/s = 1s.
        assert 0.7 <= elapsed <= 1.5, f"elapsed {elapsed:.3f}s not in [0.7, 1.5]"

    def test_rate_must_be_positive(self):
        with pytest.raises(ValueError):
            DomainRateLimiter(default_rate=0)
        with pytest.raises(ValueError):
            DomainRateLimiter(default_rate=-1.0)

    def test_case_insensitive_netloc(self):
        """HTTPS://Example.com and https://example.com share one bucket."""
        limiter = DomainRateLimiter(default_rate=5.0)
        start = time.monotonic()
        # 5 + 5 = 10 acquires at 5/s = 2s if they share the bucket; ~1s if not.
        for _ in range(5):
            limiter.acquire("HTTPS://Example.COM/x")
            limiter.acquire("https://example.com/y")
        elapsed = time.monotonic() - start
        assert elapsed >= 1.5, (
            f"elapsed {elapsed:.3f}s too fast — implies case variants use separate buckets"
        )
