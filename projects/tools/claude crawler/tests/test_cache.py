"""Tests for CacheService abstraction."""

import os
import tempfile
import pytest

from crawler.cache import CacheService
from crawler.storage import init_db


@pytest.fixture
def db_path():
    """Create a temporary database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    os.unlink(path)


@pytest.fixture
def cache_service(db_path):
    """Create a CacheService instance for testing."""
    return CacheService(db_path)


class TestCacheService:
    """Tests for CacheService class."""

    def test_get_cache_returns_none_for_uncached_url(self, cache_service):
        """get_cache returns None for uncached URL."""
        result = cache_service.get_cache("https://example.com/page1")
        assert result is None

    def test_save_and_get_cache(self, cache_service):
        """save_cache and get_cache round-trip."""
        url = "https://example.com/page1"
        body = b"<html>test</html>"
        cache_service.save_cache(url, "abc123", "Wed, 21 Oct 2025 07:28:00 GMT",
                                "max-age=3600", body)

        result = cache_service.get_cache(url)
        assert result is not None
        assert result["etag"] == "abc123"
        assert result["last_modified"] == "Wed, 21 Oct 2025 07:28:00 GMT"
        assert result["cache_control"] == "max-age=3600"
        assert result["response_body"] == body
        assert result["size_bytes"] == len(body)

    def test_save_cache_upsert(self, cache_service):
        """save_cache performs UPSERT (update on duplicate URL)."""
        url = "https://example.com/page1"
        cache_service.save_cache(url, "v1", "date1", "max-age=3600", b"old")
        cache_service.save_cache(url, "v2", "date2", "max-age=7200", b"new")

        result = cache_service.get_cache(url)
        assert result["etag"] == "v2"
        assert result["last_modified"] == "date2"
        assert result["cache_control"] == "max-age=7200"
        assert result["response_body"] == b"new"
        assert result["size_bytes"] == 3

    def test_invalidate_all(self, cache_service):
        """invalidate_all clears entire cache."""
        cache_service.save_cache("https://a.com", None, None, None, b"a")
        cache_service.save_cache("https://b.com", None, None, None, b"b")
        cache_service.save_cache("https://c.com", None, None, None, b"c")

        assert cache_service.get_cache("https://a.com") is not None
        assert cache_service.get_cache("https://b.com") is not None
        assert cache_service.get_cache("https://c.com") is not None

        cache_service.invalidate_all()

        assert cache_service.get_cache("https://a.com") is None
        assert cache_service.get_cache("https://b.com") is None
        assert cache_service.get_cache("https://c.com") is None

    def test_get_metrics(self, cache_service):
        """get_metrics returns cache statistics."""
        cache_service.save_cache("https://a.com", None, None, None, b"abc")  # 3 bytes
        cache_service.save_cache("https://b.com", None, None, None, b"12345")  # 5 bytes

        metrics = cache_service.get_metrics()
        assert metrics["total_bytes"] == 8
        assert metrics["entry_count"] == 2

    def test_get_metrics_empty_cache(self, cache_service):
        """get_metrics for empty cache."""
        metrics = cache_service.get_metrics()
        assert metrics["total_bytes"] == 0
        assert metrics["entry_count"] == 0

    def test_save_cache_with_none_headers(self, cache_service):
        """save_cache allows None for etag, last_modified, cache_control."""
        url = "https://example.com/page1"
        cache_service.save_cache(url, None, None, None, b"body")

        result = cache_service.get_cache(url)
        assert result is not None
        assert result["etag"] is None
        assert result["last_modified"] is None
        assert result["cache_control"] is None
        assert result["response_body"] == b"body"
