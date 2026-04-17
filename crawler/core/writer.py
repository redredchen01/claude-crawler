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
from concurrent.futures import Future, TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone

from crawler.models import (
    InsertPageRequest, InsertPagesBatchRequest, PageWriteRequest,
    ScanJobUpdateRequest,
)
from crawler.storage import save_resource_with_tags

logger = logging.getLogger(__name__)

_SHUTDOWN_SENTINEL = None
_DEFAULT_QUEUE_SIZE = 100
_DEFAULT_INSERT_TIMEOUT = 5.0
_DEFAULT_SHUTDOWN_TIMEOUT = 5.0
_DEFAULT_PRODUCER_TIMEOUT = 5.0  # bounded queue.put on producer paths
_QUEUE_GET_TIMEOUT = 0.5

# Cap parameters per insert_pages_batch SQL call to stay well below SQLite's
# SQLITE_MAX_VARIABLE_NUMBER (default 999 on older builds, 32766 on newer).
# A single high-fanout page with many in-domain links can overflow the IN(...)
# clause; chunking keeps us safe across all stock libsqlite3 builds.
_BATCH_CHUNK_SIZE = 500

_TERMINAL_JOB_STATUSES = frozenset({"completed", "failed", "cancelled"})


class WriterUnavailableError(RuntimeError):
    """Raised when the writer thread is dead or unable to accept work within the
    producer timeout. Callers should treat this as terminal — the writer is not
    recoverable within the current scan."""


