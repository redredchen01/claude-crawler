"""Tests for crawler.core.render.RenderThread + preflight().

All tests use injected fake launch/render/teardown callables — no real
Chromium subprocess is started, so the suite runs in CI without Playwright
binaries installed.
"""

import os
import sys
import threading
import time
from concurrent.futures import TimeoutError as FuturesTimeoutError
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from crawler.core import render as render_mod
from crawler.core.render import (
    RenderThread, ShutdownError, _is_browser_dead_error, preflight,
)


def _make_fake_launch(html_factory=None, crash_after: int | None = None,
                      raise_on_launch: bool = False):
    """Build a fake launch_fn that returns a SimpleNamespace handle.

    ``crash_after`` is *per handle*: a freshly-launched browser starts a new
    render counter, so a 2-render scenario with crash_after=1 will succeed
    once, crash on render #2, then a relaunched browser will succeed again.
    """
    state = SimpleNamespace(launch_calls=0, render_calls=0, teardown_calls=0,
                            handles=[])

    def fake_launch():
        state.launch_calls += 1
        if raise_on_launch:
            raise RuntimeError("simulated launch failure")
        handle = SimpleNamespace(alive=True, id=state.launch_calls,
                                 renders_on_handle=0)
        state.handles.append(handle)
        return handle

    def fake_render(handle, url, timeout_ms):
        state.render_calls += 1
        handle.renders_on_handle += 1
        if not handle.alive:
            raise RuntimeError("Browser has been closed")
        if crash_after is not None and handle.renders_on_handle > crash_after:
            handle.alive = False
            raise RuntimeError("Browser has been closed")
        if html_factory is not None:
            return html_factory(url)
        return f"<html><body>{url}</body></html>"

    def fake_teardown(handle, timeout):
        state.teardown_calls += 1
        handle.alive = False

    return state, fake_launch, fake_render, fake_teardown


@pytest.fixture
def thread_factory():
    """Return a builder that yields started RenderThreads and tears them down."""
    threads: list[RenderThread] = []

    def build(**kwargs):
        rt = RenderThread(**kwargs)
        rt.start()
        threads.append(rt)
        return rt

    yield build

    for rt in threads:
        try:
            rt.shutdown(timeout=2.0)
        except Exception:
            pass


class TestPreflight:
    def test_returns_ok_when_chromium_present(self, tmp_path):
        # Fake the playwright module entry point so we don't need real install.
        fake_path = tmp_path / "chromium"
        fake_path.write_text("")  # exists
        fake_pw = MagicMock()
        fake_pw.__enter__.return_value.chromium.executable_path = str(fake_path)
        fake_pw.__exit__.return_value = False
        with patch("playwright.sync_api.sync_playwright", return_value=fake_pw, create=True):
            ok, msg = preflight()
        assert ok is True
        assert msg == ""

    def test_returns_remediation_on_missing_binary(self):
        fake_pw = MagicMock()
        fake_pw.__enter__.return_value.chromium.executable_path = "/nonexistent/path"
        fake_pw.__exit__.return_value = False
        with patch("playwright.sync_api.sync_playwright", return_value=fake_pw, create=True):
            ok, msg = preflight()
        assert ok is False
        assert "playwright install chromium" in msg

    def test_returns_remediation_on_executable_doesnt_exist_error(self):
        fake_pw = MagicMock()
        fake_pw.__enter__.side_effect = RuntimeError(
            "Executable doesn't exist at /home/.cache/ms-playwright/chromium-1234/chrome"
        )
        with patch("playwright.sync_api.sync_playwright", return_value=fake_pw, create=True):
            ok, msg = preflight()
        assert ok is False
        assert "playwright install chromium" in msg

    def test_handles_missing_playwright_module(self):
        # Simulate ImportError by hiding playwright.sync_api from sys.modules.
        original = sys.modules.pop("playwright.sync_api", None)
        sys.modules["playwright.sync_api"] = None  # makes import fail
        try:
            ok, msg = preflight()
        finally:
            if original is not None:
                sys.modules["playwright.sync_api"] = original
            else:
                sys.modules.pop("playwright.sync_api", None)
        assert ok is False
        assert "playwright" in msg.lower()


