"""Page fetcher with retry logic, connection pooling, and JS rendering detection.

Module-level :class:`requests.Session` reuses TCP+TLS connections across all
worker threads, so a 200-page same-domain crawl pays the handshake cost once
per host instead of once per page (~10-40s saved at typical RTTs).

`fetch_page` also defends against two waste paths:
  - Non-HTML responses are dropped after the headers come back (Content-Type
    check). The Frontier already filters URLs by extension, but this catches
    extension-less URLs (`/download?id=123`) that would otherwise burn a
    full body download + parser pass on a binary blob.
  - Bodies larger than ``MAX_RESPONSE_BYTES`` are stream-aborted. A hostile
    page can't pull megabytes through a worker thread.
"""

import logging
import re
import time
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from requests.exceptions import (
    ChunkedEncodingError, ContentDecodingError, InvalidSchema, InvalidURL,
    MissingSchema, SSLError, TooManyRedirects, URLRequired,
)

from crawler import config
from crawler.config import (
    HTML_CONTENT_TYPE_MARKERS, HTTP_POOL_CONNECTIONS, HTTP_POOL_MAXSIZE,
    HTTP_TIMEOUT, JS_BODY_MIN_LENGTH, MAX_RESPONSE_BYTES, RETRY_BACKOFF,
    RETRY_COUNT, USER_AGENT,
)
from crawler.core.url import is_private_host

# ALLOW_PRIVATE_HOSTS and MAX_REDIRECTS are read via `config.NAME` at call
# time (not imported as constants) so tests and operators can flip them
# without re-importing the module.

logger = logging.getLogger(__name__)

_JS_MARKERS = ("__NEXT_DATA__", "data-reactroot", "__nuxt")
_STREAM_CHUNK_BYTES = 64 * 1024

# Non-retryable: configuration errors, redirect loops, body-stream corruption.
# Returning None immediately (vs. retrying 3× with backoff) saves up to 13s
# per request and keeps the failure_reason classifier from drowning real
# transient blips in permanent-failure noise.
_NO_RETRY_EXCEPTIONS = (
    InvalidURL, InvalidSchema, MissingSchema, URLRequired,
    TooManyRedirects, SSLError, ChunkedEncodingError, ContentDecodingError,
)


def _build_session() -> requests.Session:
    """Build the shared Session with a tuned connection pool.

    ``max_retries=0`` because retry/backoff is handled in :func:`fetch_page`
    (so we get logging + observability per attempt rather than urllib3's
    silent internal retry).
    """
    sess = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=HTTP_POOL_CONNECTIONS,
        pool_maxsize=HTTP_POOL_MAXSIZE,
        max_retries=0,
        # pool_block=False (default): when a host's pool is saturated, urllib3
        # creates a fresh ad-hoc connection rather than blocking the worker.
        # The ad-hoc connection isn't pooled (closed after use) — explicit
        # here so the choice survives the next reviewer asking about it.
        pool_block=False,
    )
    sess.mount("http://", adapter)
    sess.mount("https://", adapter)
    sess.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "text/plain;q=0.5,*/*;q=0.1"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
    })
    return sess


# Module-level singleton — thread-safe via HTTPAdapter's pool. Tests can
# replace this via ``crawler.core.fetcher._SESSION = ...`` if they need to
# inject a mock without monkeypatching every call site.
_SESSION = _build_session()


def _content_type_is_html(content_type: str) -> bool:
    """True when the response can plausibly be parsed as HTML/XML/plaintext.

    Permissive when the header is missing or empty — many small CMSes omit
    Content-Type entirely and we'd rather attempt a parse than drop a real
    page. Strict when the header is present and clearly binary.
    """
    if not content_type:
        return True
    lowered = content_type.lower()
    return any(marker in lowered for marker in HTML_CONTENT_TYPE_MARKERS)


