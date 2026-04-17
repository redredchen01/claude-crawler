"""Writer thread: serializes all SQLite writes through a single long-lived connection.

Worker threads, the engine, and the Frontier all submit write requests through
a bounded queue. The writer processes them one at a time inside explicit
``BEGIN IMMEDIATE`` / ``COMMIT`` transactions, eliminating ``SQLITE_BUSY``
contention by construction (single writer, no exceptions).

Caller patterns:
  - ``writer.insert_page(scan_job_id, url, depth) -> int``: synchronous helper
    that wraps an :class:`InsertPageRequest` + ``Future`` and blocks until the
    writer commits and returns the page_id.
  - ``writer.write_page(PageWriteRequest)``: enqueue a fire-and-forget per-page
    write; writer commits as one transaction.
  - ``writer.update_scan_job(ScanJobUpdateRequest)``: terminal job-state update,
    typically the last write before ``shutdown()``.
"""

import logging
import queue
import sqlite3
import threading
from concurrent.futures import Future
from datetime import datetime, timezone

from crawler.models import (
    InsertPageRequest, PageWriteRequest, ScanJobUpdateRequest,
)
from crawler.storage import save_resource_with_tags

logger = logging.getLogger(__name__)

_SHUTDOWN_SENTINEL = None
_DEFAULT_QUEUE_SIZE = 100
_DEFAULT_INSERT_TIMEOUT = 5.0
_DEFAULT_SHUTDOWN_TIMEOUT = 5.0
_QUEUE_GET_TIMEOUT = 0.5

_TERMINAL_JOB_STATUSES = frozenset({"completed", "failed", "cancelled"})


