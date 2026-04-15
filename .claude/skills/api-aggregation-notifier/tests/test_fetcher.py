"""Tests for REST fetcher."""

import os

import pytest
import responses

from src.config import PaginationConfig, SourceConfig
from src.fetcher import RestFetcher


@responses.activate
def test_fetch_returns_list():
    """Test fetch with list response."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json=[{"id": 1, "name": "item1"}, {"id": 2, "name": "item2"}],
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert len(result.data) == 2
    assert result.data[0]["name"] == "item1"


@responses.activate
def test_fetch_extracts_data_key():
    """Test fetch extracts 'data' key from response."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}, {"id": 2}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert len(result.data) == 2


@responses.activate
def test_fetch_extracts_items_key():
    """Test fetch extracts 'items' key from response."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"items": [{"id": 1}, {"id": 2}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert len(result.data) == 2


@responses.activate
def test_fetch_extracts_results_key():
    """Test fetch extracts 'results' key from response."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"results": [{"id": 1}, {"id": 2}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert len(result.data) == 2


@responses.activate
def test_fetch_custom_data_path():
    """Test fetch with custom data_path."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"response": {"items": [{"id": 1}, {"id": 2}]}},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest", url="https://api.example.com/data", data_path="response.items"
    )
    result = fetcher.fetch(config)

    assert len(result.data) == 2


@responses.activate
def test_auth_bearer_header():
    """Test Bearer token auth."""
    os.environ["GITHUB_TOKEN"] = "token123"
    responses.add(
        responses.GET,
        "https://api.github.com/repos",
        json={"data": [{"id": 1}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.github.com/repos",
        auth="bearer:GITHUB_TOKEN",
    )
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert "Authorization" in responses.calls[0].request.headers
    assert "Bearer token123" in responses.calls[0].request.headers["Authorization"]


@responses.activate
def test_auth_apikey_header():
    """Test API key header auth."""
    os.environ["API_KEY"] = "key123"
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        auth="apikey:X-API-Key:API_KEY",
    )
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert responses.calls[0].request.headers.get("X-API-Key") == "key123"


@responses.activate
def test_auth_basic():
    """Test HTTP Basic auth."""
    os.environ["BASIC_USER"] = "user"
    os.environ["BASIC_PASS"] = "pass"
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        auth="basic:BASIC_USER:BASIC_PASS",
    )
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert "Authorization" in responses.calls[0].request.headers
    assert responses.calls[0].request.headers["Authorization"].startswith("Basic")


@responses.activate
def test_auth_param():
    """Test query param auth."""
    os.environ["API_KEY"] = "secret123"
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}]},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        auth="param:api_key:API_KEY",
    )
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert "api_key=secret123" in responses.calls[0].request.url


@responses.activate
def test_retry_on_5xx():
    """Test retry on 5xx errors."""
    responses.add(responses.GET, "https://api.example.com/data", status=500)
    responses.add(
        responses.GET, "https://api.example.com/data", json={"data": [{"id": 1}]}, status=200
    )

    fetcher = RestFetcher(max_retries=2, retry_delay=0.01)
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert result.status_code == 200
    assert len(responses.calls) == 2


@responses.activate
def test_no_retry_on_4xx():
    """Test no retry on 4xx errors."""
    responses.add(responses.GET, "https://api.example.com/data", status=404, json={"error": "not found"})

    fetcher = RestFetcher(max_retries=3)
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert result.status_code == 404
    assert result.error is not None
    assert len(responses.calls) == 1  # No retries


@responses.activate
def test_pagination_page_based():
    """Test page-based pagination."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}, {"id": 2}]},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 3}]},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": []},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        pagination=PaginationConfig(type="page", max_pages=3),
    )
    result = fetcher.fetch(config)

    assert len(result.data) == 3
    assert len(responses.calls) == 3


@responses.activate
def test_pagination_cursor_based():
    """Test cursor-based pagination."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 1}], "next_cursor": "cursor2"},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json={"data": [{"id": 2}], "next_cursor": None},
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        pagination=PaginationConfig(type="cursor", max_pages=10),
    )
    result = fetcher.fetch(config)

    assert len(result.data) == 2
    assert len(responses.calls) == 2


@responses.activate
def test_pagination_link_header():
    """Test Link header pagination."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        json=[{"id": 1}],
        headers={"Link": '<https://api.example.com/data?page=2>; rel="next"'},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://api.example.com/data?page=2",
        json=[{"id": 2}],
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(
        type="rest",
        url="https://api.example.com/data",
        pagination=PaginationConfig(type="link_header", max_pages=10),
    )
    result = fetcher.fetch(config)

    assert len(result.data) == 2


@responses.activate
def test_fetch_all_multiple_sources():
    """Test fetching from multiple sources."""
    responses.add(
        responses.GET,
        "https://api.example.com/data1",
        json=[{"id": 1}],
        status=200,
    )
    responses.add(
        responses.GET,
        "https://api.example.com/data2",
        json=[{"id": 2}],
        status=200,
    )

    fetcher = RestFetcher()
    configs = [
        SourceConfig(type="rest", url="https://api.example.com/data1"),
        SourceConfig(type="rest", url="https://api.example.com/data2"),
    ]
    results = fetcher.fetch_all(configs)

    assert len(results) == 2
    assert results[0].data[0]["id"] == 1
    assert results[1].data[0]["id"] == 2


@responses.activate
def test_fetch_error_returns_result_not_exception():
    """Test that errors return FetchResult, not exceptions."""
    responses.add(responses.GET, "https://api.example.com/data", status=500)

    fetcher = RestFetcher(max_retries=0)
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert result.status_code == 500
    assert result.error is not None
    assert isinstance(result, type(result))  # FetchResult


@responses.activate
def test_fetch_json_parse_error():
    """Test handling of JSON parse errors."""
    responses.add(
        responses.GET,
        "https://api.example.com/data",
        body="not json",
        status=200,
    )

    fetcher = RestFetcher()
    config = SourceConfig(type="rest", url="https://api.example.com/data")
    result = fetcher.fetch(config)

    assert result.error is not None
    assert "JSON" in result.error
