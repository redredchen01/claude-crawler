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

import requests
from requests.adapters import HTTPAdapter

from crawler.config import (
    HTML_CONTENT_TYPE_MARKERS, HTTP_POOL_CONNECTIONS, HTTP_POOL_MAXSIZE,
    HTTP_TIMEOUT, JS_BODY_MIN_LENGTH, MAX_RESPONSE_BYTES, RETRY_BACKOFF,
    RETRY_COUNT, USER_AGENT,
)

logger = logging.getLogger(__name__)

_JS_MARKERS = ("__NEXT_DATA__", "data-reactroot", "__nuxt")
_STREAM_CHUNK_BYTES = 64 * 1024


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
    """Stream the response body up to ``MAX_RESPONSE_BYTES``; ``None`` past cap."""
    cl = resp.headers.get("Content-Length")
    if cl:
        try:
            if int(cl) > MAX_RESPONSE_BYTES:
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
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _attempt_fetch(url: str) -> str | None:
    """One fetch attempt. Returns HTML, or ``None`` on any drop reason.

    Drop reasons: HTTP error, non-HTML Content-Type, body over cap, request
    error. Each path logs at debug/warning level so a zero-resource scan can
    be diagnosed from the logs without code changes.
    """
    with _SESSION.get(url, timeout=HTTP_TIMEOUT, stream=True) as resp:
        resp.raise_for_status()

        ctype = resp.headers.get("Content-Type", "")
        if not _content_type_is_html(ctype):
            logger.debug("Skipping non-HTML response (%s) for %s", ctype, url)
            return None

        body = _read_capped_body(resp)
        if body is None:
            logger.warning(
                "Response body exceeded cap (%d bytes) for %s — dropped",
                MAX_RESPONSE_BYTES, url,
            )
            return None

        encoding = resp.encoding or "utf-8"
        try:
            return body.decode(encoding, errors="replace")
        except LookupError:
            # Response declared an encoding Python doesn't recognize.
            return body.decode("utf-8", errors="replace")


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
            return _attempt_fetch(url)
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