class WriterThread:
    """Single writer thread owning one SQLite connection for the lifetime of a crawl."""

    def __init__(self, db_path: str, queue_size: int = _DEFAULT_QUEUE_SIZE,
                 producer_timeout: float = _DEFAULT_PRODUCER_TIMEOUT):
        self._db_path = db_path
        self._queue: queue.Queue = queue.Queue(maxsize=queue_size)
        self._producer_timeout = producer_timeout
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
        # daemon=True so the Python interpreter can exit cleanly even when the
        # writer is mid-loop. In-flight writes are lost on hard kill, but each
        # BEGIN IMMEDIATE/COMMIT is atomic so partial transactions don't leave
        # torn DB state. Pages whose writes didn't commit stay status='pending'
        # and are picked up by resume on the next run.
        self._thread = threading.Thread(
            target=self._run, name="crawler-writer", daemon=True,
        )
        self._thread.start()

    def is_alive(self) -> bool:
        """True if the writer thread is started and still processing.

        Producers should poll this when they need a fast-path "writer is dead"
        signal; the bounded `put` calls also raise :class:`WriterUnavailableError`
        on timeout, so this is an optimization, not a requirement for safety.
        """
        return self._thread is not None and self._thread.is_alive()

    def insert_page(self, scan_job_id: int, url: str, depth: int,
                    timeout: float = _DEFAULT_INSERT_TIMEOUT) -> int:
        """Synchronously insert (or look up) a 'pending' page row; return its id.

        Idempotent on (scan_job_id, url): duplicate URLs return the existing
        page_id without inserting a new row. Raises :class:`WriterUnavailableError`
        if the writer queue is full or the writer thread has died.
        """
        future: Future = Future()
        request = InsertPageRequest(
            scan_job_id=scan_job_id, url=url, depth=depth, future=future,
        )
        self._enqueue(request)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError as exc:
            # Future timeout while waiting for writer — likely the writer died
            # mid-message or the queue is backed up beyond expectations.
            raise WriterUnavailableError(
                f"insert_page Future timed out after {timeout}s "
                f"(writer alive={self.is_alive()})"
            ) from exc

    def write_page(self, request: PageWriteRequest) -> None:
        """Fire-and-forget per-page write. Raises WriterUnavailableError if the
        writer queue is full or the writer thread has died."""
        self._enqueue(request)

    def insert_pages_batch(self, scan_job_id: int, items: list[tuple[str, int]],
                           timeout: float = _DEFAULT_INSERT_TIMEOUT) -> list[int]:
        """Insert a batch of (url, depth) pairs in one transaction.

        Returns page_ids in the same order as ``items``. Idempotent on
        ``(scan_job_id, url)``: duplicates return the existing page_id.
        Empty input returns an empty list without enqueuing.
        """
        if not items:
            return []
        future: Future = Future()
        request = InsertPagesBatchRequest(
            scan_job_id=scan_job_id, items=list(items), future=future,
        )
        self._enqueue(request)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError as exc:
            raise WriterUnavailableError(
                f"insert_pages_batch Future timed out after {timeout}s "
                f"(writer alive={self.is_alive()})"
            ) from exc

    def update_scan_job(self, request: ScanJobUpdateRequest) -> None:
        """Terminal scan_job state update. Raises WriterUnavailableError if the
        writer queue is full or the writer thread has died."""
        self._enqueue(request)

    def _enqueue(self, item) -> None:
        """Bounded put with WriterUnavailableError on timeout / dead writer."""
        if self._thread is not None and not self._thread.is_alive():
            raise WriterUnavailableError(
                "WriterThread is not running (thread exited)"
            )
        try:
            self._queue.put(item, timeout=self._producer_timeout)
        except queue.Full as exc:
            raise WriterUnavailableError(
                f"WriterThread queue full after {self._producer_timeout}s "
                f"(alive={self.is_alive()})"
            ) from exc

    def shutdown(self, timeout: float = _DEFAULT_SHUTDOWN_TIMEOUT) -> None:
        """Drain the writer cleanly, with hard upper bounds on every step.

        Enqueues the sentinel via a bounded :meth:`queue.Queue.put`
        (``producer_timeout`` seconds) so a wedged or full queue can't make
        shutdown hang. If the put fails, logs and continues — the join
        still runs. After the join completes (or times out at ``timeout``),
        any captured fatal error in :attr:`last_exception` is re-raised so
        callers learn about a halted writer.

        Idempotent: subsequent calls are no-ops.
        """
        if self._shutdown_called:
            return
        self._shutdown_called = True
        if self._thread is None:
            return
        # Bounded put — if the queue is jammed AND the thread is wedged we
        # don't want shutdown itself to hang forever. The join below catches
        # the case where the thread is alive but not draining.
        try:
            self._queue.put(_SHUTDOWN_SENTINEL, timeout=self._producer_timeout)
        except queue.Full:
            logger.error(
                "WriterThread queue full during shutdown — sentinel not "
                "enqueued; thread may be wedged"
            )
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
        # synchronous=NORMAL halves fsync cost on every COMMIT while still
        # giving WAL-mode crash safety. The narrowed durability guarantee
        # (we may lose the *last* in-flight transaction on power loss vs
        # FULL's strict guarantee) is acceptable for a desktop crawler —
        # losses become 'pending' rows that resume picks up.
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _handle_request(self, conn: sqlite3.Connection, request) -> None:
        if isinstance(request, InsertPageRequest):
            page_id = self._insert_page(conn, request)
            request.future.set_result(page_id)
        elif isinstance(request, InsertPagesBatchRequest):
            page_ids = self._insert_pages_batch(conn, request)
            request.future.set_result(page_ids)
        elif isinstance(request, PageWriteRequest):
            try:
                self._write_page(conn, request)
            except BaseException as exc:
                # BaseException intentional: even on SystemExit/Keyboard-
                # Interrupt arriving in the writer thread, we want the
                # worker's reply Future to resolve so it doesn't hang on
                # future.result(). The `not done()` guard is defensive —
                # a future caller could already have cancelled it.
                if request.reply is not None and not request.reply.done():
                    request.reply.set_exception(exc)
                raise
            else:
                if request.reply is not None and not request.reply.done():
                    request.reply.set_result(True)
        elif isinstance(request, ScanJobUpdateRequest):
            self._update_scan_job(conn, request)
        else:
            raise TypeError(
                f"Unknown writer request type: {type(request).__name__}"
            )

    def _insert_pages_batch(self, conn: sqlite3.Connection,
                            req: InsertPagesBatchRequest) -> list[int]:
        """One BEGIN IMMEDIATE, chunked executemany INSERT OR IGNORE, then
        chunked SELECT to recover page_ids in input order.

        Chunking by ``_BATCH_CHUNK_SIZE`` ensures the SELECT IN (...) clause
        stays well under SQLite's ``SQLITE_MAX_VARIABLE_NUMBER`` (999 on
        older stock builds), even on a high-fanout page with thousands of
        in-domain links. The whole batch is still atomic — one BEGIN
        IMMEDIATE / COMMIT bracket — only the SQL is split.

        Duplicates within the batch return the same id at every position
        (matches INSERT OR IGNORE semantics).
        """
        if not req.items:
            return []
        conn.execute("BEGIN IMMEDIATE")
        try:
            insert_rows = [
                (req.scan_job_id, url, depth) for (url, depth) in req.items
            ]
            conn.executemany(
                "INSERT OR IGNORE INTO pages (scan_job_id, url, depth, status) "
                "VALUES (?, ?, ?, 'pending')",
                insert_rows,
            )

            # Recover ids in chunks — assemble a single url→id mapping
            # across all chunks, then resolve page_ids in input order.
            urls = [url for (url, _) in req.items]
            url_to_id: dict[str, int] = {}
            for start in range(0, len(urls), _BATCH_CHUNK_SIZE):
                chunk = urls[start:start + _BATCH_CHUNK_SIZE]
                placeholders = ",".join("?" * len(chunk))
                rows = conn.execute(
                    f"SELECT id, url FROM pages "
                    f"WHERE scan_job_id = ? AND url IN ({placeholders})",
                    [req.scan_job_id, *chunk],
                ).fetchall()
                for row in rows:
                    url_to_id[row["url"]] = row["id"]

            page_ids: list[int] = []
            for url, _ in req.items:
                pid = url_to_id.get(url)
                if pid is None:
                    raise RuntimeError(
                        f"insert_pages_batch: row missing for {url!r} "
                        f"after INSERT OR IGNORE"
                    )
                page_ids.append(pid)
            conn.execute("COMMIT")
            return page_ids
        except BaseException:
            _safe_rollback(conn)
            raise

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
                    "resources_found = ?, cache_hits = ?, cache_misses = ?, "
                    "completed_at = CURRENT_TIMESTAMP "
                    "WHERE id = ?",
                    (req.status, req.pages_scanned, req.resources_found,
                     req.cache_hits, req.cache_misses, req.scan_job_id),
                )
            else:
                conn.execute(
                    "UPDATE scan_jobs SET status = ?, pages_scanned = ?, "
                    "resources_found = ?, cache_hits = ?, cache_misses = ? WHERE id = ?",
                    (req.status, req.pages_scanned, req.resources_found,
                     req.cache_hits, req.cache_misses, req.scan_job_id),
                )
            conn.execute("COMMIT")
        except BaseException:
            _safe_rollback(conn)
            raise

    @staticmethod
    def _fail_pending_future(request, exc: BaseException) -> None:
        # InsertPageRequest / InsertPagesBatchRequest expose `.future`;
        # PageWriteRequest exposes `.reply`. Either way, the field carries a
        # Future the caller awaits, so failing both sites is uniform.
        for attr in ("future", "reply"):
            future = getattr(request, attr, None)
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
