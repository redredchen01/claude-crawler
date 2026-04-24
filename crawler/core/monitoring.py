from __future__ import annotations

"""Event logging and monitoring for crawl lifecycle and failures.

Records key events: scan start/complete, fetch failures, render timeouts, DB errors.
Supports JSON export for external analysis and alerting.
"""

import json
import logging
import threading
from collections import deque, Counter
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class EventType(Enum):
    """Categorized crawler events for monitoring and alerting."""

    # Lifecycle
    SCAN_STARTED = "scan_started"
    SCAN_COMPLETED = "scan_completed"

    # Fetch failures
    FETCH_FAILED = "fetch_failed"
    FETCH_RETRY = "fetch_retry"
    FETCH_TIMEOUT = "fetch_timeout"

    # Render failures
    RENDER_FAILED = "render_failed"
    RENDER_TIMEOUT = "render_timeout"
    BROWSER_CRASH = "browser_crash"

    # Parse events
    PARSE_FAILED = "parse_failed"
    PARSE_COMPLETE = "parse_complete"

    # Storage failures
    STORAGE_FAILED = "storage_failed"
    STORAGE_ROLLBACK = "storage_rollback"

    # Performance
    WORKER_POOL_SATURATED = "worker_pool_saturated"
    RATE_LIMIT_HIT = "rate_limit_hit"


@dataclass
class Event:
    """Structured event for monitoring."""

    event_type: EventType
    timestamp: str
    scan_job_id: int | None = None
    url: str | None = None
    error_message: str | None = None
    retry_attempt: int | None = None
    elapsed_ms: int | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for JSON serialization."""
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "scan_job_id": self.scan_job_id,
            "url": self.url,
            "error_message": self.error_message,
            "retry_attempt": self.retry_attempt,
            "elapsed_ms": self.elapsed_ms,
            "metadata": self.metadata or {},
        }


def setup_logging(level=logging.INFO, log_file="data/crawler.log"):
    """Global logging setup with rotation."""
    import os
    from logging.handlers import TimedRotatingFileHandler
    
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')
    
    # 1. File handler (rotated daily)
    file_handler = TimedRotatingFileHandler(log_file, when="D", interval=1, backupCount=7)
    file_handler.setFormatter(formatter)
    
    # 2. Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Avoid duplicate handlers
    if not root_logger.handlers:
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)

    # Suppress noisy libs
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("playwright").setLevel(logging.WARNING)


class EventLogger:
    """Collects and exports crawler events with thread-safety and memory-safety.

    Uses a deque with maxlen to prevent unbounded memory growth during long scans.
    Maintains atomic counters for fast O(1) status checks.
    """

    def __init__(self, max_events: int = 5000):
        self._lock = threading.Lock()
        self.events: deque[Event] = deque(maxlen=max_events)
        self.counters: Counter = Counter()

    def log_event(
        self,
        event_type: EventType | None,
        scan_job_id: int | None = None,
        url: str | None = None,
        error_message: str | None = None,
        retry_attempt: int | None = None,
        elapsed_ms: int | None = None,
        metadata: dict[str, Any] | None = None,
        db_path: str | None = None,
    ) -> None:
        """Record a structured event. Thread-safe."""
        event = Event(
            event_type=event_type,
            timestamp=datetime.utcnow().isoformat() + "Z",
            scan_job_id=scan_job_id,
            url=url,
            error_message=error_message,
            retry_attempt=retry_attempt,
            elapsed_ms=elapsed_ms,
            metadata=metadata,
        )
        with self._lock:
            self.events.append(event)
            if event_type:
                self.counters[event_type.value] += 1

        # Persist to database
        if event_type and db_path:
            try:
                import sqlite3

                with sqlite3.connect(db_path) as conn:
                    conn.execute(
                        "INSERT INTO events (scan_job_id, event_type, timestamp, url, metadata) VALUES (?, ?, ?, ?, ?)",
                        (
                            scan_job_id,
                            event_type.value,
                            event.timestamp,
                            url,
                            json.dumps(metadata or {}),
                        ),
                    )
            except Exception as e:
                logger.debug("Failed to persist event to DB: %s", e)

        logger.debug(
            "Event logged: %s (url=%s, error=%s)",
            event_type.value if event_type else None,
            url,
            error_message,
        )

    def export_json(self) -> str:
        """Export all events as JSON. Thread-safe."""
        with self._lock:
            data = [event.to_dict() for event in self.events]
        return json.dumps(data, indent=2, default=str)

    def export_to_file(self, path: str) -> None:
        """Write events to a JSON file. Thread-safe."""
        json_data = self.export_json()
        with open(path, "w") as f:
            f.write(json_data)
        logger.info("Events exported to %s", path)

    def get_count(self, event_type: EventType) -> int:
        """Get the total count for an event type. Thread-safe."""
        with self._lock:
            return self.counters[event_type.value]

    def get_failure_rate(self, event_type: EventType) -> float:
        """Calculate failure rate as percentage of total events. Thread-safe."""
        with self._lock:
            total = sum(self.counters.values())
            failures = self.counters[event_type.value]
        return (failures / total * 100) if total > 0 else 0.0

    def clear(self) -> None:
        """Clear all logged events and counters. Thread-safe."""
        with self._lock:
            self.events.clear()
            self.counters.clear()


# Global event logger instance
_event_logger = EventLogger()


def get_event_logger() -> EventLogger:
    """Get the global event logger instance."""
    return _event_logger
