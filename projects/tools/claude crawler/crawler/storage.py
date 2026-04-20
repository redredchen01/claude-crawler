"""SQLite storage: connection management, schema init, and CRUD operations."""

import sqlite3
import os
import threading
from contextlib import contextmanager
from datetime import datetime

from crawler.config import DB_PATH
from crawler.models import ScanJob, Page, Resource, Tag

# Serializes concurrent init_db calls within a single process. SQLite's
# `PRAGMA journal_mode=WAL` and `executescript` are racy when multiple
# threads bootstrap the same fresh DB simultaneously — this lock is cheap
# and avoids fighting SQLite's internal write locking during setup.
_INIT_LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS scan_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_url TEXT NOT NULL,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    max_pages INTEGER NOT NULL DEFAULT 200,
    max_depth INTEGER NOT NULL DEFAULT 3,
    pages_scanned INTEGER NOT NULL DEFAULT 0,
    resources_found INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id),
    url TEXT NOT NULL,
    page_type TEXT NOT NULL DEFAULT 'other',
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    fetched_at TIMESTAMP,
    failure_reason TEXT NOT NULL DEFAULT '',
    UNIQUE(scan_job_id, url)
);

CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id),
    page_id INTEGER DEFAULT NULL REFERENCES pages(id),
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    hearts INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    popularity_score REAL NOT NULL DEFAULT 0.0,
    raw_data TEXT NOT NULL DEFAULT '{}',
    UNIQUE(scan_job_id, url)
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id),
    name TEXT NOT NULL,
    resource_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(scan_job_id, name)
);