class WriterThread:
    """Single writer thread owning one SQLite connection for the lifetime of a crawl."""

    def __init__(self, db_path: str, queue_size: int = _DEFAULT_QUEUE_SIZE):
        self._db_path = db_path
        self._queue: queue.Queue = queue.Queue(maxsize=queue_size)
        self._thread: threading.Thread | None = None
        self._started = False
        self._shutdown_called = False
        # Set on fatal init/teardown failure that halts the run loop. Re-raised
        # in shutdown() so callers don't lose visibility into a halted writer.
        # Per-message handler exceptions do NOT set this — they fail the
        # request's Future (if any) and the loop continues.
        self.last_exception: BaseException | None = None

    # --- public API ---

    def start(self) -> None:
        if self._started:
            raise RuntimeError("WriterThread already started")
        self._started = True
        self._thread = threading.Thread(
            target=self._run, name="crawler-writer", daemon=False,
        )
        self._thread.start()

    def insert_page(self, scan_job_id: int, url: str, depth: int,
                    timeout: float = _DEFAULT_INSERT_TIMEOUT) -> int:
        """Synchronously insert (or look up) a 'pending' page row; return its id.

        Idempotent on (scan_job_id, url): duplicate URLs return the existing
        page_id without inserting a new row.
        """
        future: Future = Future()
        request = InsertPageRequest(
            scan_job_id=scan_job_id, url=url, depth=depth, future=future,
        )
        self._queue.put(request)
        return future.result(timeout=timeout)

    def write_page(self, request: PageWriteRequest) -> None:
        self._queue.put(request)

    def update_scan_job(self, request: ScanJobUpdateRequest) -> None:
        self._queue.put(request)

    def shutdown(self, timeout: float = _DEFAULT_SHUTDOWN_TIMEOUT) -> None:
        """Enqueue sentinel, join the thread, and re-raise any captured fatal error."""
        if self._shutdown_called:
            return
        self._shutdown_called = True
        if self._thread is None:
            return
        self._queue.put(_SHUTDOWN_SENTINEL)
        self._thread.join(timeout=timeout)
        if self._thread.is_alive():
            logger.error("WriterThread did not exit within %.1fs", timeout)
        if self.last_exception is not None:
            raise self.last_exception

    # --- internal ---

    def _run(self) -> None:
        try:
            conn = self._open_connection()
        except BaseException as exc:
            logger.exception("WriterThread failed to open connection")
            self.last_exception = exc
            return

        try:
            while True:
                try:
                    request = self._queue.get(timeout=_QUEUE_GET_TIMEOUT)
                except queue.Empty:
                    continue

                if request is _SHUTDOWN_SENTINEL:
                    return

                try:
                    self._handle_request(conn, request)
                except BaseException as exc:
                    logger.exception(
                        "Writer request failed (%s); continuing",
                        type(request).__name__,
                    )
                    self._fail_pending_future(request, exc)
                    # Per-message error: do not halt the writer or set
                    # last_exception. Connection state was reset by the
                    # handler's ROLLBACK.
        finally:
            try:
                conn.close()
            except Exception:
                logger.exception("Error closing writer connection")

    def _open_connection(self) -> sqlite3.Connection:
        # isolation_level=None lets us drive transactions explicitly via
        # BEGIN IMMEDIATE / COMMIT instead of relying on sqlite3's
        # implicit-begin behavior, which is needed because we want each
        # message to be its own atomic unit with no overlap.
        conn = sqlite3.connect(self._db_path, timeout=5.0, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.row_factory = sqlite3.Row
        return conn

    def _handle_request(self, conn: sqlite3.Connection, request) -> None:
        if isinstance(request, InsertPageRequest):
            page_id = self._insert_page(conn, request)
            request.future.set_result(page_id)
        elif isinstance(request, PageWriteRequest):
            self._write_page(conn, request)
        elif isinstance(request, ScanJobUpdateRequest):
            self._update_scan_job(conn, request)
        else:
            raise TypeError(
                f"Unknown writer request type: {type(request).__name__}"
            )

    def _insert_page(self, conn: sqlite3.Connection, req: InsertPageRequest) -> int:
        conn.execute("BEGIN IMMEDIATE")
        try:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO pages (scan_job_id, url, depth, status) "
                "VALUES (?, ?, ?, 'pending')",
                (req.scan_job_id, req.url, req.depth),
            )
            if cursor.rowcount > 0 and cursor.lastrowid:
                page_id = cursor.lastrowid
            else:
                row = conn.execute(
                    "SELECT id FROM pages WHERE scan_job_id = ? AND url = ?",
                    (req.scan_job_id, req.url),
                ).fetchone()
                if row is None:
                    raise RuntimeError(
                        f"insert_page: row missing after INSERT OR IGNORE "
                        f"(scan_job_id={req.scan_job_id}, url={req.url!r})"
                    )
                page_id = row["id"]
            conn.execute("COMMIT")
            return page_id
        except BaseException:
            _safe_rollback(conn)
            raise

    def _write_page(self, conn: sqlite3.Connection, req: PageWriteRequest) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        conn.execute("BEGIN IMMEDIATE")
        try:
            update_kwargs = {
                "status": req.page_status,
                "page_type": req.page_type,
                "failure_reason": req.failure_reason or "",
                "fetched_at": now,
            }
            sets = ", ".join(f"{k} = ?" for k in update_kwargs)
            vals = list(update_kwargs.values()) + [req.page_id]
            conn.execute(f"UPDATE pages SET {sets} WHERE id = ?", vals)

            if req.parse_result is not None:
                for resource in req.parse_result.resources:
                    resource.scan_job_id = req.scan_job_id
                    resource.page_id = req.page_id
                    save_resource_with_tags(self._db_path, resource, conn=conn)

            conn.execute("COMMIT")
        except BaseException:
            _safe_rollback(conn)
            raise

    def _update_scan_job(self, conn: sqlite3.Connection, req: ScanJobUpdateRequest) -> None:
        conn.execute("BEGIN IMMEDIATE")
        try:
            if req.status in _TERMINAL_JOB_STATUSES:
                conn.execute(
                    "UPDATE scan_jobs SET status = ?, pages_scanned = ?, "
                    "resources_found = ?, completed_at = CURRENT_TIMESTAMP "
                    "WHERE id = ?",
                    (req.status, req.pages_scanned, req.resources_found,
                     req.scan_job_id),
                )
            else:
                conn.execute(
                    "UPDATE scan_jobs SET status = ?, pages_scanned = ?, "
                    "resources_found = ? WHERE id = ?",
                    (req.status, req.pages_scanned, req.resources_found,
                     req.scan_job_id),
                )
            conn.execute("COMMIT")
        except BaseException:
            _safe_rollback(conn)
            raise

    @staticmethod
    def _fail_pending_future(request, exc: BaseException) -> None:
        future = getattr(request, "future", None)
        if future is not None and not future.done():
            future.set_exception(exc)


def _safe_rollback(conn: sqlite3.Connection) -> None:
    """Roll back without raising if no transaction is active."""
    try:
        conn.execute("ROLLBACK")
    except sqlite3.OperationalError:
        # "cannot rollback - no transaction is active" — connection is already
        # clean; safe to ignore.
        pass
