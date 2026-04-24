from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import zlib
from contextlib import contextmanager
from urllib.parse import urlparse

from crawler.config import DB_PATH
from crawler.models import Resource, ScanJob, Tag

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
    cache_hits INTEGER NOT NULL DEFAULT 0,
    cache_misses INTEGER NOT NULL DEFAULT 0,
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
    cached BOOLEAN DEFAULT 0
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
    popularity_score REAL NOT NULL DEFAULT 0.0,
    raw_data TEXT NOT NULL DEFAULT '{}',
    content_fingerprint TEXT,
    content_dna TEXT,
    origin_sites TEXT,
    alternative_urls TEXT,
    UNIQUE(scan_job_id, url)
);
CREATE TABLE IF NOT EXISTS site_profiles (
    domain TEXT PRIMARY KEY,
    container_selector TEXT,
    title_selector TEXT,
    success_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    url TEXT UNIQUE,
    etag TEXT,
    last_modified TEXT,
    cache_control TEXT,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_body BLOB,
    size_bytes INTEGER
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id),
    event_type TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    url TEXT,
    metadata TEXT
);

-- Phase 15: Monitored Targets (The Sentinel)
CREATE TABLE IF NOT EXISTS monitored_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    label TEXT,
    frequency_hours INTEGER NOT NULL DEFAULT 24,
    last_scanned_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Phase 5: Full-Text Search Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
    title,
    category,
    content='resources',
    content_rowid='id'
);

-- Phase 14: Global Data Vault (Permanent Storage)
CREATE TABLE IF NOT EXISTS global_vault (
    url TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    content_fingerprint TEXT,
    popularity_score REAL NOT NULL DEFAULT 0.0,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS trg_resources_ai AFTER INSERT ON resources BEGIN
  INSERT INTO resources_fts(rowid, title, category) VALUES (new.id, new.title, new.category);
END;

CREATE TRIGGER IF NOT EXISTS trg_resources_ad AFTER DELETE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, category) VALUES('delete', old.id, old.title, old.category);
END;

CREATE TRIGGER IF NOT EXISTS trg_resources_au AFTER UPDATE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, category) VALUES('delete', old.id, old.title, old.category);
  INSERT INTO resources_fts(rowid, title, category) VALUES (new.id, new.title, new.category);
