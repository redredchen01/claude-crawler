from __future__ import annotations

import queue
import threading
import time

class ProgressCoalescer:
    """Direct-path coalescer that ensures the latest state is always queued."""
    def __init__(self, output_queue: queue.Queue | None, flush_ms: int = 250):
        self._output = output_queue
        self._interval = flush_ms / 1000.0
        self._last_emit = 0.0
        self._lock = threading.Lock()
        self._terminal_seen = False

    def start(self): pass
    def shutdown(self, timeout=2.0): pass

    def emit(self, event: dict) -> None:
        if self._output is None or self._terminal_seen: return
        
        now = time.monotonic()
        is_terminal = event.get("status") in ("completed", "failed", "cancelled")
        
        with self._lock:
            if is_terminal:
                self._terminal_seen = True
                self._output.put(event)
                return
            
            if now - self._last_emit >= self._interval:
                try:
                    # Clear queue of old progress to prevent lag
                    while True:
                        try: self._output.get_nowait()
                        except queue.Empty: break
                    self._output.put_nowait(event)
                    self._last_emit = now
                except: pass
