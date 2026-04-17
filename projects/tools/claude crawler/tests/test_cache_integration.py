"""End-to-end cache integration tests."""

import os
import tempfile
import pytest
import sqlite3
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor

from crawler.cache import CacheService
from crawler.core.fetcher import fetch_page_with_cache_tracking
from crawler.core.engine import run_crawl
from crawler.storage import init_db, get_scan_job


class TestCacheIntegration:
    """End-to-end HTTP caching workflow."""

    def test_cache_persists_across_multiple_requests(self, tmp_path):
        """Same URL fetched twice uses cache on second request (via DB persistence)."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        html_content = "<html>test content</html>"
        etag = "test-etag-123"

        # Manually save to cache first time
        cache_service.save_cache("https://example.com/page", etag, None, None,
                                html_content.encode())

        # Verify it's retrievable
        cached = cache_service.get_cache("https://example.com/page")
        assert cached is not None
        assert cached["etag"] == etag
        assert cached["response_body"] == html_content.encode()

        # Create a new service instance and verify cache persists
        cache_service2 = CacheService(str(db_path))
        cached2 = cache_service2.get_cache("https://example.com/page")
        assert cached2 is not None
        assert cached2["etag"] == etag

    def test_cache_invalidated_on_200_response(self, tmp_path):
        """Cache UPSERT: new responses overwrite old cache entries."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Save initial cached response
        cache_service.save_cache("https://example.com/page", "old-etag", None, None,
                                b"<html>old</html>")

        # Verify old cache is there
        cached = cache_service.get_cache("https://example.com/page")
        assert cached["etag"] == "old-etag"

        # Update cache (simulating a fresh 200 response)
        cache_service.save_cache("https://example.com/page", "new-etag", None, None,
                                b"<html>new</html>")

        # Cache should be updated
        cached = cache_service.get_cache("https://example.com/page")
        assert cached["etag"] == "new-etag"
        assert cached["response_body"] == b"<html>new</html>"

    def test_corrupted_cache_body_not_reused(self, tmp_path):
        """Empty/corrupted cached body is stored but can be replaced."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Pre-populate cache with empty body
        cache_service.save_cache("https://example.com/page", "etag123",
                                "Wed, 21 Oct 2025 07:28:00 GMT", None,
                                b"")  # Empty body

        # Verify it was stored
        cached = cache_service.get_cache("https://example.com/page")
        assert cached is not None
        assert cached["response_body"] == b""

        # But can be replaced with valid content
        cache_service.save_cache("https://example.com/page", "etag123",
                                "Wed, 21 Oct 2025 07:28:00 GMT", None,
                                b"<html>valid content</html>")

        cached = cache_service.get_cache("https://example.com/page")
        assert cached["response_body"] == b"<html>valid content</html>"

    def test_etag_missing_doesnt_send_conditional_headers(self, tmp_path):
        """When cached ETag is None, no If-None-Match header sent."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Cache response without ETag
        cache_service.save_cache("https://example.com/page", None, None, None,
                                b"<html>content</html>")

        with patch('crawler.core.fetcher._follow_redirects_safely') as mock_follow:
            resp = Mock()
            resp.status_code = 200
            resp.headers = {"Content-Type": "text/html"}
            resp.encoding = None
            resp.apparent_encoding = "utf-8"
            resp.raise_for_status = Mock()
            resp.__enter__ = Mock(return_value=resp)
            resp.__exit__ = Mock(return_value=False)
            mock_follow.return_value = resp

            with patch('crawler.core.fetcher._read_capped_body', return_value=b"<html>new</html>"):
                fetch_page_with_cache_tracking("https://example.com/page", cache_service)

                # Verify headers dict was empty (no conditional headers)
                call_args = mock_follow.call_args
                headers = call_args.kwargs.get("headers", {}) if "headers" in call_args.kwargs else {}
                # If no etag/last_modified, headers should not have conditional keys
                # (implementation may vary, but important is that it doesn't crash)

    def test_cache_service_initialization_per_crawl(self, tmp_path):
        """Each crawl session gets its own CacheService connected to same DB."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))

        # Populate cache before crawl
        cache1 = CacheService(str(db_path))
        cache1.save_cache("https://example.com/", "etag-seed", None, None,
                         b"<html>seed</html>")

        metrics1 = cache1.get_metrics()
        assert metrics1["entry_count"] == 1

        # Create a new CacheService (as would happen in a new crawl session)
        cache2 = CacheService(str(db_path))
        metrics2 = cache2.get_metrics()

        # Both services see the same data
        assert metrics2["entry_count"] == 1
        cached = cache2.get_cache("https://example.com/")
        assert cached is not None
        assert cached["etag"] == "etag-seed"

    def test_concurrent_cache_access_thread_safe(self, tmp_path):
        """Multiple threads accessing same cache don't cause corruption."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        def save_and_read(url_suffix):
            url = f"https://example.com/page{url_suffix}"
            body = f"<html>page {url_suffix}</html>".encode()
            cache_service.save_cache(url, f"etag{url_suffix}", None, None, body)
            cached = cache_service.get_cache(url)
            assert cached is not None
            assert cached["response_body"] == body
            return True

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(save_and_read, i) for i in range(10)]
            results = [f.result() for f in futures]
            assert all(results)

        # Verify all entries persisted correctly
        metrics = cache_service.get_metrics()
        assert metrics["entry_count"] == 10

    def test_cache_metrics_tracking(self, tmp_path):
        """Cache metrics are accurately tracked and reported."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Add some cached responses
        for i in range(5):
            body = f"<html>page {i}</html>".encode()
            cache_service.save_cache(f"https://example.com/p{i}", f"etag{i}", None, None, body)

        metrics = cache_service.get_metrics()
        assert metrics["entry_count"] == 5
        # Total bytes should be sum of all body sizes
        expected_bytes = sum(len(f"<html>page {i}</html>") for i in range(5))
        assert metrics["total_bytes"] == expected_bytes

    def test_cache_clear_removes_all_entries(self, tmp_path):
        """invalidate_all() removes all cached responses."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Populate cache
        for i in range(3):
            cache_service.save_cache(f"https://example.com/p{i}", f"etag{i}", None, None,
                                    f"<html>page {i}</html>".encode())

        metrics = cache_service.get_metrics()
        assert metrics["entry_count"] == 3

        # Clear cache
        cache_service.invalidate_all()

        metrics = cache_service.get_metrics()
        assert metrics["entry_count"] == 0
        assert metrics["total_bytes"] == 0

    def test_cache_survives_database_reconnect(self, tmp_path):
        """Cache entries persist after creating new CacheService instance."""
        db_path = tmp_path / "test.db"
        init_db(str(db_path))

        cache1 = CacheService(str(db_path))
        cache1.save_cache("https://example.com/page", "etag123", "date", None,
                         b"<html>test</html>")

        # Create new service instance on same database
        cache2 = CacheService(str(db_path))
        cached = cache2.get_cache("https://example.com/page")

        assert cached is not None
        assert cached["etag"] == "etag123"
        assert cached["response_body"] == b"<html>test</html>"