class TestBrowserDeadHeuristic:
    @pytest.mark.parametrize("msg", [
        "Browser has been closed",
        "Browser has been closed.",
        "BROWSER HAS DISCONNECTED",
        "Target closed unexpectedly",
        "Target page, context or browser has been closed",
    ])
    def test_recognizes_dead_browser_messages(self, msg):
        assert _is_browser_dead_error(RuntimeError(msg))

    @pytest.mark.parametrize("msg", [
        "page.goto: Timeout 30000ms exceeded",
        "Network unreachable",
        "Navigation failed because page crashed loading frame",  # ambiguous; not flagged
    ])
    def test_does_not_flag_unrelated_errors(self, msg):
        assert not _is_browser_dead_error(RuntimeError(msg))

    def test_typed_target_closed_error_recognized(self):
        """B4: TargetClosedError (narrowest typed match) is detected even
        with a non-matching substring message."""
        if render_mod._TargetClosedError is None:
            pytest.skip("playwright._impl._errors.TargetClosedError unavailable")
        exc = render_mod._TargetClosedError("any message at all")
        assert _is_browser_dead_error(exc)

    def test_playwright_error_with_dead_marker_recognized(self):
        """B4: PlaywrightError + dead-marker substring match passes."""
        if render_mod._PlaywrightError is None:
            pytest.skip("playwright.sync_api.Error unavailable")
        exc = render_mod._PlaywrightError("Browser has been closed unexpectedly")
        assert _is_browser_dead_error(exc)

    def test_playwright_error_without_dead_marker_does_not_match(self):
        """B4: PlaywrightError with a non-dead message must not be flagged
        as dead — typed class is necessary but not sufficient."""
        if render_mod._PlaywrightError is None:
            pytest.skip("playwright.sync_api.Error unavailable")
        exc = render_mod._PlaywrightError("Timeout 30000ms exceeded waiting for selector")
        assert not _is_browser_dead_error(exc)


class TestHappyPath:
    def test_three_submits_resolve(self, thread_factory):
        state, launch, render, teardown = _make_fake_launch()
        rt = thread_factory(
            launch_fn=launch, render_fn=render, teardown_fn=teardown,
        )

        futures = [rt.submit(f"https://example.com/{i}") for i in range(3)]
        results = [f.result(timeout=2.0) for f in futures]

        assert results == [
            "<html><body>https://example.com/0</body></html>",
            "<html><body>https://example.com/1</body></html>",
            "<html><body>https://example.com/2</body></html>",
        ]
        assert state.launch_calls == 1  # one browser shared across all renders
        assert state.render_calls == 3


class TestLazyInit:
    def test_no_submits_means_no_launch(self, thread_factory):
        state, launch, render, teardown = _make_fake_launch()
        rt = thread_factory(
            launch_fn=launch, render_fn=render, teardown_fn=teardown,
        )
        time.sleep(0.1)  # let the thread sit on the queue
        rt.shutdown(timeout=2.0)

        assert state.launch_calls == 0
        assert state.teardown_calls == 0


class TestRetryAndFailure:
    def test_retries_then_fails_with_last_exception(self, thread_factory):
        state = SimpleNamespace(calls=0)

        def flaky_render(handle, url, timeout_ms):
            state.calls += 1
            raise RuntimeError(f"timeout #{state.calls}")

        rt = thread_factory(
            retry_count=2,
            launch_fn=lambda: SimpleNamespace(alive=True),
            render_fn=flaky_render,
            teardown_fn=lambda h, t: None,
        )

        future = rt.submit("https://flaky.test/")
        with pytest.raises(RuntimeError, match="timeout #3"):
            future.result(timeout=2.0)

        assert state.calls == 3  # initial + 2 retries

    def test_does_not_retry_on_browser_dead_error(self, thread_factory):
        state = SimpleNamespace(calls=0)

        def render(handle, url, timeout_ms):
            state.calls += 1
            raise RuntimeError("Browser has been closed")

        rt = thread_factory(
            retry_count=2,
            launch_fn=lambda: SimpleNamespace(),
            render_fn=render,
            teardown_fn=lambda h, t: None,
        )
        future = rt.submit("https://crashy.test/")
        with pytest.raises(RuntimeError, match="Browser has been closed"):
            future.result(timeout=2.0)
        assert state.calls == 1


