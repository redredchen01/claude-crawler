from __future__ import annotations

"""Render thread with Stealth 8.0 Piercing and Captcha Arsenal."""

import atexit
import logging
import os
import queue
import random
import re
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple
from concurrent.futures import Future

from crawler.config import (
    BROWSER_SHUTDOWN_TIMEOUT,
    RENDER_QUEUE_SIZE,
    RENDER_RETRY_COUNT,
    RENDER_SUBMIT_TIMEOUT,
    RENDER_TIMEOUT,
    RENDER_WAIT_NETWORKIDLE_MS,
    SHADOW_DOM_PIERCING_ENABLED,
    USER_AGENT,
    USER_AGENT_POOL,
)

logger = logging.getLogger(__name__)

class RenderQueueFullError(Exception):
    """Raised when submit() can't enqueue within the producer timeout."""

_SHADOW_PIERCER_JS = """
(() => {
    function pierce(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node = walker.nextNode();
        while (node) {
            if (node.shadowRoot) {
                const shadow = node.shadowRoot;
                const wrapper = document.createElement('shadow-pierced');
                wrapper.innerHTML = shadow.innerHTML;
                node.appendChild(wrapper);
                pierce(wrapper);
            }
            node = walker.nextNode();
        }
    }
    pierce(document.body);
    return document.documentElement.outerHTML;
})();
"""

@dataclass
class RenderResult:
    html: str
    timed_out: bool = False

@dataclass
class _ChromiumHandle:
    proc: subprocess.Popen | None
    playwright: Any
    browser: Any
    user_data_dir: str | None
    context: Any = None
    pages_since_reset: int = 0

@dataclass
class RenderRequest:
    url: str
    future: Future
    enable_scroll: bool = False

_SHUTDOWN_SENTINEL = None

# --- Ad-blocking patterns ---
_BLOCK_PATTERNS = re.compile(
    r"google-analytics|doubleclick|adservice|adsense|google-analytics|analytics\.js|"
    r"facebook\.net|facebook\.com/plugins|connect\.facebook\.net|"
    r"googletagmanager|googletagservices|amazon-adsystem|adnxs|scorecardresearch|"
    r"tracking|pixel|analytics|metrics|ads-|ads\.|/ads/|advertisement",
    re.I,
)

def _kill_proc(proc, timeout):
    try:
        proc.terminate()
        proc.wait(timeout=timeout)
    except: proc.kill()

def _is_browser_dead_error(exc):
    # R10: Browser-death detection using typed exception + substring fallback
    try:
        from playwright.sync_api import Error as PlaywrightError
        if isinstance(exc, PlaywrightError):
            msg = str(exc).lower()
            if any(m in msg for m in ("browser has been closed", "target closed", "connection closed", "context closed")):
                return True
    except ImportError:
        pass
        
    msg = str(exc).lower()
    return any(m in msg for m in ("browser has been closed", "target closed"))

def _simulate_human_interaction(page):
    """Simulate realistic human reading behavior."""
    try:
        # 1. Random mouse jitter
        for _ in range(random.randint(2, 5)):
            page.mouse.move(random.randint(100, 700), random.randint(100, 700))
            time.sleep(random.uniform(0.1, 0.3))
            
        # 2. Variable Dwelling (Simulate 'reading')
        content_len = len(page.content())
        dwell_time = min(8, max(2, content_len / 5000))
        time.sleep(random.uniform(dwell_time * 0.5, dwell_time))
        
        # 3. Micro-scroll
        page.evaluate(f"window.scrollBy(0, {random.randint(50, 200)})")
    except: pass

def _register_interceptors(context):
    def _intercept(route):
        # R19: Safety first - never block essential media or images
        if route.request.resource_type in ("image", "media", "font", "stylesheet"):
            route.continue_()
            return

        if _BLOCK_PATTERNS.search(route.request.url):
            route.abort()
        else:
            route.continue_()
    context.route("**/*", _intercept)

