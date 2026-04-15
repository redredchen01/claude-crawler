"""Tests for config loading and validation."""

import os
import tempfile

import pytest
import yaml

from src.config import (
    AggregationConfig,
    FilterConfig,
    PaginationConfig,
    SourceConfig,
    TransformConfig,
    load_config,
    resolve_auth,
    validate_config,
)


def test_load_from_dict():
    """Test loading config from dict."""
    config_dict = {
        "sources": [{"type": "rest", "url": "https://api.github.com/repos"}],
        "transform": {"type": "table", "columns": ["name"]},
    }
    config = load_config(config_dict)
    assert len(config.sources) == 1
    assert config.sources[0].url == "https://api.github.com/repos"


def test_load_from_yaml_string():
    """Test loading config from YAML string."""
    yaml_str = """
sources:
  - type: rest
    url: https://api.example.com/data
    method: GET
    auth: bearer:TOKEN_ENV
transform:
  type: table
  columns: [id, name]
  limit: 10
"""
    config_dict = yaml.safe_load(yaml_str)
    config = load_config(config_dict)
    assert config.sources[0].auth == "bearer:TOKEN_ENV"
    assert config.transform.limit == 10


def test_load_from_yaml_file():
    """Test loading config from YAML file."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(
            {
                "sources": [{"type": "rest", "url": "https://api.example.com"}],
                "transform": {"type": "table"},
            },
            f,
        )
        f.flush()
        config = load_config(f.name)
        assert len(config.sources) == 1
        os.unlink(f.name)


def test_auth_resolution_bearer():
    """Test Bearer token auth resolution."""
    os.environ["TEST_TOKEN"] = "abc123"
    auth = resolve_auth("bearer:TEST_TOKEN")
    assert auth == "Bearer abc123"


def test_auth_resolution_apikey():
    """Test API key header auth resolution."""
    os.environ["API_KEY"] = "key123"
    auth = resolve_auth("apikey:X-API-Key:API_KEY")
    assert auth == "key123"


def test_auth_resolution_basic():
    """Test HTTP Basic auth resolution."""
    os.environ["BASIC_USER"] = "user"
    os.environ["BASIC_PASS"] = "pass"
    auth = resolve_auth("basic:BASIC_USER:BASIC_PASS")
    assert auth.startswith("Basic ")


def test_auth_resolution_param():
    """Test query param auth resolution."""
    os.environ["QUERY_KEY"] = "secret123"
    auth = resolve_auth("param:api_key:QUERY_KEY")
    assert auth == "secret123"


def test_auth_resolution_literal():
    """Test literal auth string."""
    auth = resolve_auth("Bearer hardcoded-token")
    assert auth == "Bearer hardcoded-token"


def test_validate_missing_url():
    """Test validation fails without URL."""
    config = AggregationConfig(
        sources=[SourceConfig(type="rest", url="")],
        transform=TransformConfig(),
    )
    errors = validate_config(config)
    assert any("URL is required" in e for e in errors)


def test_validate_empty_sources():
    """Test validation fails with no sources."""
    config = AggregationConfig(sources=[], transform=TransformConfig())
    errors = validate_config(config)
    assert any("At least one source" in e for e in errors)


def test_validate_invalid_transform_type():
    """Test validation fails with invalid transform type."""
    config = AggregationConfig(
        sources=[SourceConfig(type="rest", url="https://example.com")],
        transform=TransformConfig(type="invalid"),
    )
    errors = validate_config(config)
    assert any("Transform type" in e for e in errors)


def test_default_transform_values():
    """Test default transform configuration values."""
    config_dict = {
        "sources": [{"type": "rest", "url": "https://api.example.com"}],
        "transform": {},
    }
    config = load_config(config_dict)
    assert config.transform.type == "table"
    assert config.transform.limit == 50
    assert config.transform.sort_order == "desc"


def test_pagination_config():
    """Test pagination configuration."""
    config_dict = {
        "sources": [
            {
                "type": "rest",
                "url": "https://api.example.com",
                "pagination": {
                    "type": "page",
                    "page_param": "pg",
                    "max_pages": 5,
                },
            }
        ],
        "transform": {"type": "table"},
    }
    config = load_config(config_dict)
    assert config.sources[0].pagination is not None
    assert config.sources[0].pagination.type == "page"
    assert config.sources[0].pagination.page_param == "pg"
    assert config.sources[0].pagination.max_pages == 5


def test_nested_config_roundtrip():
    """Test loading and validating complex nested config."""
    config_dict = {
        "sources": [
            {
                "type": "rest",
                "url": "https://api.github.com/repos/owner/repo/issues",
                "method": "GET",
                "auth": "bearer:GITHUB_TOKEN",
                "headers": {"Accept": "application/vnd.github.v3+json"},
                "params": {"state": "open"},
                "pagination": {
                    "type": "page",
                    "page_param": "page",
                    "max_pages": 10,
                },
                "data_path": "items",
            }
        ],
        "transform": {
            "type": "table",
            "columns": ["number", "title", "state"],
            "filters": [{"field": "state", "op": "eq", "value": "open"}],
            "sort_by": "number",
            "sort_order": "desc",
            "limit": 20,
        },
    }

    config = load_config(config_dict)
    errors = validate_config(config)

    assert len(errors) == 0
    assert config.sources[0].pagination.max_pages == 10
    assert len(config.transform.filters) == 1