CREATE TABLE IF NOT EXISTS resource_tags (
    resource_id INTEGER NOT NULL REFERENCES resources(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (resource_id, tag_id)
);

CREATE TABLE IF NOT EXISTS http_cache (
    url TEXT UNIQUE NOT NULL,
    etag TEXT,
    last_modified TEXT,
    cache_control TEXT,
    cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    response_body BLOB,
    size_bytes INTEGER NOT NULL DEFAULT 0
);
"""


def init_db(db_path: str | None = None) -> str:
    """Initialize database and return the path used.

    Idempotent: safe to call on fresh or pre-existing DBs. Runs additive
    column migrations for pre-v0.2 databases that predate
    `pages.failure_reason` and `pages.cached`.
    """
    path = db_path or DB_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with _INIT_LOCK:
        with get_connection(path) as conn:
            conn.executescript(SCHEMA)
            _migrate_pages_add_failure_reason(conn)
            _migrate_pages_add_cached(conn)
            _migrate_http_cache(conn)
            _migrate_scan_jobs_add_cache_counters(conn)
    return path


def _migrate_pages_add_failure_reason(conn: sqlite3.Connection) -> None:
    """Add pages.failure_reason column if missing. Race-safe across threads/processes.

    Uses `PRAGMA busy_timeout` so a concurrent caller waits for the write lock
    instead of raising `database is locked`. Re-checks column existence under
    the write lock so only one caller issues ALTER TABLE.
    """
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(pages)")}
    if "failure_reason" in cols:
        return
    # Give concurrent migrations up to 5s to serialize.
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        conn.execute("BEGIN IMMEDIATE")
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(pages)")}
        if "failure_reason" not in cols:
            conn.execute("ALTER TABLE pages ADD COLUMN failure_reason TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if "duplicate column" not in str(exc).lower():
            raise


def _migrate_pages_add_cached(conn: sqlite3.Connection) -> None:
    """Add pages.cached column if missing. Race-safe across threads/processes."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(pages)")}
    if "cached" in cols:
        return
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        conn.execute("BEGIN IMMEDIATE")
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(pages)")}
        if "cached" not in cols:
            conn.execute("ALTER TABLE pages ADD COLUMN cached BOOLEAN DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if "duplicate column" not in str(exc).lower():
            raise


def _migrate_http_cache(conn: sqlite3.Connection) -> None:
    """Ensure http_cache table exists. Race-safe across threads/processes."""
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS http_cache ("
            "  url TEXT UNIQUE NOT NULL, "
            "  etag TEXT, "
            "  last_modified TEXT, "
            "  cache_control TEXT, "
            "  cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
            "  response_body BLOB, "
            "  size_bytes INTEGER NOT NULL DEFAULT 0 "
            ")"
        )
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if "already exists" not in str(exc).lower():
            raise


def _migrate_scan_jobs_add_cache_counters(conn: sqlite3.Connection) -> None:
    """Add scan_jobs.cache_hits and cache_misses columns if missing. Race-safe."""
    try:
        conn.execute("PRAGMA busy_timeout = 5000")
        cursor = conn.execute(
            "PRAGMA table_info(scan_jobs)"
        )
        cols = {row[1] for row in cursor.fetchall()}
        if "cache_hits" not in cols:
            conn.execute("ALTER TABLE scan_jobs ADD COLUMN cache_hits INTEGER NOT NULL DEFAULT 0")
        if "cache_misses" not in cols:
            conn.execute("ALTER TABLE scan_jobs ADD COLUMN cache_misses INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.rollback()
        if "duplicate column" not in str(exc).lower():
            raise


@contextmanager
def get_connection(db_path: str | None = None):
    """Context manager for SQLite connections with WAL mode and 5s busy_timeout.

    The busy_timeout tolerates brief contention during concurrent init_db calls
    and any non-writer-thread paths. The long-lived WriterThread sets its own
    PRAGMAs on its owned connection (see crawler.core.writer).
    """
    path = db_path or DB_PATH
    conn = sqlite3.connect(path, timeout=5.0)
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# --- ScanJob CRUD ---

def create_scan_job(db_path: str, entry_url: str, domain: str,
                    max_pages: int = 200, max_depth: int = 3) -> int:
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            "INSERT INTO scan_jobs (entry_url, domain, max_pages, max_depth) VALUES (?, ?, ?, ?)",
            (entry_url, domain, max_pages, max_depth),
        )
        return cursor.lastrowid


def get_scan_job(db_path: str, job_id: int) -> ScanJob | None:
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM scan_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return None
        return ScanJob(**dict(row))


def update_scan_job(db_path: str, job_id: int,
                    conn: sqlite3.Connection | None = None, **kwargs):
    """Update scan_job columns. If `conn` is provided, uses it without committing
    (caller manages transaction); otherwise opens its own connection.
    """
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [job_id]
    sql = f"UPDATE scan_jobs SET {sets} WHERE id = ?"
    if conn is not None:
        conn.execute(sql, vals)
        return
    with get_connection(db_path) as own_conn:
        own_conn.execute(sql, vals)


def list_scan_jobs(db_path: str) -> list[ScanJob]:
    with get_connection(db_path) as conn:
        rows = conn.execute("SELECT * FROM scan_jobs ORDER BY created_at DESC").fetchall()
        return [ScanJob(**dict(r)) for r in rows]


def delete_scan_job(db_path: str, job_id: int) -> None:
    """Delete a scan_job and all rows that reference it.

    Schema declares FKs without ON DELETE CASCADE, so we delete children
    explicitly inside one transaction. Order matters: resource_tags →
    tags/resources → pages → scan_jobs.

    Uses ``BEGIN IMMEDIATE`` so contention with a live WriterThread either
    resolves quickly (writer commits, our delete runs) or fails fast on a
    clear "database is locked" rather than letting the writer's next INSERT
    silently fail an FK constraint after we deleted the parent row.
    """
    with get_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM resource_tags WHERE resource_id IN "
            "(SELECT id FROM resources WHERE scan_job_id = ?)",
            (job_id,),
        )
        conn.execute("DELETE FROM resources WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM tags WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM pages WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM scan_jobs WHERE id = ?", (job_id,))


def get_scan_job_by_entry_url(db_path: str, entry_url: str) -> ScanJob | None:
    """Return the most recently created scan_job for ``entry_url``, if any."""
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM scan_jobs WHERE entry_url = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (entry_url,),
        ).fetchone()
        return ScanJob(**dict(row)) if row else None