END;
"""


def _migrate_scan_jobs(conn):
    # Add missing columns if they are not present (idempotent)
    cur = conn.execute("PRAGMA table_info(scan_jobs)")
    existing = {row[1] for row in cur.fetchall()}
    alterations = []
    if "pages_scanned" not in existing:
        alterations.append("pages_scanned INTEGER NOT NULL DEFAULT 0")
    if "resources_found" not in existing:
        alterations.append("resources_found INTEGER NOT NULL DEFAULT 0")
    if "cache_hits" not in existing:
        alterations.append("cache_hits INTEGER NOT NULL DEFAULT 0")
    if "cache_misses" not in existing:
        alterations.append("cache_misses INTEGER NOT NULL DEFAULT 0")
    if "avg_page_time_ms" not in existing:
        alterations.append("avg_page_time_ms INTEGER NOT NULL DEFAULT 0")
    if "error_count" not in existing:
        alterations.append("error_count INTEGER NOT NULL DEFAULT 0")
    if alterations:
        for stmt in alterations:
            conn.execute(f"ALTER TABLE scan_jobs ADD COLUMN {stmt}")
    return conn


def _migrate_pages(conn):
    cur = conn.execute("PRAGMA table_info(pages)")
    existing = {row[1] for row in cur.fetchall()}
    if "failure_reason" not in existing:
        conn.execute(
            "ALTER TABLE pages ADD COLUMN failure_reason TEXT NOT NULL DEFAULT ''"
        )
    return conn


def _create_indexes(conn):
    # Performance Indexes for Phase 2/3
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resources_scan_job ON resources (scan_job_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resources_fingerprint ON resources (content_fingerprint)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resources_dna ON resources (content_dna)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pages_scan_url ON pages (scan_job_id, url)")
    return conn


def init_db(db_path: str | None = None) -> str:
    path = db_path or DB_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with _INIT_LOCK:
        with sqlite3.connect(path) as conn:
            # R27 Refined: Safety first
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            
            # R32: Self-healing check
            try:
                conn.execute("PRAGMA integrity_check(10)") # Quick scan
            except sqlite3.DatabaseError:
                logger.error("DB Corrupted! Initiating rescue...")
                # Try FTS5 rebuild as it's the most common failure point
                try: conn.execute("INSERT INTO resources_fts(resources_fts) VALUES('rebuild')")
                except: pass

            conn.executescript(SCHEMA)
            _migrate_scan_jobs(conn)
            _migrate_pages(conn)
            _create_indexes(conn)
    return path


@contextmanager
def get_connection(db_path: str | None = None, write: bool = False):
    path = db_path or DB_PATH
    # R27: Longer busy_timeout for high-concurrency 8+ threads
    # isolation_level=None disables Python's implicit transaction management
    conn = sqlite3.connect(path, timeout=10.0, isolation_level=None)
    
    # R14: Configure safety levels BEFORE entering a transaction
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.row_factory = sqlite3.Row
    
    try:
        if write:
            # Atomic: prevent concurrent reservation of the write lock
            conn.execute("BEGIN IMMEDIATE")
        else:
            conn.execute("BEGIN DEFERRED")
            
        yield conn
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except:
            pass
        raise
    finally:
        conn.close()


def sync_legacy_to_vault(db_path: str) -> int:
    """Retroactively populate the global_vault with all existing resources from past missions."""
    with get_connection(db_path, write=True) as conn:
        cursor = conn.execute(
            """
            INSERT INTO global_vault (url, title, cover_url, category, tags, content_fingerprint, popularity_score)
            SELECT 
                r.url, 
                r.title, 
                r.cover_url, 
                r.category, 
                COALESCE((
                    SELECT GROUP_CONCAT(t.name, ', ') 
                    FROM tags t 
                    JOIN resource_tags rt ON t.id = rt.tag_id 
                    WHERE rt.resource_id = r.id
                ), ''),
                r.content_fingerprint, 
                r.popularity_score
            FROM resources r
            WHERE TRUE
            ON CONFLICT(url) DO UPDATE SET
                title = CASE WHEN excluded.title != '' THEN excluded.title ELSE global_vault.title END,
                cover_url = CASE WHEN excluded.cover_url != '' THEN excluded.cover_url ELSE global_vault.cover_url END,
                category = CASE WHEN excluded.category != '' THEN excluded.category ELSE global_vault.category END,
                tags = CASE WHEN excluded.tags != '' THEN excluded.tags ELSE global_vault.tags END,
                popularity_score = MAX(global_vault.popularity_score, excluded.popularity_score),
                last_updated_at = CURRENT_TIMESTAMP
            """
        )
        return cursor.rowcount

def list_monitored_targets(db_path: str) -> list[dict]:
    with get_connection(db_path) as conn:
        rows = conn.execute("SELECT * FROM monitored_targets ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

def add_monitored_target(db_path: str, url: str, label: str, freq: int):
    with get_connection(db_path, write=True) as conn:
        conn.execute(
            "INSERT INTO monitored_targets (url, label, frequency_hours) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET label=excluded.label, frequency_hours=excluded.frequency_hours",
            (url, label, freq)
        )

def update_monitored_scan_time(db_path: str, target_id: int):
    with get_connection(db_path, write=True) as conn:
        conn.execute("UPDATE monitored_targets SET last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?", (target_id,))

def delete_monitored_target(db_path, tid):
    with get_connection(db_path, write=True) as conn:
        conn.execute("DELETE FROM monitored_targets WHERE id = ?", (tid,))

def get_realtime_stats(db_path: str, job_id: int) -> dict:
    """The absolute source of truth. Uses O(1) cached metrics from scan_jobs."""
    try:
        with get_connection(db_path) as conn:
            # R36: O(1) metric retrieval instead of COUNT(*) on large tables
            job = conn.execute(
                "SELECT status, pages_scanned, resources_found, avg_page_time_ms FROM scan_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            
            if not job:
                return {}
                
            # Count failed pages
            failed = conn.execute(
                "SELECT COUNT(*) FROM pages WHERE scan_job_id = ? AND status = 'failed'",
                (job_id,),
            ).fetchone()[0]

            return {
                "status": job["status"],
                "pages_done": job["pages_scanned"],
                "failed_count": failed,
                "resources_found": job["resources_found"],
                "avg_page_time_ms": job["avg_page_time_ms"] if "avg_page_time_ms" in job.keys() else 0,
            }
    except:
        return {}


def save_site_profile(db_path, domain, container_sel, title_sel):
    with get_connection(db_path, write=True) as conn:
        conn.execute(
            "INSERT INTO site_profiles (domain, container_selector, title_selector, success_count) VALUES (?, ?, ?, 1) ON CONFLICT(domain) DO UPDATE SET container_selector=excluded.container_selector, success_count=success_count+1",
            (domain, container_sel, title_sel),
        )


def get_site_profile(db_path, domain):
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM site_profiles WHERE domain = ?", (domain,)
        ).fetchone()
        return dict(row) if row else None


def create_scan_job(db_path, url, domain, max_p=200, max_d=3):
    with get_connection(db_path, write=True) as conn:
        return conn.execute(
            "INSERT INTO scan_jobs (entry_url, domain, max_pages, max_depth) VALUES (?, ?, ?, ?)",
            (url, domain, max_p, max_d),
        ).lastrowid


def update_scan_job(db_path, job_id, **kwargs):
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [job_id]
    with get_connection(db_path, write=True) as conn:
        conn.execute(f"UPDATE scan_jobs SET {sets} WHERE id = ?", vals)


def list_scan_jobs(db_path):
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM scan_jobs ORDER BY created_at DESC"
        ).fetchall()
        return [ScanJob(**dict(r)) for r in rows]


def get_scan_job(db_path, job_id):
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM scan_jobs WHERE id = ?", (job_id,)).fetchone()
        return ScanJob(**dict(row)) if row else None


def get_scan_job_by_entry_url(db_path, url):
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM scan_jobs WHERE entry_url = ? ORDER BY created_at DESC LIMIT 1",
            (url,),
        ).fetchone()
        return ScanJob(**dict(row)) if row else None


def save_resource_with_tags(db_path, resource, conn=None):
    if conn is None:
        with get_connection(db_path, write=True) as conn:
            return save_resource_with_tags(db_path, resource, conn=conn)

    try:
        title_fp = re.sub(r"[^\w\u4e00-\u9fa5]+", "", resource.title).lower()
        dom = urlparse(resource.url).netloc.lower()

        # Cross-site Entanglement Check
        clauses = ["content_fingerprint = ?"]
        params = [resource.scan_job_id, title_fp]
        if resource.content_dna:
            clauses.append("content_dna = ?")
            params.append(resource.content_dna)
        exist = conn.execute(
            f"SELECT id, views, cover_url FROM resources WHERE scan_job_id = ? AND ({' OR '.join(clauses)})",
            params,
        ).fetchone()

        if exist:
            res_id = exist["id"]
            # Just update counts if exists, don't crash
            conn.execute(
                "UPDATE resources SET views = MAX(views, ?), likes = MAX(likes, ?), hearts = MAX(hearts, ?) WHERE id = ?",
                (resource.views, resource.likes, resource.hearts, res_id),
            )
        else:
            # R22: Robust insert with IGNORE fallback
            cursor = conn.execute(
                "INSERT OR IGNORE INTO resources (scan_job_id, page_id, title, url, cover_url, views, likes, hearts, category, content_fingerprint, content_dna, origin_sites, raw_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    resource.scan_job_id,
                    resource.page_id,
                    resource.title,
                    resource.url,
                    resource.cover_url,
                    resource.views,
                    resource.likes,
                    resource.hearts,
                    resource.category,
                    resource.content_fingerprint,
                    resource.content_dna,
                    resource.origin_sites,
                    resource.raw_data,
                ),
            )
            res_id = cursor.lastrowid
            # If IGNORE happened, lastrowid might be None, fetch it
            if res_id is None:
                row = conn.execute("SELECT id FROM resources WHERE scan_job_id=? AND url=?", (resource.scan_job_id, resource.url)).fetchone()
                res_id = row["id"] if row else None

        for t in resource.tags:
            t = t.strip()
            if not t:
                continue
            tag_row = conn.execute(
                "SELECT id FROM tags WHERE scan_job_id = ? AND name = ?",
                (resource.scan_job_id, t),
            ).fetchone()
            tid = (
                tag_row["id"]
                if tag_row
                else conn.execute(
                    "INSERT INTO tags (scan_job_id, name) VALUES (?,?)",
                    (resource.scan_job_id, t),
                ).lastrowid
            )
            conn.execute(
                "INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) VALUES (?, ?)",
                (res_id, tid),
            )

        # Phase 14: Permanent Archival
        # Save or update the resource in the global_vault so it never disappears.
        tags_str = ", ".join(resource.tags) if resource.tags else ""
        conn.execute(
            """
            INSERT INTO global_vault (url, title, cover_url, category, tags, content_fingerprint, popularity_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                title = CASE WHEN excluded.title != '' THEN excluded.title ELSE global_vault.title END,
                cover_url = CASE WHEN excluded.cover_url != '' THEN excluded.cover_url ELSE global_vault.cover_url END,
                category = CASE WHEN excluded.category != '' THEN excluded.category ELSE global_vault.category END,
                tags = CASE WHEN excluded.tags != '' THEN excluded.tags ELSE global_vault.tags END,
                popularity_score = MAX(global_vault.popularity_score, excluded.popularity_score),
                last_updated_at = CURRENT_TIMESTAMP
            """,
            (
                resource.url,
                resource.title,
                resource.cover_url,
                resource.category,
                tags_str,
                resource.content_fingerprint,
                resource.popularity_score,
            ),
        )

        return res_id
    except Exception as e:
        raise


def insert_resource(db_path, resource):
    """Backward-compatible alias for save_resource_with_tags."""
    with get_connection(db_path) as conn:
        existing = conn.execute(
            "SELECT id FROM resources WHERE scan_job_id = ? AND url = ?",
            (resource.scan_job_id, resource.url),
        ).fetchone()
        if existing:
            return None
    return save_resource_with_tags(db_path, resource)


def get_resources(db_path, job_id):
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT r.*, GROUP_CONCAT(t.name, '|') as tag_names FROM resources r LEFT JOIN resource_tags rt ON rt.resource_id = r.id LEFT JOIN tags t ON t.id = rt.tag_id WHERE r.scan_job_id = ? GROUP BY r.id ORDER BY r.popularity_score DESC",
            (job_id,),
        ).fetchall()
        res = []
        for r in rows:
            d = dict(r)
            tags = d.pop("tag_names")
            resource = Resource(**d)
            resource.tags = tags.split("|") if tags else []
            res.append(resource)
        return res


def get_vault_resources(db_path: str, limit: int = 1000) -> list[dict]:
    """Retrieve permanently archived resources from the Global Vault."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM global_vault ORDER BY last_updated_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_resources_by_tag(db_path, tag_id):
    """Return resources associated with a given tag id."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT r.*, GROUP_CONCAT(t.name, '|') as tag_names
            FROM resources r
            JOIN resource_tags rt ON rt.resource_id = r.id
            LEFT JOIN tags t ON t.id = rt.tag_id
            WHERE rt.tag_id = ?
            GROUP BY r.id
            ORDER BY r.popularity_score DESC
            """,
            (tag_id,),
        ).fetchall()
        res = []
        for r in rows:
            d = dict(r)
            tags = d.pop("tag_names")
            resource = Resource(**d)
            resource.tags = tags.split("|") if tags else []
            res.append(resource)
        return res

