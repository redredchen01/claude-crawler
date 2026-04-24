from __future__ import annotations

"""Page fetcher with Stealth 7.0 Arsenal.

Implements:
1. Proxy Matrix (IP Rotation)
2. UA-TLS Alignment
3. Organic Referer Injection
"""

import logging
import os
import random
import re
import ssl
import threading
import time
from urllib.parse import urlparse, urljoin

import requests
from crawler.config import (
    ALLOW_PRIVATE_HOSTS,
    HTML_CONTENT_TYPE_MARKERS,
    HTTP_POOL_CONNECTIONS,
    HTTP_POOL_MAXSIZE,
    HTTP_TIMEOUT,
    JS_BODY_MIN_LENGTH,
    MAX_RESPONSE_BYTES,
    MAX_REDIRECTS,
    RETRY_BACKOFF,
    RETRY_COUNT,
    USER_AGENT_POOL,
    PROXY_POOL,
    PROXY_ROTATION_ENABLED,
)
from crawler.core.url import is_private_host
from crawler.exceptions import NetworkError
from requests.adapters import HTTPAdapter

logger = logging.getLogger(__name__)
_SESSION = requests.Session()


class StealthAdapter(HTTPAdapter):
    """Aligns TLS fingerprints with User-Agent and handles Proxy configs."""

    def __init__(self, *args, **kwargs):
        self._ua = kwargs.pop("user_agent", USER_AGENT_POOL[0])
        super().__init__(*args, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        # UA-TLS Alignment
        if "Firefox" in self._ua:
            ciphers = [
                "TLS_AES_128_GCM_SHA256",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
            ]
        else:
            ciphers = [
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-CHACHA20-POLY1305",
            ]
        random.shuffle(ciphers)
        context.set_ciphers(":".join(ciphers))
        kwargs["ssl_context"] = context
        return super().init_poolmanager(*args, **kwargs)


class ProxyManager:
    """Intelligent proxy rotator with health tracking and cooldowns."""
    def __init__(self, proxies: list[str]):
        self.proxies = [{"url": p, "fails": 0, "cooldown_until": 0} for p in proxies]
        self._lock = threading.Lock()

    def get_proxy(self) -> str | None:
        if not self.proxies: return None
        with self._lock:
            now = time.time()
            available = [p for p in self.proxies if p["cooldown_until"] < now]
            if not available:
                # If all cooled down, pick the one with least fails
                available = sorted(self.proxies, key=lambda x: x["fails"])
            
            p = random.choice(available[:3]) # Top 3 healthy options
            return p["url"]

    def mark_fail(self, proxy_url: str, is_block: bool = False):
        with self._lock:
            for p in self.proxies:
                if p["url"] == proxy_url:
                    p["fails"] += 1
                    if is_block:
                        # 5 minute cooldown for WAF blocks
                        p["cooldown_until"] = time.time() + 300
                    break

_PROXY_MGR = ProxyManager(PROXY_POOL)


def _build_session(referer: str | None = None) -> requests.Session:
    sess, ua = requests.Session(), random.choice(USER_AGENT_POOL)
    adapter = StealthAdapter(
        pool_connections=HTTP_POOL_CONNECTIONS,
        pool_maxsize=HTTP_POOL_MAXSIZE,
        user_agent=ua,
    )
    sess.mount("http://", adapter)
    sess.mount("https://", adapter)

    # --- Unit H3: Proxy Matrix with Health Tracking ---
    current_proxy = _PROXY_MGR.get_proxy()
    if current_proxy:
        sess.proxies = {"http": current_proxy, "https": current_proxy}
        # Attach proxy info to session for error reporting
        sess.metadata = {"proxy": current_proxy}

    sess.headers.update(
        {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Referer": referer or "",
        }
    )
    return sess


_WAF_FINGERPRINTS = ("cloudflare", "akamai", "incapsula", "sucuri", "firewall")


def _classify_exception(exc):
    from requests.exceptions import (
        ConnectTimeout,
        ReadTimeout,
        SSLError,
        ConnectionError,
        HTTPError,
    )

    if isinstance(exc, ConnectTimeout):
        return "connection_timeout"
    if isinstance(exc, ReadTimeout):
        return "read_timeout"
    if isinstance(exc, SSLError):
        return "ssl_error"
    if isinstance(exc, ConnectionError):
        return "dns_failed"
    if isinstance(exc, HTTPError) and exc.response is not None:
        if exc.response.status_code == 403:
            t = (exc.response.text or "").lower()
            if any(f in t for f in _WAF_FINGERPRINTS):
                return "waf_blocked"
            return "forbidden"
        return f"http_{exc.response.status_code}"
    return "fetch_failed"


def _fetch_with_retry(url, fetch_fn, raise_on_failure=False, session=None):
    for attempt in range(RETRY_COUNT):
        try:
            return fetch_fn()
        except Exception as e:
            # Unit H3: Feedback to ProxyManager
            if session and hasattr(session, "metadata") and "proxy" in session.metadata:
                proxy = session.metadata["proxy"]
                is_block = "forbidden" in str(e).lower() or "waf" in str(e).lower()
                _PROXY_MGR.mark_fail(proxy, is_block=is_block)

            backoff = (
                RETRY_BACKOFF[attempt]
                if attempt < len(RETRY_BACKOFF)
                else RETRY_BACKOFF[-1]
            ) * random.uniform(0.8, 1.2)
            time.sleep(backoff)
    if raise_on_failure:
        raise NetworkError(f"Failed {url}", "fetch_failed")
    return None


def fetch_page_with_cache_tracking(
    url: str, cache_service, referer: str | None = None
) -> tuple[str | None, bool]:
    c = cache_service.get_cache(url)
    etag, lm, body = (
        (c["etag"] if c else None),
        (c["last_modified"] if c else None),
        (c["response_body"] if c else None),
    )

    # Strategy: Build a fresh organic session per top-level fetch if needed
    session = _build_session(referer=referer)

    def do():
        r = _follow_redirects_safely(session, url, etag, lm)
        if not r:
            return None, False, None, None
        with r:
            if r.status_code == 304:
                return (
                    (body.decode("utf-8", errors="replace") if body else None),
                    True,
                    etag,
                    lm,
                )
            r.raise_for_status()
            if not any(
                m in r.headers.get("Content-Type", "").lower()
                for m in HTML_CONTENT_TYPE_MARKERS
            ):
                return None, False, None, None
            b = r.content[:MAX_RESPONSE_BYTES]  # Simplified for Arsenal 7.0
            return (
                b.decode("utf-8", errors="replace"),
                False,
                r.headers.get("ETag"),
                r.headers.get("Last-Modified"),
            )

    res = _fetch_with_retry(url, do, raise_on_failure=False, session=session)
    logger.debug(f"fetch_page_with_cache_tracking result: {res}")
    if res and len(res) >= 2:
        # Unpack up to 4 values if present, but we only strictly need h, cached for return
        h, cached = res[0], res[1]
        if len(res) >= 4:
            et, lmod = res[2], res[3]
            if h and not cached and (et or lmod):
                cache_service.save_cache(url, et, lmod, None, h.encode("utf-8"))
        return h, cached
    
    # Try to diagnose the failure reason if possible
    reason = "fetch_failed"
    try:
        # Just a quick check to get a better reason if it was a DNS/SSL error
        _build_session().get(url, timeout=5)
    except Exception as e:
        reason = _classify_exception(e)
        
    raise NetworkError(f"Fetch failed for {url}", reason)


def _follow_redirects_safely(session_or_url, url=None, etag=None, lm=None, cached_etag=None, cached_last_modified=None):
    if isinstance(session_or_url, str):
        url = session_or_url
        session = _SESSION
        etag = cached_etag if cached_etag is not None else etag
        lm = cached_last_modified if cached_last_modified is not None else lm
    else:
        session = session_or_url
    curr, hdrs = url, {}
    if etag:
        hdrs["If-None-Match"] = etag
    if lm:
        hdrs["If-Modified-Since"] = lm
    for i in range(MAX_REDIRECTS + 1):
        if not ALLOW_PRIVATE_HOSTS and is_private_host(urlparse(curr).hostname):
            return None
        r = session.get(
            curr,
            timeout=HTTP_TIMEOUT,
            stream=True,
            allow_redirects=False,
            headers=(hdrs if i == 0 else {}),
        )
        if not r.is_redirect:
            return r
        loc = r.headers.get("Location")
        r.close()
        if not loc:
            return None
        curr = urljoin(curr, loc)
    return None


def fetch_page(url, **kwargs):
    s = _build_session()
    res = _fetch_with_retry(url, lambda: _follow_redirects_safely(s, url))
    return res.text if res else None


def download_asset(url: str, save_path: str, timeout: tuple = (5, 30)) -> bool:
    """Download a binary asset (image, etc.) to the local filesystem with validation.
    
    Returns True if successful and valid, False otherwise.
    """
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    s = _build_session()
    try:
        r = _fetch_with_retry(url, lambda: s.get(url, timeout=timeout, stream=True))
        if not r or r.status_code != 200:
            return False
            
        # R17: Content-Type Validation
        ctype = r.headers.get("Content-Type", "").lower()
        if "image" not in ctype and "octet-stream" not in ctype:
            logger.warning(f"Rejected non-image asset from {url} (Type: {ctype})")
            return False

        with open(save_path, 'wb') as f:
            size = 0
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    size += len(chunk)
        
        # Ensure file isn't empty or tiny (e.g. tracking pixels are usually < 100 bytes)
        if size < 200:
            if os.path.exists(save_path): os.remove(save_path)
            return False
            
        return True
    except Exception as e:
        logger.error(f"Failed to download asset {url}: {e}")
        if os.path.exists(save_path): os.remove(save_path)
        return False


def _read_capped_body(resp):
    return resp.content[:MAX_RESPONSE_BYTES]


def needs_js_rendering(html: str) -> bool:
    """Smart detection of pages requiring JavaScript rendering."""
    if not html: return True
    
    # R18: Direct markers (Strong)
    markers = ("__NEXT_DATA__", "data-reactroot", "__nuxt", "document.getElementById('root')", "react-root")
    if any(x in html for x in markers):
        return True
        
    # R28: Splash Page / JS Wall detection (Heuristic)
    # If text content is very short but scripts are present
    text_only = re.sub(r'<script.*?</script>|<style.*?</style>|<.*?>', '', html, flags=re.S).strip()
    if len(text_only) < 300:
        if "javascript" in html.lower() and ("enable" in html.lower() or "required" in html.lower()):
            return True
            
    return len(html) < JS_BODY_MIN_LENGTH


def _attempt_fetch(url, cached_etag=None, cached_last_modified=None, cached_body=None):
    """Backward-compat wrapper — delegates to _fetch_with_retry + _follow_redirects_safely."""
    s = _build_session()
    result = _fetch_with_retry(
        url,
        lambda: _follow_redirects_safely(s, url, cached_etag, cached_last_modified),
    )
    if result is None:
        return None, False, None, None
    if result.status_code == 304:
        if cached_body:
            return cached_body.decode("utf-8", errors="replace"), True, result.headers.get("ETag"), result.headers.get("Last-Modified")
        return None, False, None, None
    body = _read_capped_body(result).decode("utf-8", errors="replace")
    etag = result.headers.get("ETag")
    lm = result.headers.get("Last-Modified")
    return body, False, etag, lm


def fetch_page_with_cache(url: str, cache_service, referer: str | None = None):
    try:
        cached = cache_service.get_cache(url)
        etag = cached["etag"] if cached else None
        last_modified = cached["last_modified"] if cached else None
        body = cached["response_body"] if cached else None
        html, is_cached, new_etag, new_last_modified = _attempt_fetch(
            url, etag, last_modified, body
        )
    except Exception:
        return None
    if html is None:
        return None
    if not is_cached and (new_etag or new_last_modified):
        cache_service.save_cache(url, new_etag, new_last_modified, None, html.encode("utf-8"))
    return html
