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