class TestBrowserCrashRecovery:
    def test_relaunches_on_next_request(self, thread_factory):
        # crash_after=1 means render #1 succeeds, render #2 crashes (browser dies)
        # render #3 should trigger a fresh launch and succeed.
        state, launch, render, teardown = _make_fake_launch(crash_after=1)

        rt = thread_factory(
            retry_count=0, restart_backoffs=(0.0, 0.0),
            launch_fn=launch, render_fn=render, teardown_fn=teardown,
        )

        first = rt.submit("https://a/").result(timeout=2.0)
        assert first == "<html><body>https://a/</body></html>"

        second = rt.submit("https://b/")
        with pytest.raises(RuntimeError, match="Browser has been closed"):
            second.result(timeout=2.0)

        third = rt.submit("https://c/").result(timeout=3.0)
        assert third == "<html><body>https://c/</body></html>"

        # Two launches total: original + post-crash relaunch.
        assert state.launch_calls == 2
        # Teardown called once when browser died.
        assert state.teardown_calls >= 1


class TestCrashCircuitBreaker:
    def test_three_consecutive_failures_disable_thread(self, thread_factory):
        # launch_fn always raises → consecutive_failures == 3 → disabled
        attempts = SimpleNamespace(n=0)

        def always_fail():
            attempts.n += 1
            raise RuntimeError(f"launch failure {attempts.n}")

        rt = thread_factory(
            retry_count=0, restart_backoffs=(0.0, 0.0),
            max_consecutive_failures=3,
            launch_fn=always_fail,
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )

        # First three submits exercise the failed launches.
        for i in range(3):
            f = rt.submit(f"https://attempt{i}/")
            with pytest.raises(RuntimeError):
                f.result(timeout=2.0)

        # Fourth submit must short-circuit with "disabled" message.
        f = rt.submit("https://after-disabled/")
        with pytest.raises(RuntimeError, match="disabled after repeated crashes"):
            f.result(timeout=2.0)

        assert attempts.n == 3


class TestShutdownDrain:
    def test_in_flight_request_gets_shutdown_error(self, thread_factory):
        block = threading.Event()
        proceed = threading.Event()
        state = SimpleNamespace(rendered=0)

        def slow_render(handle, url, timeout_ms):
            block.set()  # signal "we're inside render"
            proceed.wait(timeout=2.0)  # block until test releases us
            state.rendered += 1
            return "<html/>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=slow_render,
            teardown_fn=lambda h, t: None,
        )

        in_flight = rt.submit("https://blocked/")
        queued = rt.submit("https://queued/")

        assert block.wait(timeout=2.0)

        # Initiate shutdown on a side thread because shutdown() blocks on join.
        shutdown_done = threading.Event()
        def do_shutdown():
            rt.shutdown(timeout=3.0)
            shutdown_done.set()
        threading.Thread(target=do_shutdown, daemon=True).start()

        # Give shutdown a moment to enqueue the sentinel.
        time.sleep(0.1)

        # Release the in-flight render so the loop can drain remaining items.
        proceed.set()
        assert in_flight.result(timeout=2.0) == "<html/>"

        # The queued (never-started) request should resolve with ShutdownError.
        with pytest.raises(ShutdownError):
            queued.result(timeout=2.0)

        assert shutdown_done.wait(timeout=3.0)

    def test_teardown_called_on_shutdown(self, thread_factory):
        state, launch, render, teardown = _make_fake_launch()
        rt = thread_factory(
            launch_fn=launch, render_fn=render, teardown_fn=teardown,
        )
        rt.submit("https://x/").result(timeout=2.0)
        rt.shutdown(timeout=2.0)

        assert state.teardown_calls == 1