def update_resource_scores(db_path, scores: dict[int, float]):
    """Batch-update popularity_score for resources."""
    with get_connection(db_path) as conn:
        conn.executemany(
            "UPDATE resources SET popularity_score = ? WHERE id = ?",
            ((score, rid) for rid, score in scores.items()),
        )


def update_tag_counts(db_path, scan_job_id):
    """Refresh resource_count on tags for a scan job."""
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE tags
            SET resource_count = (
                SELECT COUNT(*)
                FROM resource_tags rt
                JOIN resources r ON r.id = rt.resource_id
                WHERE rt.tag_id = tags.id AND r.scan_job_id = ?
            )
            WHERE scan_job_id = ?
            """,
            (scan_job_id, scan_job_id),
        )


def insert_page(db_path, scan_job_id, url, page_type="other", depth=0) -> int | None:
    if isinstance(page_type, int) and depth == 0:
        depth = page_type
        page_type = "other"
    with get_connection(db_path) as conn:
        existing = conn.execute(
            "SELECT id FROM pages WHERE scan_job_id = ? AND url = ?",
            (scan_job_id, url),
        ).fetchone()
        if existing:
            return None
        cursor = conn.execute(
            "INSERT INTO pages (scan_job_id, url, page_type, depth) VALUES (?, ?, ?, ?)",
            (scan_job_id, url, page_type, depth),
        )
        return cursor.lastrowid


def update_page(db_path, page_id, **kwargs):
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [page_id]
    with get_connection(db_path) as conn:
        conn.execute(f"UPDATE pages SET {sets} WHERE id = ?", vals)


def list_pages(db_path, job_id):
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM pages WHERE scan_job_id = ? ORDER BY id", (job_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_pending_pages(db_path, job_id):
    with get_connection(db_path) as conn:
        return [
            (r["url"], r["depth"], r["id"])
            for r in conn.execute(
                "SELECT id, url, depth FROM pages WHERE scan_job_id = ? AND status = 'pending'",
                (job_id,),
            ).fetchall()
        ]


def get_all_page_urls(db_path, job_id):
    with get_connection(db_path) as conn:
        return [
            r["url"]
            for r in conn.execute(
                "SELECT url FROM pages WHERE scan_job_id = ?", (job_id,)
            ).fetchall()
        ]


def _row_to_resource(row: sqlite3.Row) -> Resource:
    """Helper to convert a database row to a Resource object."""
    data = dict(row)
    # Tags are handled separately by the caller usually, 
    # but we ensure the object can be instantiated.
    if "tags" in data and isinstance(data["tags"], str):
        # Handle cases where tags might be stored as a string
        data["tags"] = data["tags"].split(",") if data["tags"] else []
    
    # Remove keys that aren't in the Resource dataclass constructor
    valid_fields = {f.name for f in Resource.__dataclass_fields__.values()}
    filtered_data = {k: v for k, v in data.items() if k in valid_fields}
    
    return Resource(**filtered_data)


def get_tags(db_path, scan_job_id):
    """Return all tags for a scan job with their resource counts."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM tags WHERE scan_job_id = ? ORDER BY resource_count DESC",
            (scan_job_id,),
        ).fetchall()
        return [Tag(**dict(r)) for r in rows]


