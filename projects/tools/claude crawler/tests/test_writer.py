"""Tests for crawler.core.writer.WriterThread.

Coverage matrix (mirrors plan Unit 5 acceptance scenarios):
    - happy: insert_page returns valid id, single 'pending' row
    - happy: 5 write_page calls land pages + resources + tags
    - edge: duplicate URL insert returns existing id
    - edge: empty ParseResult.resources updates page only
    - error: FK violation rolls back; writer survives; next message succeeds
    - atomicity: write_page mid-loop raise → no partial resources
    - backpressure: queue maxsize blocks producer
    - shutdown: drains all pending messages before exit
    - integration: 8 worker threads × 100 writes, no DB lock errors
"""

import os
import sqlite3
import tempfile
import threading
import time
from concurrent.futures import Future
from unittest.mock import patch

import pytest

from crawler.core.writer import WriterThread
from crawler.models import (
    InsertPageRequest, PageWriteRequest, ParseResult, Resource,
    ScanJobUpdateRequest,
)
from crawler.storage import (
    create_scan_job, get_resources, get_scan_job, get_tags, init_db,
)


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


@pytest.fixture
def scan_job_id(db_path):
    return create_scan_job(db_path, "https://example.com", "example.com")


@pytest.fixture
def started_writer(db_path):
    writer = WriterThread(db_path)
    writer.start()
    yield writer
    if not writer._shutdown_called:
        writer.shutdown(timeout=5.0)


def _resource(scan_job_id: int, url: str, *, tags: list[str] | None = None,
              title: str = "") -> Resource:
    return Resource(
        scan_job_id=scan_job_id,
        url=url,
        title=title or url,
        tags=tags or [],
    )


def _wait_until_drained(writer: WriterThread, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if writer._queue.unfinished_tasks == 0 and writer._queue.empty():
            return
        time.sleep(0.01)


class TestStartShutdown:
    def test_double_start_raises(self, db_path):
        writer = WriterThread(db_path)
        writer.start()
        try:
            with pytest.raises(RuntimeError, match="already started"):
                writer.start()
        finally:
            writer.shutdown(timeout=2.0)

    def test_shutdown_without_start_is_noop(self, db_path):
        writer = WriterThread(db_path)
        # Should not raise even though no thread exists.
        writer.shutdown(timeout=1.0)

    def test_double_shutdown_is_noop(self, started_writer):
        started_writer.shutdown(timeout=2.0)
        started_writer.shutdown(timeout=2.0)


class TestInsertPage:
    def test_returns_valid_page_id(self, started_writer, db_path, scan_job_id):
        page_id = started_writer.insert_page(scan_job_id, "https://example.com/a", 0)

        assert isinstance(page_id, int) and page_id > 0
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM pages WHERE id = ?", (page_id,)
            ).fetchone()
        assert row is not None
        assert row["url"] == "https://example.com/a"
        assert row["status"] == "pending"
        assert row["depth"] == 0

    def test_duplicate_returns_existing_id(self, started_writer, scan_job_id):
        first_id = started_writer.insert_page(scan_job_id, "https://example.com/a", 0)
        second_id = started_writer.insert_page(scan_job_id, "https://example.com/a", 5)

        assert first_id == second_id

    def test_different_scan_jobs_get_distinct_rows(self, started_writer, db_path):
        job_a = create_scan_job(db_path, "https://a.com", "a.com")
        job_b = create_scan_job(db_path, "https://b.com", "b.com")

        id_a = started_writer.insert_page(job_a, "https://a.com/p", 0)
        id_b = started_writer.insert_page(job_b, "https://a.com/p", 0)

        assert id_a != id_b