class TestPidExposure:
    def test_pid_property_reflects_handle(self, thread_factory):
        # Fake handle that mimics our _ChromiumHandle.proc.pid attribute.
        proc_stub = SimpleNamespace(pid=12345)
        handle = SimpleNamespace(proc=proc_stub, alive=True)
        rendered = threading.Event()

        def launch():
            return handle
        def render(h, u, t):
            rendered.set()
            return "<html/>"
        def teardown(h, t):
            pass

        rt = thread_factory(launch_fn=launch, render_fn=render, teardown_fn=teardown)
        assert rt.chromium_pid is None  # nothing launched yet

        rt.submit("https://x/").result(timeout=2.0)
        assert rendered.is_set()
        assert rt.chromium_pid == 12345

        rt.shutdown(timeout=2.0)
        assert rt.chromium_pid is None  # handle cleared on teardown


class TestStartShutdownGuards:
    def test_double_start_raises(self, thread_factory):
        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        with pytest.raises(RuntimeError, match="already started"):
            rt.start()

    def test_double_shutdown_is_noop(self, thread_factory):
        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        rt.shutdown(timeout=2.0)
        rt.shutdown(timeout=2.0)


class TestDaemonAndAtexit:
    """A2: thread is daemon, atexit handler kills Chromium proc."""

    def test_render_thread_is_daemon(self, thread_factory):
        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        assert rt._thread is not None
        assert rt._thread.daemon is True

    def test_atexit_handler_kills_alive_proc(self):
        # Build a RenderThread instance without starting it.
        rt = RenderThread(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        proc = MagicMock()
        proc.poll.return_value = None  # still alive
        proc.pid = 99999
        rt._handle = SimpleNamespace(proc=proc, user_data_dir=None)

        with patch("os.kill") as mock_kill:
            rt._atexit_kill_chromium()
            mock_kill.assert_called_once_with(99999, render_mod.signal.SIGKILL)

    def test_atexit_handler_skips_already_dead_proc(self):
        rt = RenderThread(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        proc = MagicMock()
        proc.poll.return_value = 0  # already exited
        proc.pid = 99999
        rt._handle = SimpleNamespace(proc=proc, user_data_dir=None)

        with patch("os.kill") as mock_kill:
            rt._atexit_kill_chromium()
            mock_kill.assert_not_called()

    def test_atexit_handler_swallows_oskill_lookup_error(self):
        # PID went away between poll() and os.kill — tolerate gracefully.
        rt = RenderThread(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        proc = MagicMock()
        proc.poll.return_value = None
        proc.pid = 99999
        rt._handle = SimpleNamespace(proc=proc, user_data_dir=None)

        with patch("os.kill", side_effect=ProcessLookupError):
            # Should not raise.
            rt._atexit_kill_chromium()

    def test_atexit_handler_with_no_handle_is_noop(self):
        rt = RenderThread(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        # _handle stays None.
        rt._atexit_kill_chromium()  # must not raise


class TestIsDisabled:
    """B3: render thread exposes is_disabled() and engine consults it."""

    def test_is_disabled_false_initially(self, thread_factory):
        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        assert rt.is_disabled() is False

    def test_is_disabled_true_after_circuit_breaker_trips(self, thread_factory):
        attempts = SimpleNamespace(n=0)

        def always_fail():
            attempts.n += 1
            raise RuntimeError(f"launch failure {attempts.n}")

        rt = thread_factory(
            retry_count=0, restart_backoffs=(0.0, 0.0),
            max_consecutive_failures=3,
            launch_fn=always_fail,
            render_fn=lambda h, u, t: "",
            teardown_fn=lambda h, t: None,
        )
        for i in range(3):
            f = rt.submit(f"https://attempt{i}/")
            with pytest.raises(RuntimeError):
                f.result(timeout=2.0)
        assert rt.is_disabled() is True


class TestForceKillWatchdog:
    """A4: shutdown spawns a watchdog that SIGKILLs Chromium PID at deadline."""

    def test_force_kill_pid_after_signals_alive_pid(self):
        from crawler.core.render import _force_kill_pid_after
        with patch("os.kill") as mock_kill:
            # First call: probe (signal 0) succeeds → second call: SIGKILL.
            mock_kill.side_effect = [None, None]
            _force_kill_pid_after(99999, delay=0.05)
            assert mock_kill.call_count == 2
            assert mock_kill.call_args_list[1][0] == (99999, render_mod.signal.SIGKILL)

    def test_force_kill_pid_after_skips_dead_pid(self):
        from crawler.core.render import _force_kill_pid_after
        with patch("os.kill", side_effect=ProcessLookupError) as mock_kill:
            _force_kill_pid_after(99999, delay=0.05)
            # Probe raised → no SIGKILL attempted.
            assert mock_kill.call_count == 1

    def test_force_kill_pid_after_handles_race_between_probe_and_kill(self):
        from crawler.core.render import _force_kill_pid_after
        # Probe succeeds, SIGKILL races with natural death → ProcessLookupError.
        with patch("os.kill", side_effect=[None, ProcessLookupError]):
            # Should not raise.
            _force_kill_pid_after(99999, delay=0.05)

    def test_shutdown_spawns_watchdog_thread(self, thread_factory):
        # Build a thread with a fake handle that exposes a .proc.pid.
        proc_stub = SimpleNamespace(pid=12345, poll=lambda: None)
        handle = SimpleNamespace(proc=proc_stub, alive=True)

        def launch():
            return handle
        rendered = threading.Event()
        def render(h, u, t):
            rendered.set()
            return "<html/>"

        rt = thread_factory(
            launch_fn=launch, render_fn=render,
            teardown_fn=lambda h, t: None,
        )
        rt.submit("https://x/").result(timeout=2.0)
        assert rendered.is_set()

        # Patch _force_kill_pid_after at the module level so we can spy.
        with patch("crawler.core.render._force_kill_pid_after") as mock_kill:
            rt.shutdown(timeout=2.0)
            # Watchdog thread was spawned; its target is _force_kill_pid_after.
            # It runs in its own daemon thread, but the module symbol patched
            # is what the watchdog target points to. Wait briefly for it to fire.
            time.sleep(0.1)
            mock_kill.assert_called_once_with(12345, 2.0)


class TestContextReuse:
    """C1: _real_render reuses one context per handle, recycled with
    clear_cookies/clear_permissions between renders. Saves the per-render
    new_context() round-trip."""

    def test_real_render_creates_context_lazily_and_reuses(self):
        """Mock browser: first render creates context; second render reuses."""
        from crawler.core.render import _real_render, _ChromiumHandle

        mock_browser = MagicMock()
        mock_context = MagicMock()
        mock_browser.new_context.return_value = mock_context
        mock_page = MagicMock()
        mock_page.content.return_value = "<html>x</html>"
        mock_context.new_page.return_value = mock_page

        handle = _ChromiumHandle(
            proc=None, playwright=None, browser=mock_browser,
            user_data_dir=None,
        )

        # First render: lazily create context.
        _real_render(handle, "https://x/", 1000)
        assert mock_browser.new_context.call_count == 1
        assert handle.context is mock_context
        # Second render: reuse + clear.
        _real_render(handle, "https://y/", 1000)
        assert mock_browser.new_context.call_count == 1  # NOT called again
        assert mock_context.clear_cookies.called
        assert mock_context.clear_permissions.called

    def test_real_teardown_closes_context_before_browser(self):
        """C1: teardown closes the context first, then the browser."""
        from crawler.core.render import _real_teardown, _ChromiumHandle

        mock_context = MagicMock()
        mock_browser = MagicMock()
        mock_pw = MagicMock()
        handle = _ChromiumHandle(
            proc=None, playwright=mock_pw, browser=mock_browser,
            user_data_dir=None, context=mock_context,
        )
        _real_teardown(handle, timeout=1.0)
        assert mock_context.close.called
        assert mock_browser.close.called


class TestNetworkidleConfig:
    """C2: RENDER_WAIT_NETWORKIDLE_MS=0 (default) skips wait_for_load_state."""

    def test_real_render_skips_networkidle_when_config_zero(self):
        from crawler.core.render import _real_render, _ChromiumHandle

        mock_browser = MagicMock()
        mock_context = MagicMock()
        mock_browser.new_context.return_value = mock_context
        mock_page = MagicMock()
        mock_page.content.return_value = "<html>x</html>"
        mock_context.new_page.return_value = mock_page

        handle = _ChromiumHandle(
            proc=None, playwright=None, browser=mock_browser,
            user_data_dir=None,
        )
        with patch("crawler.core.render.RENDER_WAIT_NETWORKIDLE_MS", 0):
            _real_render(handle, "https://x/", 1000)
        mock_page.wait_for_load_state.assert_not_called()

    def test_real_render_honors_networkidle_when_config_set(self):
        from crawler.core.render import _real_render, _ChromiumHandle

        mock_browser = MagicMock()
        mock_context = MagicMock()
        mock_browser.new_context.return_value = mock_context
        mock_page = MagicMock()
        mock_page.content.return_value = "<html>x</html>"
        mock_context.new_page.return_value = mock_page

        handle = _ChromiumHandle(
            proc=None, playwright=None, browser=mock_browser,
            user_data_dir=None,
        )
        with patch("crawler.core.render.RENDER_WAIT_NETWORKIDLE_MS", 1500):
            _real_render(handle, "https://x/", 1000)
        mock_page.wait_for_load_state.assert_called_once_with(
            "networkidle", timeout=1500,
        )


class TestRenderQueueBackpressure:
    """C3: bounded queue blocks submit() instead of growing unbounded."""

    def test_submit_blocks_when_queue_full(self, thread_factory):
        from crawler.core.render import RenderQueueFullError

        # Render thread that never drains: render_fn blocks forever.
        block_forever = threading.Event()
        def hung_render(handle, url, timeout_ms):
            block_forever.wait()
            return "<html/>"

        rt = thread_factory(
            queue_size=2,
            submit_timeout=0.3,
            launch_fn=lambda: SimpleNamespace(),
            render_fn=hung_render,
            teardown_fn=lambda h, t: None,
        )
        # First submit: enters render thread, hangs there. Future is created.
        rt.submit("https://a/")
        # Two more submits: fill the queue (2 slots).
        rt.submit("https://b/")
        rt.submit("https://c/")
        # Fourth submit must fail — queue is full and the render thread is
        # busy on https://a/.
        start = time.monotonic()
        with pytest.raises(RenderQueueFullError):
            rt.submit("https://d/")
        elapsed = time.monotonic() - start
        # Bounded by submit_timeout (0.3s) + scheduling slack.
        assert 0.2 < elapsed < 1.0
        # Release the hung render so shutdown can proceed.
        block_forever.set()


class TestKillProcHelper:
    def test_kill_proc_skips_already_exited(self):
        from crawler.core.render import _kill_proc

        proc = MagicMock()
        proc.poll.return_value = 0  # already exited
        _kill_proc(proc, timeout=1.0)
        proc.terminate.assert_not_called()

    def test_kill_proc_escalates_to_kill_on_timeout(self):
        from crawler.core.render import _kill_proc
        import subprocess as sp

        proc = MagicMock()
        proc.poll.return_value = None
        proc.wait.side_effect = [sp.TimeoutExpired("x", 1.0), 0]
        _kill_proc(proc, timeout=0.1)
        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()


class TestWaitForDevtoolsPort:
    def test_returns_port_when_file_appears(self, tmp_path):
        from crawler.core.render import _wait_for_devtools_port

        proc = MagicMock()
        proc.poll.return_value = None  # still alive
        port_file = tmp_path / "DevToolsActivePort"

        def appear_after():
            time.sleep(0.05)
            port_file.write_text("54321\n/devtools/browser/abc\n")

        threading.Thread(target=appear_after, daemon=True).start()
        port = _wait_for_devtools_port(proc, str(tmp_path), timeout=2.0)
        assert port == 54321

    def test_raises_on_premature_chromium_exit(self, tmp_path):
        from crawler.core.render import _wait_for_devtools_port

        proc = MagicMock()
        proc.poll.return_value = 1  # exited with code 1
        proc.returncode = 1
        with pytest.raises(RuntimeError, match="Chromium exited prematurely"):
            _wait_for_devtools_port(proc, str(tmp_path), timeout=1.0)

    def test_raises_on_timeout(self, tmp_path):
        from crawler.core.render import _wait_for_devtools_port

        proc = MagicMock()
        proc.poll.return_value = None
        with pytest.raises(TimeoutError):
            _wait_for_devtools_port(proc, str(tmp_path), timeout=0.2)