def get_cache_metrics(conn):
    row = conn.execute("SELECT COUNT(*), SUM(size_bytes) FROM http_cache").fetchone()
    return {"entry_count": row[0], "total_bytes": row[1] or 0}


def clear_http_cache(conn):
    conn.execute("DELETE FROM http_cache")


def perform_housekeeping(db_path: str):
    """Automated maintenance task for database and assets."""
    with get_connection(db_path, write=True) as conn:
        # 1. Cleanup old HTTP cache (> 7 days)
        cleanup_expired_http_cache(conn, days=7)
        # 2. Re-index for speed
        conn.execute("VACUUM")
        # R38: Force WAL checkpoint to keep log file size under control
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    logger.info("Housekeeping completed.")


def cleanup_expired_http_cache(conn, days=7):
    return conn.execute(
        "DELETE FROM http_cache WHERE cached_at < datetime('now', '-' || ? || ' days')",
        (str(days),),
    ).rowcount


def get_cached_response(conn, url):
    row = conn.execute("SELECT * FROM http_cache WHERE url = ?", (url,)).fetchone()
    if not row:
        return None
    body = row["response_body"]
    if body:
        try:
            body = zlib.decompress(body)
        except:
            pass
    return {
        "etag": row["etag"],
        "last_modified": row["last_modified"],
        "cache_control": row["cache_control"],
        "response_body": body,
        "size_bytes": row["size_bytes"],
    }