def get_pending_pages(db_path: str, scan_job_id: int) -> list[tuple[str, int, int]]:
    """Return ``(url, depth, page_id)`` rows for pages still in 'pending' status.

    Used by the resume path to seed the frontier with work the previous run
    never finished.
    """
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT id, url, depth FROM pages "
            "WHERE scan_job_id = ? AND status = 'pending' "
            "ORDER BY depth, id",
            (scan_job_id,),
        ).fetchall()
        return [(r["url"], r["depth"], r["id"]) for r in rows]


def get_all_page_urls(db_path: str, scan_job_id: int) -> list[str]:
    """Return every URL the given scan_job has ever discovered, in any state."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT url FROM pages WHERE scan_job_id = ?",
            (scan_job_id,),
        ).fetchall()
        return [r["url"] for r in rows]


# --- Page CRUD ---

def insert_page(db_path: str, scan_job_id: int, url: str,
                page_type: str = "other", depth: int = 0) -> int | None:
    with get_connection(db_path) as conn:
        try:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO pages (scan_job_id, url, page_type, depth) VALUES (?, ?, ?, ?)",
                (scan_job_id, url, page_type, depth),
            )
            return cursor.lastrowid if cursor.rowcount > 0 else None
        except sqlite3.IntegrityError:
            return None


def update_page(db_path: str, page_id: int,
                conn: sqlite3.Connection | None = None, **kwargs):
    """Update page columns. If `conn` is provided, uses it without committing
    (caller manages transaction); otherwise opens its own connection.
    """
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [page_id]
    sql = f"UPDATE pages SET {sets} WHERE id = ?"
    if conn is not None:
        conn.execute(sql, vals)
        return
    with get_connection(db_path) as own_conn:
        own_conn.execute(sql, vals)


# --- Resource CRUD ---

def insert_resource(db_path: str, resource: Resource) -> int | None:
    with get_connection(db_path) as conn:
        try:
            cursor = conn.execute(
                """INSERT OR IGNORE INTO resources
                   (scan_job_id, page_id, title, url, cover_url, views, likes, hearts,
                    category, published_at, raw_data)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (resource.scan_job_id, resource.page_id, resource.title,
                 resource.url, resource.cover_url, resource.views, resource.likes,
                 resource.hearts, resource.category, resource.published_at, resource.raw_data),
            )
            return cursor.lastrowid if cursor.rowcount > 0 else None
        except sqlite3.IntegrityError:
            return None


# CHAR(31) is the ASCII unit separator — a control character that never
# appears in legitimate tag text, so it's safe as a splitter without escaping.
_TAG_JOIN_SEP = chr(31)


def get_resources(db_path: str, scan_job_id: int) -> list[Resource]:
    """Return all resources for a scan_job with tags populated.

    Uses a single LEFT JOIN + GROUP_CONCAT query instead of the prior N+1
    per-resource tag lookup. For a scan with N resources, this is 1 query
    instead of N+1.
    """
    sql = """
        SELECT r.*, GROUP_CONCAT(t.name, ?) AS tag_names
        FROM resources r
        LEFT JOIN resource_tags rt ON rt.resource_id = r.id
        LEFT JOIN tags t ON t.id = rt.tag_id
        WHERE r.scan_job_id = ?
        GROUP BY r.id
        ORDER BY r.popularity_score DESC
    """
    with get_connection(db_path) as conn:
        rows = conn.execute(sql, (_TAG_JOIN_SEP, scan_job_id)).fetchall()
        resources: list[Resource] = []
        for r in rows:
            row_dict = {k: r[k] for k in r.keys() if k != "tag_names"}
            res = Resource(**row_dict)
            tag_names = r["tag_names"]
            res.tags = tag_names.split(_TAG_JOIN_SEP) if tag_names else []
            resources.append(res)
        return resources


def update_resource_scores(db_path: str, scores: dict[int, float]):
    """Batch update popularity scores. scores: {resource_id: score}"""
    with get_connection(db_path) as conn:
        for rid, score in scores.items():
            conn.execute(
                "UPDATE resources SET popularity_score = ? WHERE id = ?",
                (score, rid),
            )


# --- Tag CRUD ---

