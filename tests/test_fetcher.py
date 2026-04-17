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
                 encoding: str | None = "utf-8",
                 apparent_encoding: str | None = "utf-8") -> MagicMock:
    """Build a MagicMock that quacks like a streaming requests.Response."""
    resp = MagicMock()
    resp.status_code = status
    # _follow_redirects_safely consults is_redirect; default False so the
    # tests don't enter the redirect loop unintentionally.
    resp.is_redirect = False
    resp.headers = {"Content-Type": content_type}
    if content_length is not None:
        resp.headers["Content-Length"] = content_length
    resp.encoding = encoding
    # apparent_encoding is consulted by _decode_body when the response
    # header lacks a charset. Set explicitly so MagicMock's auto-attr
    # doesn't return an un-decodable Mock object.
    resp.apparent_encoding = apparent_encoding
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
        # Pool config lives in the adapter's stored kwargs (public-ish
        # interface preserved across requests/urllib3 versions). Don't
        # reach into urllib3-private `_pool_maxsize`.
        kw = adapter.poolmanager.connection_pool_kw
        assert kw["maxsize"] == config.HTTP_POOL_MAXSIZE

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
    def test_uses_header_charset_when_present(self):
        """Content-Type with explicit charset wins over apparent_encoding."""
        body = "héllo".encode("latin-1")
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(
                body=body,
                content_type="text/html; charset=latin-1",
                encoding="latin-1",
                apparent_encoding="utf-8",  # would mis-decode
            )
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "héllo"

    def test_uses_apparent_encoding_when_header_lacks_charset(self):
        """No charset in header → use chardet's apparent_encoding (utf-8 for
        a UTF-8 page that requests would otherwise mojibake as latin-1)."""
        body = "中文".encode("utf-8")
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(
                body=body,
                content_type="text/html",  # no charset
                encoding="ISO-8859-1",  # what requests defaults to per RFC
                apparent_encoding="utf-8",
            )
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "中文"

    def test_falls_back_to_utf8_when_everything_missing(self):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(body=b"hello", encoding=None,
                                apparent_encoding=None)
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") == "hello"

    def test_unknown_encoding_falls_back_to_utf8(self):
        with patch.object(fetcher._SESSION, "get") as mock_get:
            resp = _mk_response(
                body=b"hi",
                content_type="text/html; charset=totally-fake",
                encoding="totally-fake-encoding",
            )
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


class TestNonRetryableExceptions:
    """Configuration / content errors return None immediately without
    burning ~13s of retry backoff."""

    @pytest.mark.parametrize("exc_cls,name", [
        ("InvalidURL", "InvalidURL"),
        ("MissingSchema", "MissingSchema"),
        ("InvalidSchema", "InvalidSchema"),
        ("URLRequired", "URLRequired"),
        ("TooManyRedirects", "TooManyRedirects"),
        ("SSLError", "SSLError"),
    ])
    def test_no_retry_on_permanent_failures(self, exc_cls, name):
        from requests import exceptions as rexc
        exc = getattr(rexc, exc_cls)("permanent")

        slept = []

        def fake_sleep(s):
            slept.append(s)

        with patch.object(fetcher._SESSION, "get",
                          side_effect=exc) as mock_get, \
             patch("crawler.core.fetcher.time.sleep", side_effect=fake_sleep):
            assert fetcher.fetch_page("https://example.com/x") is None
        # Exactly one attempt, zero backoff sleeps.
        assert mock_get.call_count == 1, f"{name} should not retry"
        assert slept == [], f"{name} should not sleep on backoff"

    def test_no_retry_on_chunked_encoding_error_mid_stream(self):
        """Body-stream corruption is permanent — retrying gets the same
        garbage back. Verifies the new exception happens AFTER headers OK
        but DURING iter_content."""
        from requests.exceptions import ChunkedEncodingError

        def explode_iter(*args, **kwargs):
            yield b"<html>"
            raise ChunkedEncodingError("connection reset mid-body")

        slept = []
        with patch.object(fetcher._SESSION, "get") as mock_get, \
             patch("crawler.core.fetcher.time.sleep",
                   side_effect=lambda s: slept.append(s)):
            resp = _mk_response()
            resp.iter_content.side_effect = explode_iter
            mock_get.return_value = resp
            assert fetcher.fetch_page("https://example.com/x") is None
        assert mock_get.call_count == 1
        assert slept == []