def save_cached_response(conn, url, etag, last_modified, cache_control, body):
    comp = zlib.compress(body)
    conn.execute(
        "INSERT INTO http_cache (url, etag, last_modified, cache_control, response_body, size_bytes) VALUES (?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET etag=excluded.etag, last_modified=excluded.last_modified, cache_control=excluded.cache_control, response_body=excluded.response_body, size_bytes=excluded.size_bytes",
        (url, etag, last_modified, cache_control, comp, len(body)),
    )


def delete_scan_job(db_path, job_id):
    """Delete a scan job and all related data, including assets and FTS indexes."""
    import shutil
    
    with get_connection(db_path, write=True) as conn:
        # 1. Clear FTS index for this job
        conn.execute(
            "DELETE FROM resources_fts WHERE rowid IN (SELECT id FROM resources WHERE scan_job_id = ?)",
            (job_id,)
        )
        
        # 2. Traditional cleanup
        resource_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM resources WHERE scan_job_id = ?",
                (job_id,),
            ).fetchall()
        ]
        if resource_ids:
            placeholders = ",".join("?" for _ in resource_ids)
            conn.execute(
                f"DELETE FROM resource_tags WHERE resource_id IN ({placeholders})",
                resource_ids,
            )
        conn.execute("DELETE FROM tags WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM resources WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM pages WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM events WHERE scan_job_id = ?", (job_id,))
        conn.execute("DELETE FROM scan_jobs WHERE id = ?", (job_id,))
        
    # 3. Physical Asset Removal
    asset_dir = f"data/assets/{job_id}"
    if os.path.exists(asset_dir):
        try:
            shutil.rmtree(asset_dir)
        except Exception as e:
            logger.error(f"Failed to delete asset directory {asset_dir}: {e}")


