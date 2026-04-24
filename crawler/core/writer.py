from __future__ import annotations

import logging
import queue
import sqlite3
import threading
from concurrent.futures import Future
from datetime import datetime, timezone
from typing import Any


class WriterUnavailableError(RuntimeError):
    """Raised when the writer queue is full or the writer thread is dead."""


from crawler.models import (
    InsertPageRequest,
    InsertPagesBatchRequest,
    PageWriteRequest,
    ScanJobUpdateRequest,
)
from crawler.storage import save_resource_with_tags, get_connection

logger = logging.getLogger(__name__)

_SHUTDOWN_SENTINEL = None
_QUEUE_GET_TIMEOUT = 0.5
_DEFAULT_PRODUCER_TIMEOUT = 5.0

class WriterThread:
    """A highly responsive writer thread that prioritizes real-time metric updates."""
    def __init__(self, db_path: str, queue_size: int = 200):
        self._db_path = db_path
        self._queue = queue.Queue(maxsize=queue_size)
        self._thread = None
        self._started = False
        self._shutdown_called = False
        self.last_exception = None

    def start(self):
        if self._started: return
        self._started = True
        self._thread = threading.Thread(target=self._run, name="crawler-writer", daemon=True)
        self._thread.start()

    def is_alive(self): return self._thread and self._thread.is_alive()

    def _safe_put(self, req, timeout=_DEFAULT_PRODUCER_TIMEOUT):
        if not self.is_alive():
            raise WriterUnavailableError("Writer thread is dead")
        try:
            self._queue.put(req, timeout=timeout)
        except queue.Full:
            raise WriterUnavailableError("Writer queue is full")

    def insert_page(self, scan_job_id, url, depth) -> int:
        f = Future()
        self._safe_put(InsertPageRequest(scan_job_id, url, depth, f))
        return f.result(timeout=10.0)

    def write_page(self, req: PageWriteRequest):
        self._safe_put(req)

    def insert_pages_batch(self, scan_job_id, items) -> list[int]:
        if not items: return []
        f = Future()
        self._safe_put(InsertPagesBatchRequest(scan_job_id, items, f))
        return f.result(timeout=15.0)

    def update_scan_job(self, req: ScanJobUpdateRequest):
        self._safe_put(req)

    def shutdown(self, timeout=5.0):
        try: self._queue.put(_SHUTDOWN_SENTINEL, timeout=timeout)
        except: pass
        if self._thread: self._thread.join(timeout=timeout)

    @classmethod
    def _open_connection(cls, db_path, write=False):
        return get_connection(db_path, write=write)

    def _run(self):
        # Dedicated long-lived connection for the writer
        import sqlite3
        conn = sqlite3.connect(self._db_path, timeout=10.0, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        conn.row_factory = sqlite3.Row
        
        try:
            while True:
                try:
                    req = self._queue.get(timeout=_QUEUE_GET_TIMEOUT)
                except queue.Empty: continue
                
                if req is _SHUTDOWN_SENTINEL: break
                
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    self._handle(conn, req)
                    conn.execute("COMMIT")
                except Exception as e:
                    try:
                        conn.execute("ROLLBACK")
                    except: pass
                    logger.error(f"Writer error: {e}")
                    self.last_exception = e
                    if hasattr(req, "future") and req.future and not req.future.done():
                        req.future.set_exception(e)
                    if hasattr(req, "reply") and req.reply and not req.reply.done():
                        req.reply.set_exception(e)
        except Exception as e:
            logger.error(f"Writer thread FATAL error: {e}")
            self.last_exception = e
        finally:
            try: conn.close()
            except: pass

    def _handle(self, conn, req):
        if isinstance(req, InsertPageRequest):
            cur = conn.execute("INSERT OR IGNORE INTO pages (scan_job_id, url, depth) VALUES (?,?,?)", (req.scan_job_id, req.url, req.depth))
            pid = cur.lastrowid or conn.execute("SELECT id FROM pages WHERE scan_job_id=? AND url=?", (req.scan_job_id, req.url)).fetchone()[0]
            req.future.set_result(pid)
            
        elif isinstance(req, InsertPagesBatchRequest):
            pids = []
            # R14: True batch insert using executemany and atomic SELECT
            conn.executemany(
                "INSERT OR IGNORE INTO pages (scan_job_id, url, depth, status) VALUES (?, ?, ?, 'pending')",
                [(req.scan_job_id, url, depth) for url, depth in req.items],
            )
            # Recover IDs for the whole batch, chunked to avoid SQLite limit
            urls = [url for url, depth in req.items]
            id_map = {}
            for i in range(0, len(urls), 500):
                chunk = urls[i:i+500]
                placeholders = ",".join("?" for _ in chunk)
                rows = conn.execute(
                    f"SELECT url, id FROM pages WHERE scan_job_id=? AND url IN ({placeholders})",
                    (req.scan_job_id, *chunk),
                ).fetchall()
                for row in rows:
                    id_map[row["url"]] = row["id"]
            
            pids = [id_map.get(url) for url in urls]
            req.future.set_result(pids)
            
        elif isinstance(req, PageWriteRequest):
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("UPDATE pages SET status=?, page_type=?, failure_reason=?, fetched_at=? WHERE id=?", 
                         (req.page_status, req.page_type, req.failure_reason or "", now, req.page_id))
            
            if req.parse_result:
                res_count = 0
                for res in req.parse_result.resources:
                    res.scan_job_id = req.scan_job_id
                    res.page_id = req.page_id
                    save_resource_with_tags(self._db_path, res, conn=conn)
                    res_count += 1
                
                # R14: Incremental stats update for speed
                conn.execute(
                    "UPDATE scan_jobs SET pages_scanned = pages_scanned + 1, resources_found = resources_found + ? WHERE id = ?",
                    (res_count, req.scan_job_id)
                )
            else:
                # Failure case: just increment pages_scanned
                conn.execute(
                    "UPDATE scan_jobs SET pages_scanned = pages_scanned + 1 WHERE id = ?",
                    (req.scan_job_id,)
                )
            if req.reply: req.reply.set_result(True)

        elif isinstance(req, ScanJobUpdateRequest):
            conn.execute("UPDATE scan_jobs SET status=? WHERE id=?", (req.status, req.scan_job_id))