class TestWritePage:
    def test_five_pages_land_with_resources(self, started_writer, db_path, scan_job_id):
        for i in range(5):
            url = f"https://example.com/page{i}"
            page_id = started_writer.insert_page(scan_job_id, url, 0)
            parse_result = ParseResult(
                page_type="list",
                resources=[
                    _resource(scan_job_id, f"{url}/r1", tags=["alpha", "beta"]),
                    _resource(scan_job_id, f"{url}/r2", tags=["beta"]),
                ],
                links=[],
            )
            started_writer.write_page(PageWriteRequest(
                scan_job_id=scan_job_id,
                page_id=page_id,
                parse_result=parse_result,
                page_status="fetched",
                page_type="list",
            ))

        started_writer.shutdown(timeout=3.0)

        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            pages = conn.execute(
                "SELECT * FROM pages WHERE scan_job_id = ?", (scan_job_id,)
            ).fetchall()
        assert len(pages) == 5
        assert all(p["status"] == "fetched" for p in pages)
        assert all(p["page_type"] == "list" for p in pages)
        assert all(p["fetched_at"] for p in pages)

        resources = get_resources(db_path, scan_job_id)
        assert len(resources) == 10
        tags = {t.name for t in get_tags(db_path, scan_job_id)}
        assert tags == {"alpha", "beta"}

    def test_empty_resources_updates_page_only(self, started_writer, db_path, scan_job_id):
        page_id = started_writer.insert_page(scan_job_id, "https://example.com/x", 0)
        started_writer.write_page(PageWriteRequest(
            scan_job_id=scan_job_id,
            page_id=page_id,
            parse_result=ParseResult(page_type="other", resources=[], links=[]),
            page_status="fetched",
            page_type="other",
        ))
        started_writer.shutdown(timeout=2.0)

        assert get_resources(db_path, scan_job_id) == []
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT status, page_type FROM pages WHERE id = ?", (page_id,)
            ).fetchone()
        assert row["status"] == "fetched"

    def test_failed_page_records_failure_reason(self, started_writer, db_path, scan_job_id):
        page_id = started_writer.insert_page(scan_job_id, "https://example.com/y", 0)
        started_writer.write_page(PageWriteRequest(
            scan_job_id=scan_job_id,
            page_id=page_id,
            parse_result=None,
            page_status="failed",
            page_type="other",
            failure_reason="HTTP 503",
        ))
        started_writer.shutdown(timeout=2.0)

        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT status, failure_reason FROM pages WHERE id = ?", (page_id,)
            ).fetchone()
        assert row["status"] == "failed"
        assert row["failure_reason"] == "HTTP 503"


class TestErrorRecovery:
    def test_fk_violation_rolls_back_writer_keeps_running(
        self, started_writer, db_path, scan_job_id,
    ):
        # Insert a real page first to confirm baseline.
        good_page = started_writer.insert_page(scan_job_id, "https://example.com/ok", 0)

        # Now submit a request whose Future will surface the failure: an
        # InsertPageRequest with a bogus scan_job_id triggers a FK violation.
        bad_future: Future = Future()
        started_writer._queue.put(InsertPageRequest(
            scan_job_id=99999, url="https://example.com/bad", depth=0,
            future=bad_future,
        ))
        with pytest.raises(sqlite3.IntegrityError):
            bad_future.result(timeout=2.0)

        # Writer must keep running — submit another good message and verify it
        # commits. last_exception stays None for per-message errors.
        next_id = started_writer.insert_page(scan_job_id, "https://example.com/after", 0)
        assert next_id > good_page
        assert started_writer.last_exception is None

    def test_atomicity_on_mid_loop_resource_failure(
        self, started_writer, db_path, scan_job_id,
    ):
        page_id = started_writer.insert_page(scan_job_id, "https://example.com/atomic", 0)

        call_count = {"n": 0}

        def flaky_save(_db, _resource, conn=None):
            call_count["n"] += 1
            if call_count["n"] >= 4:
                raise sqlite3.OperationalError("simulated mid-loop failure")
            cursor = conn.execute(
                "INSERT OR IGNORE INTO resources "
                "(scan_job_id, page_id, title, url) VALUES (?, ?, ?, ?)",
                (_resource.scan_job_id, _resource.page_id,
                 _resource.title, _resource.url),
            )
            return cursor.lastrowid

        resources = [
            _resource(scan_job_id, f"https://example.com/r{i}") for i in range(10)
        ]
        with patch("crawler.core.writer.save_resource_with_tags",
                   side_effect=flaky_save):
            started_writer.write_page(PageWriteRequest(
                scan_job_id=scan_job_id,
                page_id=page_id,
                parse_result=ParseResult(page_type="list", resources=resources, links=[]),
                page_status="fetched",
                page_type="list",
            ))
            _wait_until_drained(started_writer)

        # All-or-nothing: failure on resource #4 means none committed.
        assert get_resources(db_path, scan_job_id) == []

        # Writer is still alive — submit a clean message and verify it succeeds.
        clean_page = started_writer.insert_page(
            scan_job_id, "https://example.com/clean", 0,
        )
        started_writer.write_page(PageWriteRequest(
            scan_job_id=scan_job_id,
            page_id=clean_page,
            parse_result=ParseResult(
                page_type="list",
                resources=[_resource(scan_job_id, "https://example.com/clean/r")],
                links=[],
            ),
            page_status="fetched",
            page_type="list",
        ))
        started_writer.shutdown(timeout=2.0)
        assert len(get_resources(db_path, scan_job_id)) == 1


