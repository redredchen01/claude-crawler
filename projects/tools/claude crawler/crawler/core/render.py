"""Render thread: owns Chromium subprocess + sync Playwright on a single thread.

Sync Playwright is thread-affine; calling it from worker threads triggers
"event loop already running" errors. The render thread serializes all
Playwright access behind an in-process queue. Workers submit a
:class:`RenderRequest` and await ``future.result(timeout=...)``.

Lifecycle:
    - Lazy launch: Chromium is not started until the first request, so scans
      that hit zero JS pages never spawn a browser.
    - Crash recovery: Playwright "Browser has been closed" errors trigger an
      automatic re-launch on the next request, with backoff (1s, 5s) between
      attempts. After ``max_consecutive_failures`` attempts in a row the
      thread refuses further requests with ``RuntimeError``.
    - Shutdown: drains queued requests with ``ShutdownError`` on their
      Futures, calls ``browser.close()`` with ``BROWSER_SHUTDOWN_TIMEOUT``,
      then ``terminate()``/``kill()`` on the Chromium PID we own.
"""

import atexit
import logging
import os
import queue
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Any, Callable

from crawler.config import (
    BROWSER_SHUTDOWN_TIMEOUT, RENDER_RETRY_COUNT, RENDER_TIMEOUT,
)
from crawler.models import RenderRequest

logger = logging.getLogger(__name__)

_SHUTDOWN_SENTINEL = None
_QUEUE_GET_TIMEOUT = 0.5
_DEFAULT_RESTART_BACKOFFS = (1.0, 5.0)
_DEFAULT_MAX_CONSECUTIVE_FAILURES = 3
_DEVTOOLS_PORT_FILE = "DevToolsActivePort"
_CHROMIUM_BOOT_TIMEOUT = 10.0


class ShutdownError(RuntimeError):
    """Raised on a Future when the render thread shuts down before completing."""


@dataclass
class _ChromiumHandle:
    """Opaque bundle held by RenderThread between launch and teardown.

    Tests can substitute this with any object — the launch/render/teardown
    callables passed into RenderThread are responsible for interpreting it.
    """
    proc: subprocess.Popen | None
    playwright: Any  # playwright.sync_api.Playwright
    browser: Any     # playwright.sync_api.Browser
    user_data_dir: str | None


def preflight() -> tuple[bool, str]:
    """Quick check that Playwright + Chromium are installed.

    Returns (ok, remediation_message). On success message is empty.
    Cheap enough to call at scan start; surfaces "playwright install chromium"
    instead of failing per-page deep inside the render path.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return (
            False,
            "Playwright not installed. Run: pip install playwright "
            "&& playwright install chromium",
        )
    try:
        with sync_playwright() as p:
            path = p.chromium.executable_path
            if not path or not os.path.exists(path):
                return (
                    False,
                    "Chromium binary missing. Run: playwright install chromium",
                )
        return (True, "")
    except Exception as exc:
        msg = str(exc)
        lowered = msg.lower()
        if (
            "executable doesn't exist" in lowered
            or "browsertype.executable_path" in lowered
            or "no such file" in lowered
        ):
            return (
                False,
                "Chromium binary missing. Run: playwright install chromium",
            )
        return (False, f"Playwright preflight failed: {msg}")


# --- Production launch / render / teardown helpers ---
# These are split out so RenderThread can accept fakes for tests without
# pulling in real Chromium.


def _real_launch() -> _ChromiumHandle:
    """Spawn Chromium under our own Popen, then attach Playwright via CDP."""
    from playwright.sync_api import sync_playwright

    chromium_exe = _resolve_chromium_path()
    user_data_dir = tempfile.mkdtemp(prefix="crawler-chromium-")
    args = [
        chromium_exe,
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        f"--user-data-dir={user_data_dir}",
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-features=Translate,BackForwardCache",
        "--disable-dev-shm-usage",
        "--no-sandbox",
    ]
    proc = subprocess.Popen(
        args,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    port = _wait_for_devtools_port(proc, user_data_dir, _CHROMIUM_BOOT_TIMEOUT)

    playwright = sync_playwright().start()
    try:
        browser = playwright.chromium.connect_over_cdp(
            f"http://127.0.0.1:{port}"
        )
    except Exception:
        playwright.stop()
        _kill_proc(proc, BROWSER_SHUTDOWN_TIMEOUT)
        shutil.rmtree(user_data_dir, ignore_errors=True)
        raise

    return _ChromiumHandle(
        proc=proc, playwright=playwright, browser=browser,
        user_data_dir=user_data_dir,
    )


def _resolve_chromium_path() -> str:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        path = p.chromium.executable_path
    if not path or not os.path.exists(path):
        raise RuntimeError(
            "Chromium binary missing. Run: playwright install chromium"
        )
    return path


def _wait_for_devtools_port(proc: subprocess.Popen, user_data_dir: str,
                            timeout: float) -> int:
    """Poll Chromium's DevToolsActivePort file until it appears."""
    port_file = os.path.join(user_data_dir, _DEVTOOLS_PORT_FILE)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"Chromium exited prematurely (code={proc.returncode}) "
                f"before publishing DevToolsActivePort"
            )
        if os.path.exists(port_file):
            try:
                with open(port_file) as fh:
                    first_line = fh.readline().strip()
                return int(first_line)
            except (OSError, ValueError):
                pass
        time.sleep(0.05)
    raise TimeoutError(
        f"Chromium did not publish DevToolsActivePort within {timeout:.1f}s"
    )


