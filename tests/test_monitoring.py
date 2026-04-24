
"""Tests for event logging and monitoring."""

from __future__ import annotations


import json
import tempfile

from crawler.core.monitoring import EventLogger, EventType, get_event_logger


class TestEventLogger:
    """Tests for EventLogger."""

    def test_log_event(self):
        """Log an event and verify it's recorded."""
        logger = EventLogger()
        logger.log_event(
            EventType.SCAN_STARTED,
            scan_job_id=1,
            url="https://example.com",
            metadata={"mode": "test"},
        )
        assert len(logger.events) == 1
        assert logger.events[0].event_type == EventType.SCAN_STARTED
        assert logger.events[0].scan_job_id == 1
        assert logger.events[0].metadata["mode"] == "test"

    def test_export_json(self):
        """Export events as JSON."""
        logger = EventLogger()
        logger.log_event(
            EventType.SCAN_STARTED, scan_job_id=1, url="https://example.com"
        )
        logger.log_event(EventType.SCAN_COMPLETED, scan_job_id=1)

        json_str = logger.export_json()
        data = json.loads(json_str)

        assert len(data) == 2
        assert data[0]["event_type"] == "scan_started"
        assert data[1]["event_type"] == "scan_completed"

    def test_export_to_file(self):
        """Export events to a JSON file."""
        logger = EventLogger()
        logger.log_event(
            EventType.SCAN_STARTED, scan_job_id=1, url="https://example.com"
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            temp_path = f.name

        logger.export_to_file(temp_path)

        with open(temp_path) as f:
            data = json.load(f)

        assert len(data) == 1
        assert data[0]["event_type"] == "scan_started"

    def test_get_failure_rate(self):
        """Calculate failure rate."""
        logger = EventLogger()
        logger.log_event(EventType.FETCH_FAILED, url="https://example.com/1")
        logger.log_event(EventType.FETCH_FAILED, url="https://example.com/2")
        logger.log_event(EventType.SCAN_STARTED, scan_job_id=1)

        rate = logger.get_failure_rate(EventType.FETCH_FAILED)
        assert abs(rate - 66.67) < 0.1  # ~67% failures

    def test_clear_events(self):
        """Clear all logged events."""
        logger = EventLogger()
        logger.log_event(EventType.SCAN_STARTED, scan_job_id=1)
        assert len(logger.events) == 1

        logger.clear()
        assert len(logger.events) == 0

    def test_global_event_logger(self):
        """Test global event logger instance."""
        logger1 = get_event_logger()
        logger2 = get_event_logger()

        # Should be the same instance
        assert logger1 is logger2

        # Clear events first (global state from previous tests)
        initial_count = len(logger1.events)

        # Log an event to logger1
        logger1.log_event(EventType.SCAN_STARTED, scan_job_id=1)

        # Should be visible in logger2 (count increased by 1)
        assert len(logger2.events) == initial_count + 1