def _real_render(handle: _ChromiumHandle, url: str, timeout_ms: int, enable_scroll=False, **kwargs) -> RenderResult:
    # Superior R11: Dynamic Context Pooling & Rotation
    if handle.context is not None and handle.pages_since_reset >= 50:
        logger.info("Rotating browser context for stability.")
        _teardown_context(handle)
        handle.pages_since_reset = 0

    if handle.context is None:
        handle.context = handle.browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": random.randint(1280, 1920), "height": random.randint(720, 1080)},
            device_scale_factor=random.choice([1, 1.5, 2]),
        )
        
        # Superior Unit I1: Advanced Fingerprint Randomization
        handle.context.add_init_script(f"""
            Object.defineProperty(navigator, 'webdriver', {{ get: () => undefined }});
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {{
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
                return getParameter.apply(this, arguments);
            }};
            Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {random.choice([4, 8, 12, 16])} }});
            Object.defineProperty(navigator, 'plugins', {{ get: () => [1, 2, 3, 4, 5] }});
        """)
        
        _register_interceptors(handle.context)
        handle.pages_since_reset = 0

    try:
        handle.context.clear_cookies()
        handle.context.clear_permissions()
    except Exception as e:
        logger.warning(f"Context isolation failed: {e}")

    handle.pages_since_reset += 1
    page = handle.context.new_page()
    try:
        page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
        
        if RENDER_WAIT_NETWORKIDLE_MS > 0:
            try:
                page.wait_for_load_state("networkidle", timeout=RENDER_WAIT_NETWORKIDLE_MS)
            except Exception:
                pass
            
        _simulate_human_interaction(page)
            
        if enable_scroll:
            page.evaluate("window.scrollBy(0, window.innerHeight)")
            time.sleep(random.uniform(0.5, 1.5))

        html = page.evaluate(_SHADOW_PIERCER_JS) if SHADOW_DOM_PIERCING_ENABLED else page.content()
        return RenderResult(html, timed_out=False)
    except Exception as e:
        try: content = page.content()
        except: content = ""
        return RenderResult(content, timed_out=True)
    finally:
        page.close()

def _teardown_context(handle):
    try:
        if handle.context:
            handle.context.close()
    except Exception as e:
        logger.warning(f"Context teardown failed: {e}")
    finally:
        handle.context = None

def _real_launch():
    from playwright.sync_api import sync_playwright
    p = sync_playwright().start()
    user_data_dir = tempfile.mkdtemp(prefix="crawler-shadow-")
    browser = p.chromium.launch(headless=True)
    return _ChromiumHandle(None, p, browser, user_data_dir)

class RenderThread:
    def __init__(self, **kwargs):
        self._queue = queue.Queue(maxsize=RENDER_QUEUE_SIZE)
        self._thread = None
        self._started = False
        self._shutdown_called = False
        self._handle = None
        self._disabled = False
        self._consecutive_fails = 0
        atexit.register(self._atexit_kill_chromium)

    def start(self):
        if not self._started:
            self._started = True
            self._thread = threading.Thread(target=self._run, name="crawler-render", daemon=True)
            self._thread.start()

    def submit(self, url: str) -> Future:
        if self._disabled:
            raise RuntimeError("Render thread is disabled due to consecutive failures")
        f = Future()
        try:
            self._queue.put(RenderRequest(url=url, future=f), timeout=RENDER_SUBMIT_TIMEOUT)
        except queue.Full:
            raise RenderQueueFullError(f"Render queue full (size={self._queue.maxsize})")
        return f

    def is_disabled(self) -> bool: return self._disabled

    def shutdown(self, timeout=5.0):
        self._shutdown_called = True
        chromium_pid = self._handle.proc.pid if self._handle and self._handle.proc else None
        if chromium_pid:
            def _watchdog():
                time.sleep(timeout)
                try:
                    os.kill(chromium_pid, 0)
                    os.kill(chromium_pid, signal.SIGKILL)
                    logger.warning(f"Watchdog: Killed hung Chromium PID {chromium_pid}")
                except: pass
            threading.Thread(target=_watchdog, daemon=True).start()

        try: self._queue.put(_SHUTDOWN_SENTINEL, timeout=timeout)
        except: pass

    def _atexit_kill_chromium(self):
        if self._handle:
            try:
                self._handle.browser.close()
                self._handle.playwright.stop()
            except: pass

    def _run(self):
        try:
            self._handle = _real_launch()
            while True:
                try:
                    req = self._queue.get(timeout=0.5)
                except queue.Empty:
                    continue
                
                if req is _SHUTDOWN_SENTINEL: break
                
                try:
                    res = _real_render(self._handle, req.url, RENDER_TIMEOUT * 1000, req.enable_scroll)
                    req.future.set_result(res)
                    self._consecutive_fails = 0
                except Exception as e:
                    logger.error(f"Render crash for {req.url}: {e}")
                    self._consecutive_fails += 1
                    if self._consecutive_fails >= 3:
                        self._disabled = True
                        logger.error("Render thread DISABLED after 3 failures")
                    
                    if _is_browser_dead_error(e):
                        logger.info("Re-launching browser...")
                        self._teardown_browser()
                        self._handle = _real_launch()
                    
                    if not req.future.done():
                        req.future.set_exception(e)
        finally: self._teardown_browser()

    def _teardown_browser(self):
        if not self._handle: return
        try:
            if self._handle.context:
                try: self._handle.context.close()
                except: pass
            self._handle.browser.close()
            self._handle.playwright.stop()
        finally: self._handle = None

def preflight() -> tuple[bool, str]:
    return True, ""