def get_or_create_tag(db_path: str, scan_job_id: int, name: str) -> int:
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id FROM tags WHERE scan_job_id = ? AND name = ?",
            (scan_job_id, name),
        ).fetchone()
        if row:
            return row["id"]
        cursor = conn.execute(
            "INSERT INTO tags (scan_job_id, name) VALUES (?, ?)",
            (scan_job_id, name),
        )
        return cursor.lastrowid


def link_resource_tag(db_path: str, resource_id: int, tag_id: int):
    with get_connection(db_path) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) VALUES (?, ?)",
            (resource_id, tag_id),
        )


def update_tag_counts(db_path: str, scan_job_id: int):
    """Recount resource_count for all tags in a scan job."""
    with get_connection(db_path) as conn:
        conn.execute(
            """UPDATE tags SET resource_count = (
                SELECT COUNT(*) FROM resource_tags rt
                JOIN resources r ON rt.resource_id = r.id
                WHERE rt.tag_id = tags.id AND r.scan_job_id = ?
            ) WHERE scan_job_id = ?""",
            (scan_job_id, scan_job_id),
        )


def get_tags(db_path: str, scan_job_id: int) -> list[Tag]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM tags WHERE scan_job_id = ? ORDER BY resource_count DESC",
            (scan_job_id,),
        ).fetchall()
        return [Tag(**dict(r)) for r in rows]


def get_resources_by_tag(db_path: str, tag_id: int, limit: int = 10) -> list[Resource]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """SELECT r.* FROM resources r
               JOIN resource_tags rt ON r.id = rt.resource_id
               WHERE rt.tag_id = ?
               ORDER BY r.popularity_score DESC LIMIT ?""",
            (tag_id, limit),
        ).fetchall()
        return [Resource(**dict(r)) for r in rows]


