"""Tests for storage module."""

import os
import sqlite3
import tempfile
import threading
import pytest

from crawler.storage import (
    init_db, create_scan_job, delete_scan_job, get_scan_job, update_scan_job,
    list_scan_jobs, insert_page, insert_resource, get_resources,
    save_resource_with_tags, get_tags, get_resources_by_tag,
    update_tag_counts, update_page, get_connection,
    get_cached_response, save_cached_response, clear_http_cache, get_cache_metrics,
)
from crawler.models import Resource


@pytest.fixture
def db_path():
    """Create a temporary database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    os.unlink(path)


class TestScanJob:
    def test_create_and_get(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        assert job_id is not None

        job = get_scan_job(db_path, job_id)
        assert job is not None
        assert job.entry_url == "https://example.com"
        assert job.domain == "example.com"
        assert job.status == "pending"
        assert job.max_pages == 200
        assert job.max_depth == 3

    def test_update(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        update_scan_job(db_path, job_id, status="running", pages_scanned=5)

        job = get_scan_job(db_path, job_id)
        assert job.status == "running"
        assert job.pages_scanned == 5

    def test_list(self, db_path):
        create_scan_job(db_path, "https://a.com", "a.com")
        create_scan_job(db_path, "https://b.com", "b.com")

        jobs = list_scan_jobs(db_path)
        assert len(jobs) == 2

    def test_get_nonexistent(self, db_path):
        assert get_scan_job(db_path, 999) is None


class TestPage:
    def test_insert(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/page1", "list", 1)
        assert page_id is not None

    def test_duplicate_url_ignored(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        insert_page(db_path, job_id, "https://example.com/page1")
        dup_id = insert_page(db_path, job_id, "https://example.com/page1")
        assert dup_id is None


class TestResource:
    def test_insert_and_get(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/page1")

        res = Resource(
            scan_job_id=job_id, page_id=page_id,
            title="Test Resource", url="https://example.com/res1",
            views=100, likes=10, hearts=5,
        )
        res_id = insert_resource(db_path, res)
        assert res_id is not None

        resources = get_resources(db_path, job_id)
        assert len(resources) == 1
        assert resources[0].title == "Test Resource"
        assert resources[0].views == 100

    def test_duplicate_url_ignored(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        res = Resource(scan_job_id=job_id, title="A", url="https://example.com/r1")
        insert_resource(db_path, res)
        dup_id = insert_resource(db_path, res)
        assert dup_id is None


class TestTagsAndRelations:
    def test_save_resource_with_tags(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        res = Resource(
            scan_job_id=job_id, title="Tagged Resource",
            url="https://example.com/r1", tags=["python", "web", "scraping"],
        )
        res_id = save_resource_with_tags(db_path, res)
        assert res_id is not None

        update_tag_counts(db_path, job_id)
        tags = get_tags(db_path, job_id)
        assert len(tags) == 3
        assert all(t.resource_count == 1 for t in tags)

    def test_tag_resource_mapping(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")

        for i in range(3):
            res = Resource(
                scan_job_id=job_id, title=f"Resource {i}",
                url=f"https://example.com/r{i}", tags=["shared-tag"],
                views=i * 10,
            )
            save_resource_with_tags(db_path, res)

        update_tag_counts(db_path, job_id)
        tags = get_tags(db_path, job_id)
        assert len(tags) == 1
        assert tags[0].resource_count == 3

        resources = get_resources_by_tag(db_path, tags[0].id)
        assert len(resources) == 3

    def test_empty_database_queries(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        assert get_resources(db_path, job_id) == []
        assert get_tags(db_path, job_id) == []


class TestFailureReasonMigration:
    """Unit 2: additive migration of pages.failure_reason column."""

    def test_fresh_db_has_failure_reason_column(self, db_path):
        with sqlite3.connect(db_path) as conn:
            cols = {row[1] for row in conn.execute("PRAGMA table_info(pages)")}
        assert "failure_reason" in cols

    def test_fresh_db_default_empty_string(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/x")
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT failure_reason FROM pages WHERE id = ?", (page_id,),
            ).fetchone()
        assert row[0] == ""

    def test_update_page_can_set_failure_reason(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/boom")
        update_page(db_path, page_id, status="failed", failure_reason="HTTP 503")
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT status, failure_reason FROM pages WHERE id = ?", (page_id,),
            ).fetchone()
        assert row[0] == "failed"
        assert row[1] == "HTTP 503"

    def test_migration_on_preexisting_schema(self):
        """Pre-v0.2 DB (pages without failure_reason) gets the column added by init_db."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            # Create old-style pages table explicitly (no failure_reason column).
            with sqlite3.connect(path) as conn:
                conn.executescript("""
                    CREATE TABLE scan_jobs (id INTEGER PRIMARY KEY, entry_url TEXT, domain TEXT);
                    CREATE TABLE pages (
                        id INTEGER PRIMARY KEY,
                        scan_job_id INTEGER,
                        url TEXT,
                        page_type TEXT DEFAULT 'other',
                        depth INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'pending',
                        fetched_at TIMESTAMP
                    );
                """)
                conn.execute(
                    "INSERT INTO scan_jobs (id, entry_url, domain) VALUES (1, 'x', 'x')"
                )
                conn.execute(
                    "INSERT INTO pages (scan_job_id, url) VALUES (1, 'x')"
                )
                conn.commit()

            # Run init_db — triggers migration.
            init_db(path)

            with sqlite3.connect(path) as conn:
                cols = {row[1] for row in conn.execute("PRAGMA table_info(pages)")}
                assert "failure_reason" in cols
                # Pre-existing row gets the DEFAULT.
                row = conn.execute("SELECT failure_reason FROM pages").fetchone()
                assert row[0] == ""
        finally:
            os.unlink(path)

    def test_init_db_is_idempotent(self, db_path):
        # Calling twice on the same DB must not error.
        init_db(db_path)
        init_db(db_path)
        with sqlite3.connect(db_path) as conn:
            cols = [row[1] for row in conn.execute("PRAGMA table_info(pages)")]
        # Column exists exactly once.
        assert cols.count("failure_reason") == 1

    def test_concurrent_init_db_is_race_safe(self):
        """Two threads calling init_db simultaneously must not fail or double-add."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            barrier = threading.Barrier(2)
            errors: list[Exception] = []

            def run():
                barrier.wait()
                try:
                    init_db(path)
                except Exception as exc:
                    errors.append(exc)

            t1 = threading.Thread(target=run)
            t2 = threading.Thread(target=run)
            t1.start(); t2.start()
            t1.join(); t2.join()

            assert errors == [], f"init_db race errors: {errors}"
            with sqlite3.connect(path) as conn:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(pages)")]
            assert cols.count("failure_reason") == 1
        finally:
            os.unlink(path)


class TestGetResourcesQueryCount:
    """Unit 9: get_resources must use a single query (was N+1)."""

    def test_single_query_for_many_resources(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        for i in range(10):
            res = Resource(
                scan_job_id=job_id,
                title=f"R{i}", url=f"https://example.com/r{i}",
                tags=[f"t{j}" for j in range(3)],
            )
            save_resource_with_tags(db_path, res)

        # Open our own connection with a trace callback to count queries.
        # We can't trace through storage.get_resources' private connection,
        # so we run the same query here and assert on its shape/count.
        trace: list[str] = []

        def tracer(sql):
            trace.append(sql)

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.set_trace_callback(tracer)
        try:
            # Import the actual function and monkey-patch get_connection to
            # return our traced connection.
            from unittest.mock import patch
            from contextlib import contextmanager

            @contextmanager
            def fake_get_conn(_path=None):
                yield conn

            with patch("crawler.storage.get_connection", fake_get_conn):
                resources = get_resources(db_path, job_id)
        finally:
            conn.set_trace_callback(None)
            conn.close()

        assert len(resources) == 10
        for res in resources:
            assert len(res.tags) == 3
        # Only one SELECT from resources ran — no N+1.
        resource_selects = [
            s for s in trace
            if s.strip().upper().startswith("SELECT") and "FROM RESOURCES" in s.upper()
        ]
        assert len(resource_selects) == 1, (
            f"expected 1 resource SELECT, got {len(resource_selects)}:\n"
            + "\n".join(resource_selects)
        )

    def test_resource_with_zero_tags(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        res = Resource(
            scan_job_id=job_id,
            title="NoTags", url="https://example.com/nt",
            tags=[],
        )
        save_resource_with_tags(db_path, res)
        resources = get_resources(db_path, job_id)
        assert len(resources) == 1
        assert resources[0].tags == [], (
            "zero-tag resource must return tags=[], not [''] or [None]"
        )

    def test_tag_names_with_commas_do_not_collide(self, db_path):
        """Unit separator (CHAR 31) avoids tag-name escaping issues."""
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        res = Resource(
            scan_job_id=job_id,
            title="T", url="https://example.com/t",
            tags=["a,b", "c,d", "e"],
        )
        save_resource_with_tags(db_path, res)
        resources = get_resources(db_path, job_id)
        assert len(resources) == 1
        assert sorted(resources[0].tags) == ["a,b", "c,d", "e"]


class TestDeleteScanJob:
    def _seed(self, db_path: str) -> int:
        """Create one scan with 1 page, 1 resource (with 2 tags)."""
        sj = create_scan_job(db_path, "https://a.com", "a.com", 10, 2)
        page_id = insert_page(db_path, sj, "https://a.com/x")
        update_page(db_path, page_id, status="fetched")
        save_resource_with_tags(db_path, Resource(
            scan_job_id=sj, page_id=page_id,
            title="t", url="https://a.com/x", cover_url="",
            tags=["t1", "t2"], views=1, likes=1, hearts=1,
        ))
        return sj

    def test_cascades_through_all_child_tables(self, db_path):
        sj = self._seed(db_path)
        assert get_scan_job(db_path, sj) is not None
        assert get_resources(db_path, sj)
        assert get_tags(db_path, sj)

        delete_scan_job(db_path, sj)

        assert get_scan_job(db_path, sj) is None
        assert get_resources(db_path, sj) == []
        assert get_tags(db_path, sj) == []
        # And resource_tags should also be empty for this scan's resources.
        with sqlite3.connect(db_path) as conn:
            rt_count = conn.execute(
                "SELECT COUNT(*) FROM resource_tags rt "
                "WHERE rt.resource_id IN ("
                "  SELECT id FROM resources WHERE scan_job_id = ?)",
                (sj,),
            ).fetchone()[0]
        assert rt_count == 0
        # And no orphaned pages.
        with sqlite3.connect(db_path) as conn:
            p_count = conn.execute(
                "SELECT COUNT(*) FROM pages WHERE scan_job_id = ?", (sj,),
            ).fetchone()[0]
        assert p_count == 0

    def test_does_not_touch_other_scans(self, db_path):
        sj1 = self._seed(db_path)
        sj2 = self._seed(db_path)
        delete_scan_job(db_path, sj1)
        assert get_scan_job(db_path, sj1) is None
        assert get_scan_job(db_path, sj2) is not None
        assert len(get_resources(db_path, sj2)) == 1

    def test_idempotent_on_missing_id(self, db_path):
        # Deleting a non-existent id is a no-op, not an error.
        delete_scan_job(db_path, 99_999)
        # And jobs that do exist are untouched.
        sj = self._seed(db_path)
        delete_scan_job(db_path, 99_999)
        assert get_scan_job(db_path, sj) is not None


class TestHttpCache:
    """Tests for HTTP response caching functionality."""

    def test_get_cached_response_returns_none_for_uncached_url(self, db_path):
        """Uncached URL should return None."""
        with get_connection(db_path) as conn:
            result = get_cached_response(conn, "https://example.com/page1")
            assert result is None

    def test_save_and_get_cached_response(self, db_path):
        """Save cache entry and retrieve it."""
        with get_connection(db_path) as conn:
            url = "https://example.com/page1"
            body = b"<html>content</html>"
            save_cached_response(conn, url, "abc123", "Wed, 21 Oct 2025 07:28:00 GMT", "max-age=3600", body)
            
            result = get_cached_response(conn, url)
            assert result is not None
            assert result["etag"] == "abc123"
            assert result["last_modified"] == "Wed, 21 Oct 2025 07:28:00 GMT"
            assert result["cache_control"] == "max-age=3600"
            assert result["response_body"] == body
            assert result["size_bytes"] == len(body)

    def test_save_cached_response_upsert(self, db_path):
        """Saving to same URL updates cache entry (UPSERT)."""
        with get_connection(db_path) as conn:
            url = "https://example.com/page1"
            # Initial insert
            save_cached_response(conn, url, "v1", "date1", "max-age=3600", b"old")
            # Update
            save_cached_response(conn, url, "v2", "date2", "max-age=7200", b"new")
            
            result = get_cached_response(conn, url)
            assert result["etag"] == "v2"
            assert result["last_modified"] == "date2"
            assert result["cache_control"] == "max-age=7200"
            assert result["response_body"] == b"new"
            assert result["size_bytes"] == 3

    def test_save_cached_response_with_none_headers(self, db_path):
        """Cache entry with missing etag/last_modified is allowed."""
        with get_connection(db_path) as conn:
            url = "https://example.com/page1"
            save_cached_response(conn, url, None, None, None, b"body")
            
            result = get_cached_response(conn, url)
            assert result is not None
            assert result["etag"] is None
            assert result["last_modified"] is None
            assert result["cache_control"] is None
            assert result["response_body"] == b"body"

    def test_clear_http_cache(self, db_path):
        """Clear all cached responses."""
        with get_connection(db_path) as conn:
            # Add some entries
            save_cached_response(conn, "https://a.com", "etag1", None, None, b"a")
            save_cached_response(conn, "https://b.com", "etag2", None, None, b"b")
            save_cached_response(conn, "https://c.com", "etag3", None, None, b"c")
            
            # Verify they exist
            assert get_cached_response(conn, "https://a.com") is not None
            assert get_cached_response(conn, "https://b.com") is not None
            
            # Clear
            clear_http_cache(conn)
            
            # Verify all gone
            assert get_cached_response(conn, "https://a.com") is None
            assert get_cached_response(conn, "https://b.com") is None
            assert get_cached_response(conn, "https://c.com") is None

    def test_get_cache_metrics(self, db_path):
        """Metrics report cache size and entry count."""
        with get_connection(db_path) as conn:
            save_cached_response(conn, "https://a.com", None, None, None, b"abc")  # 3 bytes
            save_cached_response(conn, "https://b.com", None, None, None, b"12345")  # 5 bytes
            
            metrics = get_cache_metrics(conn)
            assert metrics["total_bytes"] == 8
            assert metrics["entry_count"] == 2

    def test_cache_metrics_empty(self, db_path):
        """Metrics for empty cache."""
        with get_connection(db_path) as conn:
            metrics = get_cache_metrics(conn)
            assert metrics["total_bytes"] == 0
            assert metrics["entry_count"] == 0

    def test_concurrent_cache_writes(self, db_path):
        """Concurrent writes to same URL via UPSERT are safe."""
        import concurrent.futures
        
        def write_cache(url, etag, body):
            with get_connection(db_path) as conn:
                save_cached_response(conn, url, etag, None, None, body)
        
        url = "https://example.com/concurrent"
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i in range(5):
                futures.append(executor.submit(write_cache, url, f"etag{i}", f"body{i}".encode()))
            concurrent.futures.wait(futures)
        
        # Final state should be valid (last write wins)
        with get_connection(db_path) as conn:
            result = get_cached_response(conn, url)
            assert result is not None
            # etag should be one of the values, not corrupted
            assert result["etag"] in [f"etag{i}" for i in range(5)]

    def test_migration_creates_http_cache_table(self, db_path):
        """Migration should create http_cache table (tested via successful save/get)."""
        # If table wasn't created, this would fail
        with get_connection(db_path) as conn:
            save_cached_response(conn, "https://example.com", "etag", None, None, b"test")
            result = get_cached_response(conn, "https://example.com")
            assert result is not None

    def test_migration_adds_cached_column_to_pages(self, db_path):
        """Migration should add pages.cached column."""
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/page1")
        
        # Column should exist and default to False
        with get_connection(db_path) as conn:
            row = conn.execute("SELECT cached FROM pages WHERE id = ?", (page_id,)).fetchone()
            assert row is not None
            assert row["cached"] == 0  # False in SQLite


class TestScanJobStats:
    def test_get_scan_job_stats_success(self, db_path):
        """Test stats query returns correct success/failure counts."""
        from crawler.storage import get_scan_job_stats
        
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        
        page1 = insert_page(db_path, job_id, "https://example.com/page1")
        page2 = insert_page(db_path, job_id, "https://example.com/page2")
        page3 = insert_page(db_path, job_id, "https://example.com/page3")
        
        update_page(db_path, page1, status="fetched")
        update_page(db_path, page2, status="fetched")
        update_page(db_path, page3, status="failed", failure_reason="http_error")
        
        stats = get_scan_job_stats(db_path, job_id)
        assert stats is not None
        assert stats.pages_success == 2
        assert stats.pages_failed == 1
        assert "http_error" in stats.failed_reasons_dict
        assert stats.failed_reasons_dict["http_error"] == 1

    def test_list_scan_jobs_filtered_by_domain(self, db_path):
        """Test filtered list returns only matching domains."""
        from crawler.storage import list_scan_jobs_filtered
        
        job1 = create_scan_job(db_path, "https://example.com", "example.com")
        job2 = create_scan_job(db_path, "https://other.com", "other.com")
        
        filtered = list_scan_jobs_filtered(db_path, domain_filter="example")
        assert len(filtered) == 1
        assert filtered[0].domain == "example.com"

    def test_list_scan_jobs_filtered_pagination(self, db_path):
        """Test pagination with LIMIT/OFFSET."""
        from crawler.storage import list_scan_jobs_filtered, count_scan_jobs_filtered
        
        for i in range(5):
            create_scan_job(db_path, f"https://example{i}.com", f"example{i}.com")
        
        page1 = list_scan_jobs_filtered(db_path, limit=2, offset=0)
        page2 = list_scan_jobs_filtered(db_path, limit=2, offset=2)
        
        assert len(page1) == 2
        assert len(page2) == 2
        assert page1[0].id != page2[0].id
        
        total = count_scan_jobs_filtered(db_path)
        assert total == 5

    def test_count_scan_jobs_filtered(self, db_path):
        """Test count function matches filtered list length."""
        from crawler.storage import count_scan_jobs_filtered, list_scan_jobs_filtered
        
        create_scan_job(db_path, "https://example.com", "example.com")
        update_scan_job(db_path, 1, status="completed", resources_found=10)
        
        count = count_scan_jobs_filtered(db_path, status_filter="completed", resource_min=5, resource_max=15)
        filtered = list_scan_jobs_filtered(db_path, status_filter="completed", resource_min=5, resource_max=15)
        
        assert count == len(filtered)

    def test_export_scan_job_metadata_structure(self, db_path):
        """Test export returns valid JSON-serializable dict."""
        from crawler.storage import export_scan_job_metadata
        import json
        
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        page_id = insert_page(db_path, job_id, "https://example.com/page1")
        update_page(db_path, page_id, status="fetched")
        
        metadata = export_scan_job_metadata(db_path, job_id)
        
        assert "scan_job" in metadata
        assert "pages" in metadata
        assert "stats" in metadata
        assert metadata["scan_job"]["id"] == job_id
        assert len(metadata["pages"]) == 1
        
        serializable = json.dumps(metadata)
        assert isinstance(serializable, str)
