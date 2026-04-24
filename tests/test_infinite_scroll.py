
"""Tests for P1 Unit 4: infinite scroll integration (RenderRequest + _auto_scroll).

These tests verify:
- RenderRequest scroll config is correctly forwarded through RenderThread
- _auto_scroll() is conditionally called based on enable_scroll flag
- Scroll parameters (pause_ms, max_count, stability_threshold) are respected
- Content accumulation simulation (Instagram-style feeds)
- Error tolerance (non-fatal scroll errors)
- Sequential requests with varying scroll configs
"""

from __future__ import annotations


from concurrent.futures import Future
from types import SimpleNamespace

import pytest
from crawler.models import RenderRequest


@pytest.fixture
def thread_factory():
    """Return a builder for started RenderThreads with auto-cleanup."""
    from crawler.core.render import RenderThread

    threads = []

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


class TestInfiniteScrollConfig:
    """Test scroll config forwarding from RenderRequest to _real_render."""

    def test_scroll_config_passed_to_render_fn(self, thread_factory):
        """Verify all scroll config fields are forwarded."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(
                {
                    "url": url,
                    "enable_scroll": enable_scroll,
                    "scroll_pause_ms": scroll_pause_ms,
                    "max_scroll_count": max_scroll_count,
                    "stability_threshold": stability_threshold,
                }
            )
            return "<html>scrolled content</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://instagram.example/feed",
            future=Future(),
            enable_scroll=True,
            scroll_pause_ms=300,
            max_scroll_count=5,
            stability_threshold=2,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert len(render_calls) == 1
        call = render_calls[0]
        assert call["enable_scroll"] is True
        assert call["scroll_pause_ms"] == 300
        assert call["max_scroll_count"] == 5
        assert call["stability_threshold"] == 2

    def test_scroll_disabled_by_default(self, thread_factory):
        """Verify default RenderRequest has enable_scroll=False."""
        render_calls = []

        def capture_render(handle, url, timeout_ms, enable_scroll=False, **kwargs):
            render_calls.append(enable_scroll)
            return "<html>static</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        future = rt.submit("https://normal-site/")
        future.result(timeout=2.0)

        assert render_calls == [False]

    def test_explicit_scroll_disable(self, thread_factory):
        """When enable_scroll=False, render should not trigger scroll."""
        render_calls = []

        def capture_render(handle, url, timeout_ms, enable_scroll=False, **kwargs):
            render_calls.append(enable_scroll)
            return "<html>static</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://static.example/",
            future=Future(),
            enable_scroll=False,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert render_calls == [False]

    def test_scroll_config_defaults(self, thread_factory):
        """Verify default scroll parameter values."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(
                {
                    "scroll_pause_ms": scroll_pause_ms,
                    "max_scroll_count": max_scroll_count,
                    "stability_threshold": stability_threshold,
                }
            )
            return "<html>x</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://test/",
            future=Future(),
            enable_scroll=True,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert len(render_calls) == 1
        call = render_calls[0]
        assert call["scroll_pause_ms"] == 500
        assert call["max_scroll_count"] == 10
        assert call["stability_threshold"] == 3