class TestBackpressure:
    def test_bounded_queue_blocks_producer(self, db_path, scan_job_id):
        # Don't start the writer — queue stays full, producers block at maxsize.
        writer = WriterThread(db_path, queue_size=10)
        sentinel_page_ids = list(range(1, 11))
        accepted: list[int] = []
        producer_done = threading.Event()

        def produce():
            for i in range(20):
                writer.write_page(PageWriteRequest(
                    scan_job_id=scan_job_id,
                    page_id=sentinel_page_ids[i % 10],
                    parse_result=None,
                    page_status="failed",
                    page_type="other",
                    failure_reason=f"#{i}",
                ))
                accepted.append(i)
            producer_done.set()

        producer = threading.Thread(target=produce, daemon=True)
        producer.start()
        time.sleep(0.2)

        # First 10 fit in the queue; producer is blocked waiting on slot 11.
        assert writer._queue.qsize() == 10
        assert len(accepted) == 10
        assert producer.is_alive()
        assert not producer_done.is_set()

        # Drain a few slots to confirm blocking is the cause; producer advances.
        for _ in range(5):
            writer._queue.get_nowait()
            writer._queue.task_done()
        time.sleep(0.2)
        assert 10 < len(accepted) <= 20

        # Drain the rest so the producer can finish.
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline and not producer_done.is_set():
            try:
                writer._queue.get_nowait()
                writer._queue.task_done()
            except Exception:
                time.sleep(0.01)
        producer.join(timeout=1.0)
        assert producer_done.is_set()
        assert len(accepted) == 20


class TestShutdownDrain:
    def test_pending_items_processed_before_exit(self, db_path, scan_job_id):
        writer = WriterThread(db_path)
        writer.start()

        page_ids: list[int] = []
        for i in range(50):
            page_ids.append(writer.insert_page(
                scan_job_id, f"https://example.com/p{i}", 0,
            ))

        # All 50 inserts succeeded synchronously; now blast 50 write_pages
        # and immediately shut down. Sentinel queues behind them.
        for pid in page_ids:
            writer.write_page(PageWriteRequest(
                scan_job_id=scan_job_id,
                page_id=pid,
                parse_result=ParseResult(page_type="other", resources=[], links=[]),
                page_status="fetched",
                page_type="other",
            ))

        start = time.monotonic()
        writer.shutdown(timeout=3.0)
        elapsed = time.monotonic() - start
        assert elapsed < 3.0

        with sqlite3.connect(db_path) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM pages WHERE status = 'fetched'"
            ).fetchone()[0]
        assert count == 50


class TestUpdateScanJob:
    def test_terminal_status_sets_completed_at(self, started_writer, db_path, scan_job_id):
        started_writer.update_scan_job(ScanJobUpdateRequest(
            scan_job_id=scan_job_id,
            status="completed",
            pages_scanned=42,
            resources_found=120,
        ))
        started_writer.shutdown(timeout=2.0)

        job = get_scan_job(db_path, scan_job_id)
        assert job.status == "completed"
        assert job.pages_scanned == 42
        assert job.resources_found == 120
        assert job.completed_at is not None


class TestConcurrent:
    def test_eight_workers_x_one_hundred_writes(self, db_path):
        scan_job_id = create_scan_job(db_path, "https://load.test", "load.test")
        writer = WriterThread(db_path, queue_size=200)
        writer.start()

        # Pre-create page ids serially so workers only do write_page.
        page_ids = [
            writer.insert_page(scan_job_id, f"https://load.test/p{i}", 0)
            for i in range(800)
        ]

        barrier = threading.Barrier(8)
        errors: list[BaseException] = []

        def worker(slice_start: int):
            try:
                barrier.wait()
                for offset in range(100):
                    pid = page_ids[slice_start + offset]
                    writer.write_page(PageWriteRequest(
                        scan_job_id=scan_job_id,
                        page_id=pid,
                        parse_result=ParseResult(
                            page_type="list",
                            resources=[_resource(
                                scan_job_id,
                                f"https://load.test/p{slice_start + offset}/r",
                                tags=["t"],
                            )],
                            links=[],
                        ),
                        page_status="fetched",
                        page_type="list",
                    ))
            except BaseException as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=worker, args=(i * 100,), daemon=True)
            for i in range(8)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)
        writer.shutdown(timeout=10.0)

        assert errors == []
        assert writer.last_exception is None
        with sqlite3.connect(db_path) as conn:
            fetched = conn.execute(
                "SELECT COUNT(*) FROM pages WHERE status = 'fetched'"
            ).fetchone()[0]
            resource_count = conn.execute(
                "SELECT COUNT(*) FROM resources WHERE scan_job_id = ?",
                (scan_job_id,),
            ).fetchone()[0]
        assert fetched == 800
        assert resource_count == 800
