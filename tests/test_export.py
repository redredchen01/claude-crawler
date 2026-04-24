from __future__ import annotations

"""Tests for export module."""

import csv
import io
import json
import os
import tempfile

import pytest
from crawler.analysis import compute_scores
from crawler.export import (
    export_resources_csv,
    export_resources_json,
    export_tags_csv,
    export_tags_json,
)
from crawler.models import Resource
from crawler.storage import create_scan_job, init_db, save_resource_with_tags


@pytest.fixture
def db_with_data():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)

    job_id = create_scan_job(path, "https://example.com", "example.com")
    save_resource_with_tags(
        path,
        Resource(
            scan_job_id=job_id,
            title="Resource One",
            url="https://example.com/r1",
            views=100,
            likes=10,
            hearts=5,
            category="tech",
            tags=["python", "web"],
        ),
    )
    save_resource_with_tags(
        path,
        Resource(
            scan_job_id=job_id,
            title="Resource Two",
            url="https://example.com/r2",
            views=50,
            likes=20,
            hearts=15,
            tags=["python"],
        ),
    )
    save_resource_with_tags(
        path,
        Resource(
            scan_job_id=job_id,
            title="Comma, in title",
            url="https://example.com/r3",
            views=10,
            likes=5,
            hearts=2,
            tags=["tag, with comma"],
        ),
    )
    compute_scores(path, job_id)

    yield path, job_id
    os.unlink(path)


@pytest.fixture
def empty_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    job_id = create_scan_job(path, "https://example.com", "example.com")
    yield path, job_id
    os.unlink(path)


class TestResourceExport:
    def test_csv_header_and_rows(self, db_with_data):
        path, job_id = db_with_data
        csv_str = export_resources_csv(path, job_id)
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        assert rows[0][0] == "id"  # header
        assert len(rows) == 4  # header + 3 resources

    def test_csv_comma_in_title(self, db_with_data):
        path, job_id = db_with_data
        csv_str = export_resources_csv(path, job_id)
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        titles = [r[1] for r in rows[1:]]
        assert "Comma, in title" in titles

    def test_json_valid(self, db_with_data):
        path, job_id = db_with_data
        json_str = export_resources_json(path, job_id)
        data = json.loads(json_str)
        assert len(data) == 3
        assert all("title" in d for d in data)
        assert all("tags" in d for d in data)

    def test_json_fields_complete(self, db_with_data):
        path, job_id = db_with_data
        data = json.loads(export_resources_json(path, job_id))
        r = data[0]
        assert "popularity_score" in r
        assert isinstance(r["tags"], list)

    def test_empty_csv(self, empty_db):
        path, job_id = empty_db
        csv_str = export_resources_csv(path, job_id)
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == 1  # header only

    def test_empty_json(self, empty_db):
        path, job_id = empty_db
        data = json.loads(export_resources_json(path, job_id))
        assert data == []


class TestTagExport:
    def test_tags_csv(self, db_with_data):
        path, job_id = db_with_data
        csv_str = export_tags_csv(path, job_id)
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        assert rows[0] == ["id", "name", "resource_count"]
        assert len(rows) >= 3  # header + at least 2 tags

    def test_tags_json(self, db_with_data):
        path, job_id = db_with_data
        data = json.loads(export_tags_json(path, job_id))
        assert len(data) >= 2
        assert all("name" in t for t in data)


class TestExportProvenance:
    """Plan 005 Unit 8 — CSV gains a `sources` column holding compact
    provenance JSON; JSON export gains top-level `provenance` +
    `description` keys. Rows whose raw_data is empty or malformed get
    an empty map ({}), never a crash."""

    @pytest.fixture
    def db_with_provenance(self):
        from crawler.raw_data import build_raw_data

        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        init_db(path)
        job_id = create_scan_job(path, "https://example.com", "example.com")

        save_resource_with_tags(
            path,
            Resource(
                scan_job_id=job_id,
                title="With Sources",
                url="https://example.com/a",
                views=100,
                likes=10,
                hearts=0,
                tags=["python"],
                raw_data=build_raw_data(
                    {"title": "jsonld", "views": "jsonld", "likes": "dom"},
                    description="From JSON-LD.",
                ),
            ),
        )
        save_resource_with_tags(
            path,
            Resource(
                scan_job_id=job_id,
                title="Legacy Row",
                url="https://example.com/b",
                views=1,
                likes=1,
                hearts=1,
                tags=[],
                raw_data="",
            ),
        )
        save_resource_with_tags(
            path,
            Resource(
                scan_job_id=job_id,
                title="Corrupt Row",
                url="https://example.com/c",
                views=1,
                likes=1,
                hearts=1,
                tags=[],
                raw_data="{not json",
            ),
        )
        compute_scores(path, job_id)
        yield path, job_id
        os.unlink(path)

    def test_csv_has_sources_column(self, db_with_provenance):
        path, job_id = db_with_provenance
        out = export_resources_csv(path, job_id)
        reader = csv.reader(io.StringIO(out))
        header = next(reader)
        assert header[-1] == "sources"

    def test_csv_sources_compact_json(self, db_with_provenance):
        path, job_id = db_with_provenance
        out = export_resources_csv(path, job_id)
        rows = list(csv.reader(io.StringIO(out)))[1:]
        matched = [r for r in rows if r[1] == "With Sources"]
        assert len(matched) == 1
        parsed = json.loads(matched[0][-1])
        assert parsed["title"] == "jsonld"
        assert parsed["views"] == "jsonld"
        assert parsed["likes"] == "dom"

    def test_csv_empty_raw_data_is_empty_map(self, db_with_provenance):
        path, job_id = db_with_provenance
        out = export_resources_csv(path, job_id)
        rows = list(csv.reader(io.StringIO(out)))[1:]
        matched = [r for r in rows if r[1] == "Legacy Row"]
        assert len(matched) == 1
        assert json.loads(matched[0][-1]) == {}

    def test_csv_corrupt_raw_data_is_empty_map(self, db_with_provenance):
        path, job_id = db_with_provenance
        out = export_resources_csv(path, job_id)
        rows = list(csv.reader(io.StringIO(out)))[1:]
        matched = [r for r in rows if r[1] == "Corrupt Row"]
        assert len(matched) == 1
        assert json.loads(matched[0][-1]) == {}

    def test_json_has_provenance_and_description(self, db_with_provenance):
        path, job_id = db_with_provenance
        data = json.loads(export_resources_json(path, job_id))
        matched = [r for r in data if r["title"] == "With Sources"]
        assert len(matched) == 1
        row = matched[0]
        assert row["provenance"]["title"] == "jsonld"
        assert row["description"] == "From JSON-LD."

    def test_json_legacy_row_has_empty_provenance(self, db_with_provenance):
        path, job_id = db_with_provenance
        data = json.loads(export_resources_json(path, job_id))
        matched = [r for r in data if r["title"] == "Legacy Row"]
        assert len(matched) == 1
        assert matched[0]["provenance"] == {}
        assert matched[0]["description"] == ""