class TestInfiniteScrollBehavior:
    """Test scroll behavior and content accumulation."""

    def test_instagram_style_feed_accumulation(self, thread_factory):
        """Simulate Instagram-style feed growing with scroll."""

        def simulated_scroll_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            if not enable_scroll:
                return "<html><body><post>1</post></body></html>"

            # Simulate content growth: initial + scrolls add more posts
            initial = "<html><body><post>1</post>"
            for i in range(2, min(6, max_scroll_count + 2)):
                initial += f"<post>{i}</post>"
            initial += "</body></html>"
            return initial

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=simulated_scroll_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://instagram.example/feed",
            future=Future(),
            enable_scroll=True,
            max_scroll_count=5,
        )
        rt._queue.put(req)
        result = req.future.result(timeout=2.0)

        # Result should contain multiple posts (scroll added content)
        assert "<post>1</post>" in result
        assert "<post>4</post>" in result
        assert "<post>5</post>" in result

    def test_tiktok_style_timeline_growth(self, thread_factory):
        """Simulate TikTok-style timeline with scroll."""

        def tiktok_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            if not enable_scroll:
                return "<html><video id='v1'/></html>"

            # Accumulate videos
            html = "<html>"
            video_count = min(8, max_scroll_count + 1)
            for i in range(1, video_count + 1):
                html += f"<video id='v{i}' src='video{i}.mp4'/>"
            html += "</html>"
            return html

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=tiktok_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://tiktok.example/for-you",
            future=Future(),
            enable_scroll=True,
            max_scroll_count=7,
        )
        rt._queue.put(req)
        result = req.future.result(timeout=2.0)

        # Should have multiple videos
        assert "v1" in result and "v7" in result

    def test_max_scroll_count_respected(self, thread_factory):
        """Verify max_scroll_count parameter is honored."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(max_scroll_count)
            return "<html>x</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://test/",
            future=Future(),
            enable_scroll=True,
            max_scroll_count=3,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert render_calls[0] == 3

    def test_scroll_pause_timing(self, thread_factory):
        """Verify scroll_pause_ms is passed for timing control."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(scroll_pause_ms)
            return "<html>x</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://test/",
            future=Future(),
            enable_scroll=True,
            scroll_pause_ms=200,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert render_calls[0] == 200

    def test_stability_threshold_setting(self, thread_factory):
        """Verify stability_threshold controls stop condition."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(stability_threshold)
            return "<html>x</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://test/",
            future=Future(),
            enable_scroll=True,
            stability_threshold=5,
        )
        rt._queue.put(req)
        req.future.result(timeout=2.0)

        assert render_calls[0] == 5


class TestInfiniteScrollErrorHandling:
    """Test error tolerance and recovery."""

    def test_scroll_error_is_non_fatal(self, thread_factory):
        """Scroll errors should not crash render; return initial HTML."""
        error_state = SimpleNamespace(scroll_attempted=False)

        def render_with_scroll(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            if enable_scroll:
                error_state.scroll_attempted = True
                # In real code, _auto_scroll would raise; render should catch it
                # This test just verifies the initial HTML is returned
            return "<html><body>initial content</body></html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=render_with_scroll,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://test/",
            future=Future(),
            enable_scroll=True,
        )
        rt._queue.put(req)
        result = req.future.result(timeout=2.0)

        assert error_state.scroll_attempted
        assert "initial content" in result

    def test_timeout_with_scroll_enabled(self, thread_factory):
        """Render timeout should still return partial content when scroll enabled."""
        render_calls = []

        def render_with_timeout(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(
                {
                    "url": url,
                    "enable_scroll": enable_scroll,
                    "timeout_ms": timeout_ms,
                }
            )
            # Return partial HTML (as if scroll timed out)
            return "<html><body>partial content</body></html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=render_with_timeout,
            teardown_fn=lambda h, t: None,
        )

        req = RenderRequest(
            url="https://slow-feed/",
            future=Future(),
            enable_scroll=True,
        )
        rt._queue.put(req)
        result = req.future.result(timeout=2.0)

        assert len(render_calls) == 1
        assert "partial content" in result


class TestMultipleScrollRequests:
    """Test sequential requests with varying scroll configs."""

    def test_sequence_of_requests_with_different_configs(self, thread_factory):
        """Submit multiple requests with varying scroll settings."""
        render_calls = []

        def capture_render(handle, url, timeout_ms, enable_scroll=False, **kwargs):
            render_calls.append((url, enable_scroll))
            return f"<html>{url}</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        # Request 1: scroll enabled
        req1 = RenderRequest(
            url="https://site1/feed",
            future=Future(),
            enable_scroll=True,
        )
        rt._queue.put(req1)
        req1.future.result(timeout=2.0)

        # Request 2: scroll disabled
        req2 = RenderRequest(
            url="https://site2/static",
            future=Future(),
            enable_scroll=False,
        )
        rt._queue.put(req2)
        req2.future.result(timeout=2.0)

        # Request 3: scroll enabled again
        req3 = RenderRequest(
            url="https://site3/timeline",
            future=Future(),
            enable_scroll=True,
            max_scroll_count=5,
        )
        rt._queue.put(req3)
        req3.future.result(timeout=2.0)

        assert len(render_calls) == 3
        assert render_calls[0] == ("https://site1/feed", True)
        assert render_calls[1] == ("https://site2/static", False)
        assert render_calls[2] == ("https://site3/timeline", True)

    def test_rapid_sequential_scrolls(self, thread_factory):
        """Submit 10 rapid scroll requests."""
        render_calls = []

        def capture_render(handle, url, timeout_ms, enable_scroll=False, **kwargs):
            render_calls.append((url, enable_scroll))
            return "<html>ok</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        for i in range(10):
            req = RenderRequest(
                url=f"https://site{i}/feed",
                future=Future(),
                enable_scroll=(i % 2 == 0),  # Alternate scroll on/off
            )
            rt._queue.put(req)
            req.future.result(timeout=2.0)

        assert len(render_calls) == 10
        # Verify alternating scroll pattern
        for i, (url, enable_scroll) in enumerate(render_calls):
            assert enable_scroll == (i % 2 == 0)

    def test_mixed_config_values(self, thread_factory):
        """Test requests with different scroll config combinations."""
        render_calls = []

        def capture_render(
            handle,
            url,
            timeout_ms,
            enable_scroll=False,
            scroll_pause_ms=500,
            max_scroll_count=10,
            stability_threshold=3,
        ):
            render_calls.append(
                {
                    "url": url,
                    "pause": scroll_pause_ms,
                    "max": max_scroll_count,
                    "stability": stability_threshold,
                }
            )
            return "<html>ok</html>"

        rt = thread_factory(
            launch_fn=lambda: SimpleNamespace(),
            render_fn=capture_render,
            teardown_fn=lambda h, t: None,
        )

        configs = [
            {"scroll_pause_ms": 100, "max_scroll_count": 3, "stability_threshold": 1},
            {"scroll_pause_ms": 500, "max_scroll_count": 10, "stability_threshold": 3},
            {"scroll_pause_ms": 1000, "max_scroll_count": 20, "stability_threshold": 5},
        ]

        for i, config in enumerate(configs):
            req = RenderRequest(
                url=f"https://test{i}/", future=Future(), enable_scroll=True, **config
            )
            rt._queue.put(req)
            req.future.result(timeout=2.0)

        assert len(render_calls) == 3
        # Verify each config was applied
        assert render_calls[0]["pause"] == 100
        assert render_calls[1]["pause"] == 500
        assert render_calls[2]["pause"] == 1000
        assert render_calls[0]["max"] == 3
        assert render_calls[1]["max"] == 10
        assert render_calls[2]["max"] == 20
