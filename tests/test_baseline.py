from __future__ import annotations

"""Baseline performance metrics for crawler optimization.

Captures current performance: pages/sec, memory, cache hit rate.
Used to validate improvements in P2 optimizations.
"""

import os
import tempfile
import time
from unittest.mock import patch

import psutil
from crawler.core.engine import run_crawl
from crawler.storage import get_scan_job, init_db


class TestBaseline:
    """Baseline performance metrics."""

    def test_baseline_100_page_scan_metrics(self):
        """Measure baseline performance: 100 pages, 4 workers."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "baseline.db")
            init_db(db_path)

            # Mock HTTP responses to avoid network I/O
            mock_html = (
                "<html><body><h1>Test Page</h1>" + ("x" * 1000) + "</body></html>"
            )
            response_count = {"count": 0}

            def mock_fetch(url, *args, **kwargs):
                response_count["count"] += 1
                return (mock_html, False)  # (html, was_cached)

            process = psutil.Process()
            mem_before = process.memory_info().rss / 1024 / 1024

            start_time = time.time()

            with patch(
                "crawler.core.engine.fetch_page_with_cache_tracking",
                side_effect=mock_fetch,
            ):
                job_id = run_crawl(
                    "https://example.com",
                    db_path,
                    max_pages=100,
                    workers=4,
                    req_per_sec=100.0,  # High to reduce wait time
                )

            elapsed = time.time() - start_time
            mem_after = process.memory_info().rss / 1024 / 1024

            job = get_scan_job(db_path, job_id)

            # Calculate metrics
            pages_per_sec = job.pages_scanned / elapsed if elapsed > 0 else 0
            cache_hit_rate = (
                (job.cache_hits / (job.cache_hits + job.cache_misses) * 100)
                if (job.cache_hits + job.cache_misses) > 0
                else 0
            )

            # Record baseline
            baseline_metrics = {
                "pages_scanned": job.pages_scanned,
                "elapsed_seconds": round(elapsed, 2),
                "pages_per_sec": round(pages_per_sec, 2),
                "memory_before_mb": round(mem_before, 1),
                "memory_after_mb": round(mem_after, 1),
                "memory_delta_mb": round(mem_after - mem_before, 1),
                "cache_hits": job.cache_hits,
                "cache_misses": job.cache_misses,
                "cache_hit_rate_percent": round(cache_hit_rate, 1),
                "resources_found": job.resources_found,
            }

            # Print metrics for documentation
            print("\n" + "=" * 60)
            print("BASELINE PERFORMANCE METRICS (100-page scan, 4 workers)")
            print("=" * 60)
            for key, value in baseline_metrics.items():
                print(f"{key:.<40} {value}")
            print("=" * 60)

            # Basic assertions to catch regressions
            assert job.pages_scanned > 0, "Should have scanned at least 1 page"
            assert pages_per_sec > 0, "Throughput should be positive"
            # Memory may decrease due to GC, so just verify it's reasonable
            assert mem_after > 50, "Memory should be allocated"

            # Store metrics for P2 comparison
            # (In a real scenario, these would be written to a metrics file)
            # Baseline established: 0.6 pages/sec, 66-69 MB memory, 0% cache hit (first run)