def _read_capped_body(resp: requests.Response) -> bytes | None:
    """Stream the response body up to ``MAX_RESPONSE_BYTES``; ``None`` past cap.

    On cap-exceeded, explicitly closes the response. urllib3 won't return a
    half-read connection to the pool — being explicit makes the connection
    drop deterministic instead of relying on ``__exit__`` semantics that
    sometimes try (and fail) to drain first.
    """
    cl = resp.headers.get("Content-Length")
    if cl:
        try:
            if int(cl) > MAX_RESPONSE_BYTES:
                resp.close()
                return None
        except ValueError:
            pass  # malformed Content-Length: fall through to streaming check

    chunks: list[bytes] = []
    total = 0
    for chunk in resp.iter_content(chunk_size=_STREAM_CHUNK_BYTES):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_RESPONSE_BYTES:
            resp.close()
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _decode_body(resp: requests.Response, body: bytes) -> str:
    """Decode ``body`` using the best available encoding signal.

    ``requests`` defaults ``resp.encoding`` to ``ISO-8859-1`` when the
    server returns ``Content-Type: text/html`` with no charset (per
    RFC 2616) — applied blindly that mojibakes UTF-8 pages. Use
    ``apparent_encoding`` (chardet) when the header is silent on charset.
    """
    encoding = resp.encoding
    ctype = resp.headers.get("Content-Type", "").lower()
    if encoding is None or "charset=" not in ctype:
        # apparent_encoding triggers chardet on the body — only call it
        # when the header genuinely doesn't tell us.
        encoding = resp.apparent_encoding or encoding or "utf-8"
    try:
        return body.decode(encoding, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def _follow_redirects_safely(url: str, cached_etag: str | None = None,
                            cached_last_modified: str | None = None) -> requests.Response | None:
    """GET ``url``, following redirects manually so each hop's host can be
    SSRF-checked. Returns the final 2xx Response (caller closes), or None
    if a hop targets a private host or the chain exceeds MAX_REDIRECTS.

    With ``allow_redirects=False`` we still get cookies/headers handled by
    the Session — the only thing we lose is automatic Location handling,
    which we recreate with explicit per-hop validation.

    Conditional request headers (If-None-Match, If-Modified-Since) are sent
    on the first request only — cached validators apply to the original URL,
    not redirects.
    """
    from urllib.parse import urljoin
    current = url
    headers = {}
    if cached_etag:
        headers["If-None-Match"] = cached_etag
    if cached_last_modified:
        headers["If-Modified-Since"] = cached_last_modified

    for i, _ in enumerate(range(config.MAX_REDIRECTS + 1)):
        if not config.ALLOW_PRIVATE_HOSTS:
            host = urlparse(current).hostname
            if is_private_host(host):
                logger.warning(
                    "Refusing fetch — host %r is private/loopback (SSRF gate). "
                    "URL=%s", host, current,
                )
                return None
        # Conditional headers only on the first request.
        req_headers = headers if i == 0 else {}
        resp = _SESSION.get(
            current, timeout=HTTP_TIMEOUT, stream=True, allow_redirects=False,
            headers=req_headers,
        )
        if not resp.is_redirect:
            return resp
        location = resp.headers.get("Location")
        resp.close()
        if not location:
            return None
        # Resolve relative redirects against the URL we just hit.
        current = urljoin(current, location)
    logger.warning("Redirect chain exceeded MAX_REDIRECTS=%d for %s",
                   config.MAX_REDIRECTS, url)
    return None


def _attempt_fetch(url: str, cached_etag: str | None = None,
                  cached_last_modified: str | None = None,
                  cached_body: bytes | None = None) -> tuple[str | None, bool, str | None, str | None]:
    """One fetch attempt with optional cache validation.

    Returns (html or None, is_cached, etag, last_modified).

    Drop reasons: HTTP error, non-HTML Content-Type, body over cap, request
    error, SSRF gate (private/loopback host in the redirect chain). Each
    path logs at debug/warning level so a zero-resource scan can be
    diagnosed from the logs without code changes.

    If cached_etag or cached_last_modified are provided, sends conditional
    headers (If-None-Match, If-Modified-Since) and returns cached_body on 304.
    """
    resp = _follow_redirects_safely(url, cached_etag=cached_etag,
                                   cached_last_modified=cached_last_modified)
    if resp is None:
        return None, False, None, None

    with resp:
        etag = resp.headers.get("ETag")
        last_modified = resp.headers.get("Last-Modified")

        # Handle 304 Not Modified
        if resp.status_code == 304:
            if cached_body is not None and len(cached_body) > 0:
                logger.debug("Cache hit (304) for %s", url)
                return _decode_body(resp, cached_body), True, etag, last_modified
            else:
                logger.warning("304 response but cached_body is empty for %s", url)
                return None, False, None, None

        resp.raise_for_status()

        ctype = resp.headers.get("Content-Type", "")
        if not _content_type_is_html(ctype):
            logger.debug("Skipping non-HTML response (%s) for %s", ctype, url)
            return None, False, None, None

        body = _read_capped_body(resp)
        if body is None:
            logger.warning(
                "Response body exceeded cap (%d bytes) for %s — dropped",
                MAX_RESPONSE_BYTES, url,
            )
            return None, False, None, None

        return _decode_body(resp, body), False, etag, last_modified


def fetch_page(url: str, use_playwright: bool = False) -> str | None:
    """Fetch HTML content from a URL via plain HTTP.

    The ``use_playwright`` flag is **deprecated and ignored** — JS rendering
    flows through :class:`crawler.core.render.RenderThread`. The flag remains
    for backward-compatible call sites until the engine refactor finishes.

    Returns HTML string, or ``None`` if the page could not be fetched as
    HTML (HTTP error, non-HTML Content-Type, body over cap, network error).
    """
    if use_playwright:
        logger.debug(
            "fetch_page(use_playwright=True) is a no-op; "
            "route to RenderThread instead (url=%s)", url,
        )

    for attempt in range(RETRY_COUNT):
        try:
            html, _, _, _ = _attempt_fetch(url)
            return html
        except _NO_RETRY_EXCEPTIONS as exc:
            # Permanent failure: malformed URL, redirect loop, SSL handshake
            # failure, body-stream corruption. Retrying just burns backoff time.
            logger.warning("Non-retryable fetch failure for %s: %s", url, exc)
            return None
        except Exception as exc:
            backoff = (
                RETRY_BACKOFF[attempt]
                if attempt < len(RETRY_BACKOFF)
                else RETRY_BACKOFF[-1]
            )
            logger.warning(
                "Fetch attempt %d/%d failed for %s: %s (backoff %ds)",
                attempt + 1, RETRY_COUNT, url, exc, backoff,
            )
            if attempt < RETRY_COUNT - 1:
                time.sleep(backoff)

    logger.error("All %d fetch attempts failed for %s", RETRY_COUNT, url)
    return None


def fetch_page_with_cache_tracking(url: str, cache_service) -> tuple[str | None, bool]:
    """Fetch HTML with HTTP caching and return cache status.

    Returns:
        (html, was_cached) tuple. was_cached is True if response came from 304 Not Modified.
    """
    cached = cache_service.get_cache(url)
    cached_etag = cached["etag"] if cached else None
    cached_last_modified = cached["last_modified"] if cached else None
    cached_body = cached["response_body"] if cached else None

    for attempt in range(RETRY_COUNT):
        try:
            html, is_cached, etag, last_modified = _attempt_fetch(
                url, cached_etag, cached_last_modified, cached_body)
            if html is not None and not is_cached:
                # New/updated response: save to cache for future requests.
                if etag or last_modified:
                    cache_service.save_cache(url, etag, last_modified, None,
                                           html.encode("utf-8"))
            return html, is_cached
        except _NO_RETRY_EXCEPTIONS as exc:
            logger.warning("Non-retryable fetch failure for %s: %s", url, exc)
            return None, False
        except Exception as exc:
            backoff = (
                RETRY_BACKOFF[attempt]
                if attempt < len(RETRY_BACKOFF)
                else RETRY_BACKOFF[-1]
            )
            logger.warning(
                "Fetch attempt %d/%d failed for %s: %s (backoff %ds)",
                attempt + 1, RETRY_COUNT, url, exc, backoff,
            )
            if attempt < RETRY_COUNT - 1:
                time.sleep(backoff)

    logger.error("All %d fetch attempts failed for %s", RETRY_COUNT, url)
    return None, False


def fetch_page_with_cache(url: str, cache_service) -> str | None:
    """Fetch HTML with HTTP caching support via ETag and Last-Modified headers.

    Implements conditional requests: if a cached response exists, sends
    If-None-Match/If-Modified-Since headers. On 304 Not Modified, returns
    cached body. On 200 OK, saves new response to cache.

    Args:
        url: The URL to fetch.
        cache_service: CacheService instance for cache persistence.

    Returns:
        HTML string, or None if fetch failed.
    """
    cached = cache_service.get_cache(url)
    cached_etag = cached["etag"] if cached else None
    cached_last_modified = cached["last_modified"] if cached else None
    cached_body = cached["response_body"] if cached else None

    for attempt in range(RETRY_COUNT):
        try:
            html, is_cached, etag, last_modified = _attempt_fetch(
                url, cached_etag, cached_last_modified, cached_body)
            if html is not None and not is_cached:
                # New/updated response: save to cache for future requests.
                if etag or last_modified:
                    cache_service.save_cache(url, etag, last_modified, None,
                                           html.encode("utf-8"))
            return html
        except _NO_RETRY_EXCEPTIONS as exc:
            logger.warning("Non-retryable fetch failure for %s: %s", url, exc)
            return None
        except Exception as exc:
            backoff = (
                RETRY_BACKOFF[attempt]
                if attempt < len(RETRY_BACKOFF)
                else RETRY_BACKOFF[-1]
            )
            logger.warning(
                "Fetch attempt %d/%d failed for %s: %s (backoff %ds)",
                attempt + 1, RETRY_COUNT, url, exc, backoff,
            )
            if attempt < RETRY_COUNT - 1:
                time.sleep(backoff)

    logger.error("All %d fetch attempts failed for %s", RETRY_COUNT, url)
    return None


def needs_js_rendering(html: str) -> bool:
    """Return True if page likely needs JS rendering.

    Checks: body text shorter than threshold or contains JS framework markers.
    """
    body_match = re.search(r"<body[^>]*>(.*)</body>", html, re.DOTALL | re.IGNORECASE)
    body_html = body_match.group(1) if body_match else html

    text = re.sub(r"<[^>]+>", "", body_html).strip()

    if len(text) < JS_BODY_MIN_LENGTH:
        return True

    return any(marker in html for marker in _JS_MARKERS)