def _real_render(handle: _ChromiumHandle, url: str, timeout_ms: int) -> str:
    """Render a single URL via the live browser, returning HTML."""
    context = handle.browser.new_context()
    try:
        page = context.new_page()
        page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            # Some pages never reach networkidle (long-poll, websockets);
            # the DOM is enough for parsing.
            pass
        return page.content()
    finally:
        try:
            context.close()
        except Exception:
            logger.debug("context.close() raised during render cleanup",
                         exc_info=True)


def _real_teardown(handle: _ChromiumHandle, timeout: float) -> None:
    """Close browser, stop Playwright driver, kill Chromium PID, clean up."""
    try:
        if handle.browser is not None:
            try:
                handle.browser.close()
            except Exception:
                logger.debug("browser.close() raised", exc_info=True)
        if handle.playwright is not None:
            try:
                handle.playwright.stop()
            except Exception:
                logger.debug("playwright.stop() raised", exc_info=True)
    finally:
        if handle.proc is not None:
            _kill_proc(handle.proc, timeout)
        if handle.user_data_dir:
            shutil.rmtree(handle.user_data_dir, ignore_errors=True)


def _force_kill_pid_after(pid: int, delay: float) -> None:
    """Sleep ``delay`` seconds, then SIGKILL ``pid`` if still alive.

    Used as a daemon watchdog by RenderThread.shutdown so the shutdown bound
    is enforced regardless of where Playwright/Chromium might be hung. Safe
    to call against an already-dead PID — the lookup error is swallowed.
    """
    time.sleep(delay)
    try:
        os.kill(pid, 0)  # probe — raises ProcessLookupError if already dead
    except ProcessLookupError:
        return
    except PermissionError:
        logger.error("Watchdog cannot signal PID %d (permission denied)", pid)
        return
    try:
        os.kill(pid, signal.SIGKILL)
        logger.warning(
            "Watchdog SIGKILLed Chromium PID %d after %.1fs deadline",
            pid, delay,
        )
    except ProcessLookupError:
        # Race: died between probe and kill. Fine.
        pass
    except Exception:
        logger.exception("Watchdog SIGKILL of PID %d raised", pid)


def _kill_proc(proc: subprocess.Popen, timeout: float) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
            return
        except subprocess.TimeoutExpired:
            pass
        proc.kill()
        try:
            proc.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            logger.error("Chromium PID %d did not exit after SIGKILL", proc.pid)
    except Exception:
        logger.exception("Error tearing down Chromium PID %d", proc.pid)


def _is_browser_dead_error(exc: BaseException) -> bool:
    """Heuristic: detect "browser has crashed / disconnected" Playwright errors."""
    msg = str(exc).lower()
    return (
        "browser has been closed" in msg
        or "browser has disconnected" in msg
        or "target closed" in msg
        or "target page, context or browser has been closed" in msg
    )


# --- The thread itself ---

LaunchFn = Callable[[], Any]
RenderFn = Callable[[Any, str, int], str]
TeardownFn = Callable[[Any, float], None]


