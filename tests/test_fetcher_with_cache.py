
"""Tests for fetch_page_with_cache and conditional request logic."""

from __future__ import annotations


from unittest.mock import Mock, patch

from crawler.cache import CacheService
from crawler.core.fetcher import (
    _attempt_fetch,
    _follow_redirects_safely,
    fetch_page_with_cache,
)


class TestConditionalRequests:
    """Test conditional request header handling in _follow_redirects_safely."""

    def test_etag_header_sent_on_first_request(self):
        """If-None-Match header is sent when etag is provided."""
        with patch("crawler.core.fetcher._SESSION.get") as mock_get:
            resp = Mock()
            resp.is_redirect = False
            mock_get.return_value = resp

            _follow_redirects_safely("https://example.com", cached_etag="abc123")

            # Verify header was sent in the request
            call_args = mock_get.call_args
            assert "headers" in call_args.kwargs
            assert call_args.kwargs["headers"]["If-None-Match"] == "abc123"

    def test_last_modified_header_sent_on_first_request(self):
        """If-Modified-Since header is sent when last_modified is provided."""
        with patch("crawler.core.fetcher._SESSION.get") as mock_get:
            resp = Mock()
            resp.is_redirect = False
            mock_get.return_value = resp

            _follow_redirects_safely(
                "https://example.com",
                cached_last_modified="Wed, 21 Oct 2025 07:28:00 GMT",
            )

            call_args = mock_get.call_args
            assert "headers" in call_args.kwargs
            assert (
                call_args.kwargs["headers"]["If-Modified-Since"]
                == "Wed, 21 Oct 2025 07:28:00 GMT"
            )

    def test_both_conditional_headers_sent(self):
        """Both If-None-Match and If-Modified-Since are sent together."""
        with patch("crawler.core.fetcher._SESSION.get") as mock_get:
            resp = Mock()
            resp.is_redirect = False
            mock_get.return_value = resp

            _follow_redirects_safely(
                "https://example.com",
                cached_etag="abc123",
                cached_last_modified="Wed, 21 Oct 2025 07:28:00 GMT",
            )

            call_args = mock_get.call_args
            headers = call_args.kwargs["headers"]
            assert headers["If-None-Match"] == "abc123"
            assert headers["If-Modified-Since"] == "Wed, 21 Oct 2025 07:28:00 GMT"

    def test_conditional_headers_only_on_first_request(self):
        """Conditional headers are NOT sent on redirect hops."""
        with patch("crawler.core.fetcher._SESSION.get") as mock_get:
            # First request: redirect response
            resp1 = Mock()
            resp1.is_redirect = True
            resp1.headers = {"Location": "https://example.com/redirect"}
            resp1.close = Mock()

            # Second request: final response
            resp2 = Mock()
            resp2.is_redirect = False
            resp2.headers = {}

            mock_get.side_effect = [resp1, resp2]

            _follow_redirects_safely("https://example.com", cached_etag="abc123")

            # Check both calls
            calls = mock_get.call_args_list
            assert len(calls) == 2

            # First call has conditional header
            assert calls[0].kwargs["headers"]["If-None-Match"] == "abc123"

            # Second call (redirect) has empty headers
            assert calls[1].kwargs["headers"] == {}


class TestAttemptFetchWithCache:
    """Test _attempt_fetch with 304 handling and header extraction."""

    def test_304_with_valid_cached_body(self):
        """304 response with valid cached body returns cached content and is_cached=True."""
        with patch("crawler.core.fetcher._follow_redirects_safely") as mock_fetch:
            resp = Mock()
            resp.status_code = 304
            resp.headers = {
                "ETag": "abc123",
                "Last-Modified": "Wed, 21 Oct 2025 07:28:00 GMT",
            }
            resp.encoding = None  # Mock needs real encoding attribute
            resp.apparent_encoding = "utf-8"
            resp.__enter__ = Mock(return_value=resp)
            resp.__exit__ = Mock(return_value=False)
            mock_fetch.return_value = resp

            cached_body = b"<html>cached</html>"
            html, is_cached, etag, last_modified = _attempt_fetch(
                "https://example.com",
                cached_etag="abc123",
                cached_body=cached_body,
            )

            assert html == "<html>cached</html>"
            assert is_cached is True
            assert etag == "abc123"
            assert last_modified == "Wed, 21 Oct 2025 07:28:00 GMT"

    def test_304_with_empty_cached_body(self):
        """304 response with empty cached body returns None."""
        with patch("crawler.core.fetcher._follow_redirects_safely") as mock_fetch:
            resp = Mock()
            resp.status_code = 304
            resp.headers = {}
            resp.__enter__ = Mock(return_value=resp)
            resp.__exit__ = Mock(return_value=False)
            mock_fetch.return_value = resp

            html, is_cached, etag, last_modified = _attempt_fetch(
                "https://example.com",
                cached_etag="abc123",
                cached_body=b"",  # empty
            )

            assert html is None
            assert is_cached is False

    def test_200_response_extracts_headers(self):
        """200 response extracts ETag and Last-Modified headers."""
        with patch("crawler.core.fetcher._follow_redirects_safely") as mock_fetch:
            with patch("crawler.core.fetcher._read_capped_body") as mock_body:
                resp = Mock()
                resp.status_code = 200
                resp.headers = {
                    "Content-Type": "text/html",
                    "ETag": "xyz789",
                    "Last-Modified": "Thu, 22 Oct 2025 08:30:00 GMT",
                }
                resp.encoding = None
                resp.apparent_encoding = "utf-8"
                resp.raise_for_status = Mock()
                resp.__enter__ = Mock(return_value=resp)
                resp.__exit__ = Mock(return_value=False)
                mock_fetch.return_value = resp
                mock_body.return_value = b"<html>new</html>"

                html, is_cached, etag, last_modified = _attempt_fetch(
                    "https://example.com"
                )

                assert html == "<html>new</html>"
                assert is_cached is False
                assert etag == "xyz789"
                assert last_modified == "Thu, 22 Oct 2025 08:30:00 GMT"

    def test_200_response_without_cache_headers(self):
        """200 response without ETag/Last-Modified returns None for those fields."""
        with patch("crawler.core.fetcher._follow_redirects_safely") as mock_fetch:
            with patch("crawler.core.fetcher._read_capped_body") as mock_body:
                resp = Mock()
                resp.status_code = 200
                resp.headers = {"Content-Type": "text/html"}  # No ETag/Last-Modified
                resp.encoding = None
                resp.apparent_encoding = "utf-8"
                resp.raise_for_status = Mock()
                resp.__enter__ = Mock(return_value=resp)
                resp.__exit__ = Mock(return_value=False)
                mock_fetch.return_value = resp
                mock_body.return_value = b"<html>new</html>"

                html, is_cached, etag, last_modified = _attempt_fetch(
                    "https://example.com"
                )

                assert html == "<html>new</html>"
                assert etag is None
                assert last_modified is None


