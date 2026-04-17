"""Page fetcher with retry logic and JS rendering detection."""

import logging
import time
import re

import requests

from crawler.config import USER_AGENT, RETRY_COUNT, RETRY_BACKOFF, JS_BODY_MIN_LENGTH

logger = logging.getLogger(__name__)

# JS framework markers that indicate the page needs client-side rendering
_JS_MARKERS = ("__NEXT_DATA__", "data-reactroot", "__nuxt")


def fetch_page(url: str, use_playwright: bool = False) -> str | None:
    """Fetch HTML content from a URL via plain HTTP.

    The ``use_playwright`` flag is **deprecated and ignored** — JS rendering
    now flows through :class:`crawler.core.render.RenderThread`. The flag
    remains for backward-compatible call sites until the engine refactor
    (Unit 7) replaces them with explicit render-thread submits.

    Returns HTML string or ``None`` on failure.
    """
    if use_playwright:
        logger.debug(
            "fetch_page(use_playwright=True) is a no-op; "
            "route to RenderThread instead (url=%s)", url,
        )

    for attempt in range(RETRY_COUNT):
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.text

        except Exception as exc:
            backoff = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
            logger.warning("Fetch attempt %d/%d failed for %s: %s (backoff %ds)",
                           attempt + 1, RETRY_COUNT, url, exc, backoff)
            if attempt < RETRY_COUNT - 1:
                time.sleep(backoff)

    logger.error("All %d fetch attempts failed for %s", RETRY_COUNT, url)
    return None


def needs_js_rendering(html: str) -> bool:
    """Return True if page likely needs JS rendering.

    Checks: body text shorter than threshold or contains JS framework markers.
    """
    # Extract body text (strip tags)
    body_match = re.search(r"<body[^>]*>(.*)</body>", html, re.DOTALL | re.IGNORECASE)
    if body_match:
        body_html = body_match.group(1)
    else:
        body_html = html

    # Strip HTML tags to get plain text length
    text = re.sub(r"<[^>]+>", "", body_html)
    text = text.strip()

    if len(text) < JS_BODY_MIN_LENGTH:
        return True

    for marker in _JS_MARKERS:
        if marker in html:
            return True

    return False
