"""Tests for ProgressCoalescer."""

import queue
import threading
import time

import pytest

from crawler.core.progress import ProgressCoalescer


def _drain(q: queue.Queue) -> list[dict]:
    items = []
    while not q.empty():
        items.append(q.get_nowait())
    return items


class TestNoOutputQueue:
    def test_no_thread_started_when_output_is_none(self):
        coalescer = ProgressCoalescer(output_queue=None, flush_ms=10)
        coalescer.start()
        assert coalescer._thread is None
        coalescer.emit({"status": "running"})  # no-op
        coalescer.shutdown(timeout=0.5)


class TestCoalescing:
    def test_burst_collapses_to_at_most_one_event_per_window(self):
        out = queue.Queue()
        coalescer = ProgressCoalescer(out, flush_ms=100)
        coalescer.start()
        try:
            for i in range(50):
                coalescer.emit({"status": "running", "pages_done": i})
            time.sleep(0.25)  # allow ~2 flush windows
        finally:
            coalescer.shutdown(timeout=1.0)

        events = _drain(out)
        # Should be far fewer than 50 — one or two events typically.
        assert 1 <= len(events) <= 4
        # The last-published event must reflect the most recent emit value
        # (last-value-wins, monotonically non-decreasing).
        assert events[-1]["pages_done"] == 49

    def test_terminal_status_is_sticky(self):
        out = queue.Queue()
        coalescer = ProgressCoalescer(out, flush_ms=10)
        coalescer.start()
        try:
            coalescer.emit({"status": "running", "pages_done": 5})
            coalescer.emit({"status": "completed", "pages_done": 10})
            time.sleep(0.05)
            # Stragglers after terminal must be dropped.
            coalescer.emit({"status": "running", "pages_done": 999})
            time.sleep(0.05)
        finally:
            coalescer.shutdown(timeout=1.0)

        events = _drain(out)
        assert any(e["status"] == "completed" for e in events)
        # Final flushed event must be the terminal one.
        assert events[-1]["status"] == "completed"
        assert events[-1]["pages_done"] == 10
        # 999 ("running" after terminal) must never have leaked through.
        assert all(e["pages_done"] != 999 for e in events)


class TestShutdownFlush:
    def test_pending_event_flushed_on_shutdown(self):
        out = queue.Queue()
        coalescer = ProgressCoalescer(out, flush_ms=5000)  # very long window
        coalescer.start()
        try:
            coalescer.emit({"status": "running", "pages_done": 3})
            # Don't wait for flush — go straight to shutdown.
        finally:
            coalescer.shutdown(timeout=1.0)

        events = _drain(out)
        assert events == [{"status": "running", "pages_done": 3}]


class TestThreadSafety:
    def test_concurrent_emits_no_corruption(self):
        out = queue.Queue()
        coalescer = ProgressCoalescer(out, flush_ms=20)
        coalescer.start()

        barrier = threading.Barrier(8)
        errors: list[BaseException] = []

        def emit_loop(worker_id: int):
            try:
                barrier.wait()
                for i in range(100):
                    coalescer.emit({
                        "status": "running",
                        "pages_done": worker_id * 100 + i,
                    })
            except BaseException as exc:
                errors.append(exc)

        threads = [threading.Thread(target=emit_loop, args=(w,)) for w in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5.0)

        coalescer.shutdown(timeout=2.0)

        assert errors == []
        # Each event must be a complete dict (no partial writes).
        for event in _drain(out):
            assert "status" in event and "pages_done" in event
