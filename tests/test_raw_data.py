
"""Tests for crawler.raw_data — v1 JSON schema for Resource.raw_data."""

from __future__ import annotations


import json

import pytest
from crawler.raw_data import (
    PROVENANCE_DOM,
    PROVENANCE_FIELDS,
    PROVENANCE_JSONLD,
    PROVENANCE_MICRODATA,
    PROVENANCE_MISSING,
    PROVENANCE_OG,
    PROVENANCE_TWITTER,
    VALID_PROVENANCE_SOURCES,
    build_raw_data,
    parse_raw_data,
)


class TestProvenanceConstants:
    """The six source enum values — used throughout the structured
    extraction chain. Keep stable unless a real new source is added."""

    def test_enum_values(self):
        assert PROVENANCE_JSONLD == "jsonld"
        assert PROVENANCE_OG == "opengraph"
        assert PROVENANCE_TWITTER == "twitter"
        assert PROVENANCE_MICRODATA == "microdata"
        assert PROVENANCE_DOM == "dom"
        assert PROVENANCE_MISSING == "missing"

    def test_valid_sources_set(self):
        assert VALID_PROVENANCE_SOURCES == frozenset(
            {"jsonld", "opengraph", "twitter", "microdata", "dom", "missing"}
        )

    def test_provenance_fields_whitelist(self):
        # 8 Resource fields that get tracked. `description` is NOT in
        # here — it's a sibling of the provenance map in raw_data, not
        # a tracked provenance entry.
        assert PROVENANCE_FIELDS == frozenset(
            {
                "title",
                "cover_url",
                "views",
                "likes",
                "hearts",
                "tags",
                "category",
                "published_at",
            }
        )


class TestBuildRawDataHappyPath:
    def test_full_roundtrip_lossless(self):
        prov = {
            "title": PROVENANCE_JSONLD,
            "views": PROVENANCE_JSONLD,
            "tags": PROVENANCE_OG,
            "category": PROVENANCE_DOM,
        }
        out = build_raw_data(prov, description="Summary text")
        parsed = json.loads(out)
        assert parsed["provenance"] == prov
        assert parsed["description"] == "Summary text"

    def test_empty_provenance_produces_minimal_json(self):
        out = build_raw_data({})
        parsed = json.loads(out)
        assert parsed == {"provenance": {}, "description": ""}

    def test_no_description_arg_defaults_empty(self):
        out = build_raw_data({"title": PROVENANCE_JSONLD})
        parsed = json.loads(out)
        assert parsed["description"] == ""

    def test_cjk_description_not_escaped(self):
        out = build_raw_data({"title": PROVENANCE_JSONLD}, description="偶像摘要")
        # Must contain raw CJK, not \uXXXX escape sequences
        assert "偶像摘要" in out
        assert "\\u" not in out

    def test_output_is_sorted_for_stability(self):
        # Same inputs → same bytes, regardless of dict insertion order
        a = build_raw_data({"views": PROVENANCE_JSONLD, "title": PROVENANCE_DOM})
        b = build_raw_data({"title": PROVENANCE_DOM, "views": PROVENANCE_JSONLD})
        assert a == b


class TestBuildRawDataValidation:
    def test_unknown_field_name_raises(self):
        # Typo protection — cover_url is in whitelist but `cover` is not
        with pytest.raises(ValueError, match="cover"):
            build_raw_data({"cover": PROVENANCE_JSONLD})

    def test_unknown_source_value_raises(self):
        with pytest.raises(ValueError, match="made_up_source"):
            build_raw_data({"title": "made_up_source"})

    def test_description_not_a_string_raises(self):
        with pytest.raises(TypeError):
            build_raw_data({"title": PROVENANCE_JSONLD}, description=42)


class TestParseRawDataTolerance:
    """parse_raw_data NEVER raises — every garbage input returns the
    default shape so caller (export / UI) never has to try/except."""

    DEFAULT = {"provenance": {}, "description": ""}

    def test_empty_string(self):
        assert parse_raw_data("") == self.DEFAULT

    def test_storage_default_empty_object(self):
        # crawler/storage.py:57 defaults to '{}' — pre-Phase-1 rows
        assert parse_raw_data("{}") == self.DEFAULT

    def test_malformed_json(self):
        assert parse_raw_data("not a json string") == self.DEFAULT

    def test_list_instead_of_object(self):
        assert parse_raw_data("[1,2,3]") == self.DEFAULT

    def test_null(self):
        assert parse_raw_data("null") == self.DEFAULT

    def test_unknown_future_keys_ignored(self):
        # Forward-compat: unknown top-level keys silently dropped
        raw = json.dumps(
            {
                "provenance": {"title": "jsonld"},
                "description": "x",
                "some_future_field": {"nested": "value"},
            }
        )
        parsed = parse_raw_data(raw)
        assert parsed == {
            "provenance": {"title": "jsonld"},
            "description": "x",
        }

    def test_provenance_not_a_dict_drops_to_empty(self):
        raw = json.dumps({"provenance": "oops", "description": "x"})
        parsed = parse_raw_data(raw)
        assert parsed == {"provenance": {}, "description": "x"}

    def test_description_not_a_string_drops_to_empty(self):
        raw = json.dumps({"provenance": {"title": "jsonld"}, "description": 42})
        parsed = parse_raw_data(raw)
        assert parsed == {
            "provenance": {"title": "jsonld"},
            "description": "",
        }


class TestRoundTrip:
    def test_build_then_parse_preserves_content(self):
        prov = {
            "title": PROVENANCE_JSONLD,
            "cover_url": PROVENANCE_OG,
            "views": PROVENANCE_JSONLD,
            "tags": PROVENANCE_DOM,
            "category": PROVENANCE_MISSING,
        }
        built = build_raw_data(prov, description="A description.")
        parsed = parse_raw_data(built)
        assert parsed["provenance"] == prov
        assert parsed["description"] == "A description."

    def test_empty_build_then_parse(self):
        built = build_raw_data({})
        parsed = parse_raw_data(built)
        assert parsed == {"provenance": {}, "description": ""}
