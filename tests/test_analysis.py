from __future__ import annotations

"""Tests for analysis module."""

import os
import tempfile

import pytest
from crawler.analysis import (
    _normalize,
    _recency_factor,
    compute_scores,
    get_tag_overview,
    get_tag_stats,
)
from crawler.models import Resource
from crawler.storage import (
    create_scan_job,
    get_resources,
    init_db,
    save_resource_with_tags,
)


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    os.unlink(path)


class TestNormalize:
    def test_normal(self):
        assert _normalize(50, 100) == 50.0

    def test_max_value(self):
        assert _normalize(100, 100) == 100.0

    def test_zero(self):
        assert _normalize(0, 100) == 0.0

    def test_max_zero(self):
        assert _normalize(0, 0) == 0.0
        assert _normalize(5, 0) == 0.0


class TestRecencyFactor:
    def test_empty_date(self):
        assert _recency_factor("") == 50.0

    def test_invalid_date(self):
        assert _recency_factor("not-a-date") == 50.0

    def test_recent_date(self):
        from datetime import datetime

        today = datetime.now().strftime("%Y-%m-%d")
        factor = _recency_factor(today)
        # Today should have high recency (close to 100)
        assert factor > 80.0

    def test_old_date(self):
        factor = _recency_factor("2020-01-01")
        # Old date should have low recency
        assert factor < 30.0

    def test_slash_format(self):
        from datetime import datetime

        today = datetime.now().strftime("%Y/%m/%d")
        factor = _recency_factor(today)
        assert factor > 80.0


class TestComputeScores:
    def test_scoring_formula(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")

        # Resource with highest views
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="High Views",
                url="https://example.com/r1",
                views=100,
                likes=10,
                hearts=5,
            ),
        )
        # Resource with highest likes
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="High Likes",
                url="https://example.com/r2",
                views=50,
                likes=20,
                hearts=5,
            ),
        )
        # Resource with zero metrics
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="Zero",
                url="https://example.com/r3",
                views=0,
                likes=0,
                hearts=0,
            ),
        )

        compute_scores(db_path, job_id)
        resources = get_resources(db_path, job_id)

        # All scores should be in 0-100 range
        for r in resources:
            assert 0 <= r.popularity_score <= 100, f"{r.title}: {r.popularity_score}"

        # High Views should score highest (has max views)
        scores = {r.title: r.popularity_score for r in resources}
        assert scores["High Views"] > scores["Zero"]
        assert scores["High Likes"] > scores["Zero"]

    def test_all_zero_metrics(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="Zero",
                url="https://example.com/r1",
                views=0,
                likes=0,
                hearts=0,
            ),
        )
        compute_scores(db_path, job_id)
        resources = get_resources(db_path, job_id)
        # Should not crash, score includes recency component
        assert len(resources) == 1

    def test_single_resource(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="Only",
                url="https://example.com/r1",
                views=100,
                likes=50,
                hearts=25,
            ),
        )
        compute_scores(db_path, job_id)
        resources = get_resources(db_path, job_id)
        # Single resource normalizes to max (100) for each dimension
        assert resources[0].popularity_score > 80.0

    def test_empty_scan(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        compute_scores(db_path, job_id)  # Should not crash


class TestTagStats:
    def test_tag_frequency_ranking(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")

        # Tag A on 3 resources, Tag B on 1
        for i in range(3):
            save_resource_with_tags(
                db_path,
                Resource(
                    scan_job_id=job_id,
                    title=f"R{i}",
                    url=f"https://example.com/r{i}",
                    tags=["tag-a"],
                ),
            )
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="R3",
                url="https://example.com/r3",
                tags=["tag-b"],
            ),
        )

        compute_scores(db_path, job_id)
        tags = get_tag_stats(db_path, job_id)

        assert len(tags) == 2
        assert tags[0].name == "tag-a"
        assert tags[0].resource_count == 3
        assert tags[1].name == "tag-b"
        assert tags[1].resource_count == 1

    def test_tag_overview(self, db_path):
        job_id = create_scan_job(db_path, "https://example.com", "example.com")
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="R1",
                url="https://example.com/r1",
                tags=["a", "b"],
            ),
        )
        save_resource_with_tags(
            db_path,
            Resource(
                scan_job_id=job_id,
                title="R2",
                url="https://example.com/r2",
                tags=["a"],
            ),
        )
        compute_scores(db_path, job_id)

        overview = get_tag_overview(db_path, job_id)
        assert overview["total_tags"] == 2
        assert overview["total_resources"] == 2
        assert overview["avg_tags_per_resource"] == 1.5
