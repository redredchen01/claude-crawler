"""Tests for crawler.core.fetcher — connection pooling, content-type filter,
size cap, retry behavior."""

from unittest.mock import MagicMock, patch

import pytest

from crawler import config
from crawler.core import fetcher


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mk_response(*, status: int = 200, content_type: str = "text/html",
                 body: bytes = b"<html><body>hi</body></html>",
                 content_length: str | None = None,
                 encoding: str | None = "utf-8") -> MagicMock:
    """Build a MagicMock that quacks like a streaming requests.Response."""
    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"Content-Type": content_type}
    if content_length is not None:
        resp.headers["Content-Length"] = content_length
    resp.encoding = encoding
    if status >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status}")
    else:
        resp.raise_for_status.return_value = None
    # iter_content yields the body in one chunk (helpers can override).
    resp.iter_content.return_value = iter([body])
    # Context manager support for `with session.get(...) as resp:`
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


# ---------------------------------------------------------------------------
# Session reuse — connection pooling guarantee
# ---------------------------------------------------------------------------

class TestSessionReuse:
    def test_module_session_is_singleton(self):
        s1 = fetcher._SESSION
        s2 = fetcher._SESSION
        assert s1 is s2

    def test_session_uses_pooled_adapter(self):
        adapter = fetcher._SESSION.get_adapter("https://example.com/")
        # The pool's connection cap reflects HTTP_POOL_MAXSIZE.
        assert adapter._pool_maxsize == config.HTTP_POOL_MAXSIZE

    def test_fetch_routes_through_module_session(self):
        """Multiple calls go through the same Session, not new ones."""
        with patch.object(fetcher._SESSION, "get") as mock_get:
            mock_get.return_value = _mk_response()
            fetcher.fetch_page("https://example.com/a")
            fetcher.fetch_page("https://example.com/b")
            assert mock_get.call_count == 2


# ---------------------------------------------------------------------------
# Content-Type filter — non-HTML must be dropped
# ---------------------------------------------------------------------------

class TestContentTypeFilter:
    @pytest.mark.parametrize("ctype", [
        "image/jpeg",
        "image/png",
        "video/mp4",
        "application/pdf",
        "application/zip",
        "application/octet-stream",
    ])
    def test_drops_binary_content_types(self, ctype):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            mock_get.return_value = _mk_response(content_type=ctype)
            assert fetcher.fetch_page("https://example.com/x") is None

    @pytest.mark.parametrize("ctype", [
        "text/html",
        "text/html; charset=utf-8",
        "application/xhtml+xml",
        "application/xml",
        "text/plain",
    ])
    def test_accepts_html_xml_plaintext(self, ctype):
        body = b"<html><body>ok</body></html>"
        with patch.object(fetcher._SESSION, "get") as mock_get:
            mock_get.return_value = _mk_response(
                content_type=ctype, body=body,
            )
            assert fetcher.fetch_page("https://example.com/x") is not None

    def test_missing_content_type_is_permissive(self):
        """Some small CMSes omit Content-Type. Don't drop those — try parsing."""
        with patch.object(fetcher._SESSION, "get") as mock_get:
            mock_get.return_value = _mk_response(content_type="")
            assert fetcher.fetch_page("https://example.com/x") is not None


# ---------------------------------------------------------------------------
# Response size cap — defends against megabyte responses
# ---------------------------------------------------------------------------

class TestResponseSizeCap:
    def test_drops_via_content_length_header(self):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            mock_get.return_value = _mk_response(
                content_length=str(config.MAX_RESPONSE_BYTES + 1),
            )
            assert fetcher.fetch_page("https://example.com/x") is None

    def test_drops_via_streaming_when_no_content_length(self):
        """Server omits Content-Length but body grows past cap mid-stream."""
        # 3 chunks each 4MB → exceeds 5MB cap on the second chunk.
        big_chunk = b"x" * (4 * 1024 * 1024)
        chunks = [big_chunk, big_chunk, big_chunk]
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response()
            resp.headers.pop("Content-Length", None)
            resp.iter_content.return_value = iter(chunks)
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") is None

    def test_allows_body_at_cap(self):
        """Exactly-at-cap (≤ MAX_RESPONSE_BYTES) is allowed through."""
        body = b"a" * config.MAX_RESPONSE_BYTES
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(body=body)
            resp.headers.pop("Content-Length", None)
            mock_get.return_value = resp
            result = fetcher.fetch_page("https://example.com/x")
            assert result is not None
            assert len(result) == config.MAX_RESPONSE_BYTES

    def test_malformed_content_length_falls_through(self):
        """Garbage Content-Length doesn't crash the fetcher; streaming still
        applies and a small body succeeds."""
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(content_length="not-a-number")
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") is not None


# ---------------------------------------------------------------------------
# Encoding handling
# ---------------------------------------------------------------------------

class TestEncoding:
    def test_decodes_using_response_encoding(self):
        body = "héllo".encode("latin-1")
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(body=body, encoding="latin-1")
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "héllo"

    def test_falls_back_when_encoding_missing(self):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(body=b"hello", encoding=None)
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "hello"

    def test_unknown_encoding_falls_back_to_utf8(self):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(body=b"hi", encoding="totally-fake-encoding")
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "hi"


# ---------------------------------------------------------------------------
# Retry / failure behavior
# ---------------------------------------------------------------------------

class TestRetry:
    def test_retries_then_returns_none(self):
        with patch.object(fetcher._SESSION, "get",
                          side_effect=Exception("net down")) as mock_get, \
             patch("crawler.core.fetcher.time.sleep"):  # don't actually sleep
            result = fetcher.fetch_page("https://example.com/x")
        assert result is None
        assert mock_get.call_count == config.RETRY_COUNT

    def test_succeeds_on_second_attempt(self):
        attempts = [Exception("blip"), _mk_response()]

        def side_effect(*args, **kwargs):
            v = attempts.pop(0)
            if isinstance(v, Exception):
                raise v
            return v

        with patch.object(fetcher._SESSION, "get",
                          side_effect=side_effect), \
             patch("crawler.core.fetcher.time.sleep"):
            assert fetcher.fetch_page("https://example.com/x") is not None

    def test_http_error_returns_none(self):
        with patch.object(fetcher._SESSION, "get") as mock_get, \
             patch("crawler.core.fetcher.time.sleep"):
            mock_get.return_value = _mk_response(status=500)
            assert fetcher.fetch_page("https://example.com/x") is None