def save_resource_with_tags(db_path: str, resource: Resource, conn: sqlite3.Connection | None = None) -> int | None:
    """Insert resource and link its tags. Returns resource_id or None if duplicate.

    If conn is provided, reuses it (batch mode); otherwise opens its own connection.
    Batch mode is more efficient when called in a loop.
    """
    close_conn = False
    if conn is None:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        close_conn = True

    try:
        # Insert resource
        cursor = conn.execute(
            """INSERT OR IGNORE INTO resources
               (scan_job_id, page_id, title, url, cover_url, views, likes, hearts,
                category, published_at, raw_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (resource.scan_job_id, resource.page_id, resource.title,
             resource.url, resource.cover_url, resource.views, resource.likes,
             resource.hearts, resource.category, resource.published_at, resource.raw_data),
        )
        resource_id = cursor.lastrowid if cursor.rowcount > 0 else None

        if resource_id is None:
            return None

        # Collect (resource_id, tag_id) pairs via single-tag get-or-create,
        # then batch the resource_tags inserts via executemany.
        tag_link_pairs: list[tuple[int, int]] = []
        for tag_name in resource.tags:
            tag_name = tag_name.strip()
            if not tag_name:
                continue
            row = conn.execute(
                "SELECT id FROM tags WHERE scan_job_id = ? AND name = ?",
                (resource.scan_job_id, tag_name),
            ).fetchone()
            if row:
                tag_id = row["id"]
            else:
                cursor = conn.execute(
                    "INSERT INTO tags (scan_job_id, name) VALUES (?, ?)",
                    (resource.scan_job_id, tag_name),
                )
                tag_id = cursor.lastrowid
            tag_link_pairs.append((resource_id, tag_id))

        # Batch all resource-tag links in a single executemany.
        if tag_link_pairs:
            conn.executemany(
                "INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) VALUES (?, ?)",
                tag_link_pairs,
            )

        if close_conn:
            conn.commit()
        return resource_id

    finally:
        if close_conn:
            conn.close()


# --- HTTP Cache CRUD ---

def get_cached_response(conn: sqlite3.Connection, url: str) -> dict | None:
    """Fetch cached response metadata + body for URL. Returns dict or None if not cached."""
    row = conn.execute(
        "SELECT etag, last_modified, cache_control, cached_at, response_body, size_bytes "
        "FROM http_cache WHERE url = ?",
        (url,),
    ).fetchone()
    if row is None:
        return None
    return {
        "etag": row["etag"],
        "last_modified": row["last_modified"],
        "cache_control": row["cache_control"],
        "cached_at": row["cached_at"],
        "response_body": row["response_body"],
        "size_bytes": row["size_bytes"],
    }


def save_cached_response(conn: sqlite3.Connection, url: str, etag: str | None,
                        last_modified: str | None, cache_control: str | None,
                        response_body: bytes) -> None:
    """Store or update cached response (UPSERT)."""
    conn.execute(
        """INSERT INTO http_cache (url, etag, last_modified, cache_control, response_body, size_bytes, cached_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(url) DO UPDATE SET
               etag = excluded.etag,
               last_modified = excluded.last_modified,
               cache_control = excluded.cache_control,
               response_body = excluded.response_body,
               size_bytes = excluded.size_bytes,
               cached_at = CURRENT_TIMESTAMP""",
        (url, etag, last_modified, cache_control, response_body, len(response_body)),
    )


def clear_http_cache(conn: sqlite3.Connection) -> None:
    """Delete all cached responses."""
    conn.execute("DELETE FROM http_cache")


def get_cache_metrics(conn: sqlite3.Connection) -> dict:
    """Return cache statistics: total size, hit count, per-domain breakdown."""
    cache_size = conn.execute("SELECT SUM(size_bytes) as total FROM http_cache").fetchone()
    total_bytes = cache_size["total"] or 0
    entry_count = conn.execute("SELECT COUNT(*) as count FROM http_cache").fetchone()["count"]
    return {
        "total_bytes": total_bytes,
        "entry_count": entry_count,
    }


def get_scan_job_stats(db_path: str, scan_job_id: int):
    """Get statistics for a scan job: success/failure counts, failure reasons distribution, avg resources/page."""
    from crawler.models import ScanJobStats

    with get_connection(db_path) as conn:
        job_row = conn.execute(
            "SELECT id FROM scan_jobs WHERE id = ?", (scan_job_id,)
        ).fetchone()
        if not job_row:
            return None

        stats_row = conn.execute(
            """SELECT
               COUNT(CASE WHEN status = 'fetched' THEN 1 END) as pages_success,
               COUNT(CASE WHEN status = 'failed' THEN 1 END) as pages_failed,
               COALESCE(AVG(
                   COALESCE((SELECT COUNT(*) FROM resources WHERE page_id = pages.id), 0)
               ), 0.0) as resources_avg_per_page
            FROM pages WHERE scan_job_id = ?""",
            (scan_job_id,)
        ).fetchone()

        failure_reasons = conn.execute(
            """SELECT failure_reason, COUNT(*) as count
            FROM pages WHERE scan_job_id = ? AND status = 'failed' AND failure_reason != ''
            GROUP BY failure_reason""",
            (scan_job_id,)
        ).fetchall()

        failed_reasons_dict = {row["failure_reason"]: row["count"] for row in failure_reasons}

        return ScanJobStats(
            scan_job_id=scan_job_id,
            pages_success=stats_row["pages_success"],
            pages_failed=stats_row["pages_failed"],
            failed_reasons_dict=failed_reasons_dict,
            resources_avg_per_page=stats_row["resources_avg_per_page"],
        )


def list_scan_jobs_filtered(
    db_path: str,
    domain_filter: str | None = None,
    status_filter: str | None = None,
    resource_min: int | None = None,
    resource_max: int | None = None,
    sort_by: str = "created_at",
    limit: int | None = None,
    offset: int = 0,
):
    """List scan jobs with filtering and pagination."""
    from crawler.models import ScanJob

    with get_connection(db_path) as conn:
        query = "SELECT * FROM scan_jobs WHERE 1=1"
        params = []

        if domain_filter:
            query += " AND domain LIKE ?"
            params.append(f"%{domain_filter}%")

        if status_filter:
            query += " AND status = ?"
            params.append(status_filter)

        if resource_min is not None:
            query += " AND resources_found >= ?"
            params.append(resource_min)

        if resource_max is not None:
            query += " AND resources_found <= ?"
            params.append(resource_max)

        if sort_by == "created_at":
            query += " ORDER BY created_at DESC"
        elif sort_by == "created_at_asc":
            query += " ORDER BY created_at ASC"
        elif sort_by == "pages_scanned_desc":
            query += " ORDER BY pages_scanned DESC"
        else:
            query += " ORDER BY created_at DESC"

        if limit is not None:
            query += f" LIMIT {limit}"

        if offset:
            query += f" OFFSET {offset}"

        rows = conn.execute(query, params).fetchall()
        return [
            ScanJob(
                id=row["id"],
                entry_url=row["entry_url"],
                domain=row["domain"],
                status=row["status"],
                max_pages=row["max_pages"],
                max_depth=row["max_depth"],
                pages_scanned=row["pages_scanned"],
                resources_found=row["resources_found"],
                created_at=row["created_at"],
                completed_at=row["completed_at"],
                cache_hits=row["cache_hits"],
                cache_misses=row["cache_misses"],
            )
            for row in rows
        ]


def count_scan_jobs_filtered(
    db_path: str,
    domain_filter: str | None = None,
    status_filter: str | None = None,
    resource_min: int | None = None,
    resource_max: int | None = None,
) -> int:
    """Count scan jobs matching filters (for pagination)."""
    with get_connection(db_path) as conn:
        query = "SELECT COUNT(*) as count FROM scan_jobs WHERE 1=1"
        params = []

        if domain_filter:
            query += " AND domain LIKE ?"
            params.append(f"%{domain_filter}%")

        if status_filter:
            query += " AND status = ?"
            params.append(status_filter)

        if resource_min is not None:
            query += " AND resources_found >= ?"
            params.append(resource_min)

        if resource_max is not None:
            query += " AND resources_found <= ?"
            params.append(resource_max)

        row = conn.execute(query, params).fetchone()
        return row["count"]


def export_scan_job_metadata(db_path: str, scan_job_id: int) -> dict:
    """Export scan job metadata as JSON-friendly dict: {scan_job: {...}, pages: [...], stats: {...}}."""
    from crawler.models import ScanJob

    with get_connection(db_path) as conn:
        job_row = conn.execute(
            "SELECT * FROM scan_jobs WHERE id = ?", (scan_job_id,)
        ).fetchone()
        if not job_row:
            return {}

        job = ScanJob(
            id=job_row["id"],
            entry_url=job_row["entry_url"],
            domain=job_row["domain"],
            status=job_row["status"],
            max_pages=job_row["max_pages"],
            max_depth=job_row["max_depth"],
            pages_scanned=job_row["pages_scanned"],
            resources_found=job_row["resources_found"],
            created_at=job_row["created_at"],
            completed_at=job_row["completed_at"],
            cache_hits=job_row["cache_hits"],
            cache_misses=job_row["cache_misses"],
        )

        pages = conn.execute(
            """SELECT id, url, page_type, depth, status, failure_reason
            FROM pages WHERE scan_job_id = ?
            ORDER BY depth ASC""",
            (scan_job_id,)
        ).fetchall()

        stats = get_scan_job_stats(db_path, scan_job_id)

        return {
            "scan_job": {
                "id": job.id,
                "entry_url": job.entry_url,
                "domain": job.domain,
                "status": job.status,
                "max_pages": job.max_pages,
                "max_depth": job.max_depth,
                "pages_scanned": job.pages_scanned,
                "resources_found": job.resources_found,
                "created_at": job.created_at,
                "completed_at": job.completed_at,
                "cache_hits": job.cache_hits,
                "cache_misses": job.cache_misses,
            },
            "pages": [
                {
                    "id": p["id"],
                    "url": p["url"],
                    "page_type": p["page_type"],
                    "depth": p["depth"],
                    "status": p["status"],
                    "failure_reason": p["failure_reason"],
                }
                for p in pages
            ],
            "stats": {
                "pages_success": stats.pages_success,
                "pages_failed": stats.pages_failed,
                "failed_reasons_dict": stats.failed_reasons_dict,
                "resources_avg_per_page": stats.resources_avg_per_page,
            } if stats else {},
        }