class TestFetchPageWithCache:
    """Test fetch_page_with_cache workflow."""

    def test_cache_miss_saves_to_cache(self, tmp_path):
        """On cache miss (200 response), new content is saved to cache."""
        db_path = tmp_path / "test.db"
        from crawler.storage import init_db

        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        with patch("crawler.core.fetcher._attempt_fetch") as mock_attempt:
            html_content = "<html>test page</html>"
            mock_attempt.return_value = (
                html_content,
                False,
                "etag123",
                "Wed, 21 Oct 2025 07:28:00 GMT",
            )

            result = fetch_page_with_cache("https://example.com/page", cache_service)

            assert result == html_content

            # Verify cache was saved
            cached = cache_service.get_cache("https://example.com/page")
            assert cached is not None
            assert cached["etag"] == "etag123"
            assert cached["last_modified"] == "Wed, 21 Oct 2025 07:28:00 GMT"
            assert cached["response_body"] == html_content.encode("utf-8")

    def test_cache_hit_uses_conditional_headers(self, tmp_path):
        """On cache hit, conditional headers from cache are passed to _attempt_fetch."""
        db_path = tmp_path / "test.db"
        from crawler.storage import init_db

        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        # Pre-populate cache
        cache_service.save_cache(
            "https://example.com/page",
            "etag123",
            "Wed, 21 Oct 2025 07:28:00 GMT",
            None,
            b"<html>cached</html>",
        )

        with patch("crawler.core.fetcher._attempt_fetch") as mock_attempt:
            # Simulate 304 response (cache still valid)
            mock_attempt.return_value = (
                "<html>cached</html>",
                True,
                "etag123",
                "Wed, 21 Oct 2025 07:28:00 GMT",
            )

            result = fetch_page_with_cache("https://example.com/page", cache_service)

            assert result == "<html>cached</html>"

            # Verify conditional headers were passed (positional or keyword)
            call_args = mock_attempt.call_args
            # Called as: _attempt_fetch(url, cached_etag, cached_last_modified, cached_body)
            assert call_args.args[0] == "https://example.com/page"
            assert call_args.args[1] == "etag123"
            assert call_args.args[2] == "Wed, 21 Oct 2025 07:28:00 GMT"
            assert call_args.args[3] == b"<html>cached</html>"

    def test_fetch_failure_returns_none(self, tmp_path):
        """On fetch failure, function returns None."""
        db_path = tmp_path / "test.db"
        from crawler.storage import init_db

        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        with patch("crawler.core.fetcher._attempt_fetch") as mock_attempt:
            mock_attempt.side_effect = Exception("Network error")

            result = fetch_page_with_cache("https://example.com/page", cache_service)

            assert result is None

    def test_no_cache_headers_does_not_save(self, tmp_path):
        """When response has no ETag/Last-Modified, nothing is saved to cache."""
        db_path = tmp_path / "test.db"
        from crawler.storage import init_db

        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        with patch("crawler.core.fetcher._attempt_fetch") as mock_attempt:
            html_content = "<html>test</html>"
            # Response has no cache headers
            mock_attempt.return_value = (html_content, False, None, None)

            result = fetch_page_with_cache("https://example.com/page", cache_service)

            assert result == html_content

            # Cache should still be empty since no headers were present
            cached = cache_service.get_cache("https://example.com/page")
            assert cached is None

    def test_empty_cache_on_first_request(self, tmp_path):
        """First request to uncached URL passes None values for cache parameters."""
        db_path = tmp_path / "test.db"
        from crawler.storage import init_db

        init_db(str(db_path))
        cache_service = CacheService(str(db_path))

        with patch("crawler.core.fetcher._attempt_fetch") as mock_attempt:
            mock_attempt.return_value = ("<html>new</html>", False, "etag1", "date1")

            fetch_page_with_cache("https://example.com/page", cache_service)

            # Verify None values were passed initially (positional args, not kwargs)
            call_args = mock_attempt.call_args
            assert call_args.args[1] is None  # cached_etag
            assert call_args.args[2] is None  # cached_last_modified
            assert call_args.args[3] is None  # cached_body
