"""SQLite storage: connection management, schema init, and CRUD operations."""

import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime

from crawler.config import DB_PATH
from crawler.models import ScanJob, Page, Resource, Tag

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
"""


def init_db(db_path: str | None = None) -> str:
    """Initialize database and return the path used."""
    path = db_path or DB_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with get_connection(path) as conn:
        conn.executescript(SCHEMA)
    return path


@contextmanager
def get_connection(db_path: str | None = None):
    """Context manager for SQLite connections with WAL mode."""
    path = db_path or DB_PATH
    conn = sqlite3.connect(path)
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


def update_scan_job(db_path: str, job_id: int, **kwargs):
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [job_id]
    with get_connection(db_path) as conn:
        conn.execute(f"UPDATE scan_jobs SET {sets} WHERE id = ?", vals)


def list_scan_jobs(db_path: str) -> list[ScanJob]:
    with get_connection(db_path) as conn:
        rows = conn.execute("SELECT * FROM scan_jobs ORDER BY created_at DESC").fetchall()
        return [ScanJob(**dict(r)) for r in rows]


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


def update_page(db_path: str, page_id: int, **kwargs):
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [page_id]
    with get_connection(db_path) as conn:
        conn.execute(f"UPDATE pages SET {sets} WHERE id = ?", vals)


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


def get_resources(db_path: str, scan_job_id: int) -> list[Resource]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM resources WHERE scan_job_id = ? ORDER BY popularity_score DESC",
            (scan_job_id,),
        ).fetchall()
        resources = []
        for r in rows:
            res = Resource(**{k: r[k] for k in r.keys() if k != "tags"})
            # Load tags for this resource
            tag_rows = conn.execute(
                """SELECT t.name FROM tags t
                   JOIN resource_tags rt ON t.id = rt.tag_id
                   WHERE rt.resource_id = ?""",
                (res.id,),
            ).fetchall()
            res.tags = [tr["name"] for tr in tag_rows]
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

        # Link tags (batch-friendly)
        for tag_name in resource.tags:
            tag_name = tag_name.strip()
            if not tag_name:
                continue
            # Get or create tag
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

            # Link resource-tag
            conn.execute(
                "INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) VALUES (?, ?)",
                (resource_id, tag_id),
            )

        if close_conn:
            conn.commit()
        return resource_id

    finally:
        if close_conn:
            conn.close()