# ---------------------------------------------------------------------------
# SSRF gate: redirect-chain validation
# ---------------------------------------------------------------------------

class TestRedirectSafety:
    def _redirect_resp(self, location: str, status: int = 302) -> MagicMock:
        """A 30x response with a Location header. is_redirect=True so
        _follow_redirects_safely follows it (instead of treating it as
        the final response)."""
        r = MagicMock()
        r.status_code = status
        r.is_redirect = True
        r.headers = {"Location": location}
        r.close = MagicMock()
        return r

    def test_follows_redirect_chain_to_public_target(self, monkeypatch):
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", True)
        responses = [
            self._redirect_resp("https://example.com/final"),
            _mk_response(),
        ]

        def fake_get(url, **kwargs):
            return responses.pop(0)

        with patch.object(fetcher._SESSION, "get", side_effect=fake_get):
            assert fetcher.fetch_page("https://example.com/start") is not None

    def test_blocks_redirect_to_private_host(self, monkeypatch):
        """Public URL → 302 → AWS metadata IP must be refused without
        fetching the body. Classic SSRF chain."""
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", False)

        # Sequence: first request returns a 302 to the metadata IP. The
        # SSRF gate fires BEFORE the second request is issued.
        responses = [self._redirect_resp("http://169.254.169.254/latest/meta-data/")]

        def fake_get(url, **kwargs):
            return responses.pop(0)

        with patch.object(fetcher._SESSION, "get",
                          side_effect=fake_get) as mock_get, \
             patch("crawler.core.fetcher.time.sleep"):
            assert fetcher.fetch_page("https://public.example.com/x") is None
        # Exactly one GET fired — the would-be second hop was vetoed.
        assert mock_get.call_count == 1

    def test_blocks_redirect_chain_exceeding_cap(self, monkeypatch):
        """An infinite-redirect chain (or > MAX_REDIRECTS) is dropped."""
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", True)

        def fake_get(url, **kwargs):
            return self._redirect_resp("https://example.com/loop")

        with patch.object(fetcher._SESSION, "get",
                          side_effect=fake_get) as mock_get, \
             patch("crawler.core.fetcher.time.sleep"):
            assert fetcher.fetch_page("https://example.com/start") is None
        # MAX_REDIRECTS + 1 attempts before giving up.
        assert mock_get.call_count == config.MAX_REDIRECTS + 1

    def test_redirect_without_location_header_drops(self, monkeypatch):
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", True)

        bad = MagicMock()
        bad.status_code = 302
        bad.is_redirect = True
        bad.headers = {}  # no Location
        bad.close = MagicMock()

        with patch.object(fetcher._SESSION, "get", return_value=bad), \
             patch("crawler.core.fetcher.time.sleep"):
            assert fetcher.fetch_page("https://example.com/x") is None

    def test_relative_redirect_resolved_against_current_url(self, monkeypatch):
        """302 → '/path' (relative) must resolve against the current URL,
        not the original entry URL."""
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", True)

        responses = [
            self._redirect_resp("/relative-path"),
            _mk_response(),
        ]
        seen_urls: list[str] = []

        def fake_get(url, **kwargs):
            seen_urls.append(url)
            return responses.pop(0)

        with patch.object(fetcher._SESSION, "get", side_effect=fake_get):
            fetcher.fetch_page("https://example.com/start/here")

        assert seen_urls == [
            "https://example.com/start/here",
            "https://example.com/relative-path",
        ]
