"""Tests for storage module."""

import os
import tempfile
import pytest

from crawler.storage import (
    init_db, create_scan_job, get_scan_job, update_scan_job, list_scan_jobs,
    insert_page, insert_resource, get_resources, save_resource_with_tags,
    get_tags, get_resources_by_tag, update_tag_counts,
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
