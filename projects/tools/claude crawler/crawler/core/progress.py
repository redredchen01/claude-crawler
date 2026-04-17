"""Progress event coalescer.

Streamlit's queue can be flooded by per-page emissions from N=8 workers in a
hot loop. The coalescer holds the most-recent event in a buffer and flushes at
most ``flush_ms`` per second to the downstream queue, keeping UI updates
human-readable without losing terminal status.

Sticky terminal status: once an event with status in
``{completed, failed, cancelled}`` is emitted, subsequent ``running`` events
are dropped so the final state never gets overwritten by a late progress
report.
"""

import logging
import queue
import threading
from typing import Optional

from crawler.config import PROGRESS_FLUSH_MS

logger = logging.getLogger(__name__)

_TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


class ProgressCoalescer:
    """Buffer-and-flush wrapper around a downstream progress queue.

    Producers call :meth:`emit` from any thread; the internal flush thread
    publishes the latest event at most once per ``flush_ms``. ``shutdown``
    flushes any pending event before joining.
    """

    def __init__(self, output_queue: queue.Queue | None,
                 flush_ms: int = PROGRESS_FLUSH_MS):
        self._output = output_queue
        self._flush_interval = max(0.001, flush_ms / 1000.0)
        self._latest: Optional[dict] = None
        self._terminal_seen = False
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started = False

    def start(self) -> None:
        if self._started:
            raise RuntimeError("ProgressCoalescer already started")
        self._started = True
        if self._output is None:
            # Nothing downstream to flush to — skip the thread entirely.
            return
        self._thread = threading.Thread(
            target=self._run, name="crawler-progress", daemon=True,
        )
        self._thread.start()

    def emit(self, event: dict) -> None:
        if self._output is None:
            return
        with self._lock:
            if self._terminal_seen:
                # Final status is sticky — drop further updates so callers
                # don't see "completed" overwritten by a stray "running" event.
                return
            status = event.get("status")
            if status in _TERMINAL_STATUSES:
                self._terminal_seen = True
            self._latest = event
        self._wake.set()

    def shutdown(self, timeout: float = 2.0) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            if self._thread.is_alive():
                logger.error("ProgressCoalescer flush thread did not exit "
                             "within %.1fs", timeout)
        # Final flush — pick up any event the loop missed in the race against
        # the stop event.
        self._flush()

    # --- internal ---

    def _run(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(timeout=self._flush_interval)
            self._wake.clear()
            self._flush()

    def _flush(self) -> None:
        if self._output is None:
            return
        with self._lock:
            payload = self._latest
            self._latest = None
        if payload is not None:
            try:
                self._output.put_nowait(payload)
            except queue.Full:
                # Downstream consumer is slower than even our coalesced rate;
                # drop and log once. Better to lose progress than block the
                # render path.
                logger.warning("Progress output queue full; dropped event")