class RenderThread:
    """Owns a single Chromium subprocess + Playwright connection on its own thread."""

    def __init__(
        self,
        *,
        timeout: float = RENDER_TIMEOUT,
        retry_count: int = RENDER_RETRY_COUNT,
        shutdown_timeout: float = BROWSER_SHUTDOWN_TIMEOUT,
        max_consecutive_failures: int = _DEFAULT_MAX_CONSECUTIVE_FAILURES,
        restart_backoffs: tuple[float, ...] = _DEFAULT_RESTART_BACKOFFS,
        launch_fn: LaunchFn | None = None,
        render_fn: RenderFn | None = None,
        teardown_fn: TeardownFn | None = None,
    ):
        self._timeout = timeout
        self._retry_count = retry_count
        self._shutdown_timeout = shutdown_timeout
        self._max_consecutive_failures = max_consecutive_failures
        self._restart_backoffs = restart_backoffs

        self._launch_fn: LaunchFn = launch_fn or _real_launch
        self._render_fn: RenderFn = render_fn or _real_render
        self._teardown_fn: TeardownFn = teardown_fn or _real_teardown

        self._queue: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None
        self._started = False
        self._shutdown_called = False
        # Set as soon as shutdown() is called so requests already queued before
        # the sentinel arrives (FIFO ordering would otherwise process them
        # normally) are failed with ShutdownError instead.
        self._shutdown_event = threading.Event()

        # Mutable state owned by the render thread itself; do not touch from
        # outside.
        self._handle: Any = None
        self._consecutive_failures = 0
        self._disabled = False

        # Last-resort safety net: if the Python interpreter exits without the
        # normal shutdown path running (Streamlit reload, daemon-thread orphan,
        # uncaught exception in parent), atexit fires and SIGKILLs the
        # Chromium PID we own. The thread itself is daemon=True so the
        # interpreter can exit at all.
        atexit.register(self._atexit_kill_chromium)

    # --- public API ---

    def start(self) -> None:
        if self._started:
            raise RuntimeError("RenderThread already started")
        self._started = True
        # daemon=True so the Python interpreter can exit even when the render
        # thread is mid-loop or blocked on Chromium I/O. The atexit handler is
        # the safety net for the Chromium subprocess specifically (it outlives
        # the interpreter unless explicitly killed).
        self._thread = threading.Thread(
            target=self._run, name="crawler-render", daemon=True,
        )
        self._thread.start()

    def submit(self, url: str) -> Future:
        """Enqueue a render request; caller awaits ``future.result(timeout=...)``."""
        future: Future = Future()
        self._queue.put(RenderRequest(url=url, future=future))
        return future

    def shutdown(self, timeout: float | None = None) -> None:
        """Signal shutdown; spawn a watchdog that hard-kills Chromium at deadline.

        The watchdog is the load-bearing piece: even if the normal teardown
        path (browser.close → playwright.stop → terminate Popen) hangs because
        Chromium is wedged or Playwright's driver is unresponsive, the
        watchdog daemon SIGKILLs the Chromium PID we own at ``timeout``.
        """
        if self._shutdown_called:
            return
        self._shutdown_called = True
        self._shutdown_event.set()
        if self._thread is None:
            return

        wait = timeout if timeout is not None else self._shutdown_timeout + 5.0

        # Spawn watchdog BEFORE join so the deadline applies even if the join
        # itself returns quickly. Capture the current PID; if normal teardown
        # killed it cleanly, the SIGKILL becomes a no-op (ProcessLookupError).
        chromium_pid = self.chromium_pid
        if chromium_pid is not None:
            watchdog = threading.Thread(
                target=_force_kill_pid_after,
                args=(chromium_pid, wait),
                name=f"crawler-render-watchdog-{chromium_pid}",
                daemon=True,
            )
            watchdog.start()

        try:
            self._queue.put(_SHUTDOWN_SENTINEL, timeout=wait)
        except queue.Full:
            logger.error(
                "RenderThread queue full during shutdown — sentinel not enqueued"
            )

        self._thread.join(timeout=wait)
        if self._thread.is_alive():
            logger.error("RenderThread did not exit within %.1fs", wait)

    @property
    def chromium_pid(self) -> int | None:
        """Best-effort Chromium PID (only valid while browser is running)."""
        if self._handle is None or getattr(self._handle, "proc", None) is None:
            return None
        return self._handle.proc.pid

    def _atexit_kill_chromium(self) -> None:
        """Last-resort SIGKILL of Chromium PID at interpreter exit.

        Fires only when the normal shutdown path didn't run (Streamlit reload,
        daemon-thread orphan, etc.). Idempotent and noisy on errors so leaks
        are observable in logs. Must not raise — atexit handlers that raise
        get swallowed and obscure other handlers.
        """
        try:
            handle = self._handle
            if handle is None:
                return
            proc = getattr(handle, "proc", None)
            if proc is None:
                return
            if proc.poll() is not None:
                return  # already exited
            try:
                os.kill(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass  # already dead between poll and kill
            # Also clean up the user_data_dir tmpdir we created.
            user_data_dir = getattr(handle, "user_data_dir", None)
            if user_data_dir:
                shutil.rmtree(user_data_dir, ignore_errors=True)
        except Exception:
            # atexit handlers must not raise.
            pass

    # --- internal ---

    def _run(self) -> None:
        try:
            while True:
                try:
                    request = self._queue.get(timeout=_QUEUE_GET_TIMEOUT)
                except queue.Empty:
                    continue

                if request is _SHUTDOWN_SENTINEL:
                    self._drain_queue_with_shutdown_error()
                    return

                if self._shutdown_event.is_set():
                    if isinstance(request, RenderRequest) and not request.future.done():
                        request.future.set_exception(
                            ShutdownError("render thread shutting down")
                        )
                    continue

                self._handle_render(request)
        finally:
            self._teardown_browser()

    def _handle_render(self, req: RenderRequest) -> None:
        if self._disabled:
            req.future.set_exception(RuntimeError(
                "render thread disabled after repeated crashes"
            ))
            return

        if not self._ensure_browser_or_disable():
            req.future.set_exception(RuntimeError(
                "render thread disabled after repeated crashes"
            ))
            return

        last_exc: BaseException | None = None
        for attempt in range(self._retry_count + 1):
            try:
                html = self._render_fn(self._handle, req.url, int(self._timeout * 1000))
                self._consecutive_failures = 0
                req.future.set_result(html)
                return
            except BaseException as exc:
                last_exc = exc
                if _is_browser_dead_error(exc):
                    logger.warning(
                        "Browser died during render of %s: %s", req.url, exc,
                    )
                    self._teardown_browser()
                    self._consecutive_failures += 1
                    if self._consecutive_failures >= self._max_consecutive_failures:
                        self._disabled = True
                    break  # do not retry on a dead browser
                logger.warning(
                    "Render attempt %d/%d failed for %s: %s",
                    attempt + 1, self._retry_count + 1, req.url, exc,
                )

        if last_exc is None:
            last_exc = RuntimeError("render failed without raising — should not happen")
        req.future.set_exception(last_exc)

    def _ensure_browser_or_disable(self) -> bool:
        """Lazy-launch (or re-launch) Chromium with backoff; mark disabled on max failures."""
        if self._handle is not None:
            return True
        if self._consecutive_failures > 0:
            idx = min(self._consecutive_failures - 1, len(self._restart_backoffs) - 1)
            backoff = self._restart_backoffs[idx]
            logger.info(
                "Restarting Chromium after %d failures (backoff %.1fs)",
                self._consecutive_failures, backoff,
            )
            time.sleep(backoff)

        try:
            self._handle = self._launch_fn()
            return True
        except BaseException as exc:
            logger.exception("Chromium launch failed: %s", exc)
            self._handle = None
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._max_consecutive_failures:
                self._disabled = True
            return False

    def _teardown_browser(self) -> None:
        if self._handle is None:
            return
        try:
            self._teardown_fn(self._handle, self._shutdown_timeout)
        except BaseException:
            logger.exception("Render teardown raised")
        finally:
            self._handle = None

    def _drain_queue_with_shutdown_error(self) -> None:
        while True:
            try:
                request = self._queue.get_nowait()
            except queue.Empty:
                return
            if request is _SHUTDOWN_SENTINEL:
                continue
            if isinstance(request, RenderRequest) and not request.future.done():
                request.future.set_exception(
                    ShutdownError("render thread shutting down")
                )