def search_resources(db_path: str, query: str, limit: int = 50) -> list[dict]:
    """Search resources using FTS5 and return enriched results with snippets."""
    if not query:
        return []

    # R30: Sanitize query to prevent FTS5 syntax errors (like 'no such column: https')
    # Wrap in double quotes and handle existing quotes
    clean_query = query.replace('"', '""')
    # Add prefix wildcard if needed
    match_expr = f'"{clean_query}"'
    if not clean_query.endswith("*"):
        match_expr = f'"{clean_query}"*'

    with get_connection(db_path) as conn:
        # R24: Snippets for semantic search context
        rows = conn.execute(
            "SELECT r.*, snippet(resources_fts, 0, '<b>', '</b>', '...', 15) as snippet "
            "FROM resources r "
            "JOIN resources_fts f ON r.id = f.rowid "
            "WHERE resources_fts MATCH ? "
            "ORDER BY rank LIMIT ?",
            (match_expr, limit),
        ).fetchall()
        
        results = []
        for r in rows:
            res = _row_to_resource(r)
            # Re-fetch tags
            tag_rows = conn.execute(
                "SELECT name FROM tags t JOIN resource_tags rt ON t.id = rt.tag_id WHERE rt.resource_id = ?",
                (res.id,),
            ).fetchall()
            res.tags = [tr["name"] for tr in tag_rows]
            
            # Enrich with snippet info
            data = res.__dict__
            data["search_snippet"] = r["snippet"]
            results.append(data)
            
        return results
