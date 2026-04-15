"""Tests for GraphQL fetcher."""

from unittest.mock import MagicMock, patch

import pytest

from src.config import GraphQLConfig, SourceConfig
from src.graphql import GraphQLFetcher


@pytest.fixture
def fetcher():
    """Create a GraphQLFetcher instance."""
    return GraphQLFetcher(timeout=10, max_retries=2, retry_delay=0.1)


@pytest.fixture
def sample_graphql_config():
    """Create a sample GraphQL source config."""
    return SourceConfig(
        type="graphql",
        url="https://api.github.com/graphql",
        auth="bearer:GITHUB_TOKEN",
        graphql=GraphQLConfig(
            query="""
            query GetRepositories($first: Int!) {
                viewer {
                    repositories(first: $first) {
                        nodes {
                            name
                            description
                            stargazerCount
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
            """,
            variables={"first": 10},
            page_size=10,
            data_path="data.viewer.repositories.nodes",
            page_info_path="data.viewer.repositories.pageInfo",
            cursor_variable="after",
        ),
    )




def test_fetch_passes_variables(fetcher, sample_graphql_config):
    """Test that query variables are passed correctly."""
    with patch.object(fetcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "viewer": {
                    "repositories": {
                        "nodes": [],
                        "pageInfo": {"hasNextPage": False},
                    }
                }
            }
        }
        mock_post.return_value = mock_response

        fetcher.fetch(sample_graphql_config)

        # Check that variables were included in POST body
        call_kwargs = mock_post.call_args[1]
        payload = call_kwargs["json"]
        assert payload["variables"]["first"] == 10


def test_fetch_data_path_extraction(fetcher, sample_graphql_config):
    """Test data extraction via data_path."""
    response = {
        "data": {
            "viewer": {
                "repositories": {
                    "nodes": [
                        {"name": "repo1", "stars": 5},
                        {"name": "repo2", "stars": 10},
                    ]
                }
            }
        }
    }

    extracted = fetcher._extract_data(response.get("data", {}), "viewer.repositories.nodes")

    assert len(extracted) == 2
    assert extracted[0]["name"] == "repo1"


def test_fetch_data_path_fallback_to_nodes(fetcher):
    """Test auto-fallback to 'nodes' field when data_path empty."""
    response = {
        "nodes": [{"id": 1}, {"id": 2}],
    }

    extracted = fetcher._extract_data(response, "")

    # Should fall back to 'nodes' key when data_path is empty
    assert extracted == [{"id": 1}, {"id": 2}]


def test_fetch_auth_bearer_header(fetcher, sample_graphql_config):
    """Test Bearer token auth."""
    with patch.dict("os.environ", {"GITHUB_TOKEN": "ghp_test123"}):
        with patch.object(fetcher.session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": {
                    "viewer": {
                        "repositories": {
                            "nodes": [],
                            "pageInfo": {"hasNextPage": False},
                        }
                    }
                }
            }
            mock_post.return_value = mock_response

            fetcher.fetch(sample_graphql_config)

            # Check authorization header
            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["headers"]["Authorization"] == "Bearer ghp_test123"


def test_fetch_auth_apikey_header(fetcher):
    """Test API Key auth with custom header."""
    config = SourceConfig(
        type="graphql",
        url="https://api.example.com/graphql",
        auth="apikey:X-API-Key:MY_API_KEY",
        graphql=GraphQLConfig(query="query { items { id } }"),
    )

    with patch.dict("os.environ", {"MY_API_KEY": "key123"}):
        with patch.object(fetcher.session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": {"items": [{"id": 1}]}
            }
            mock_post.return_value = mock_response

            fetcher.fetch(config)

            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["headers"]["X-API-Key"] == "key123"






def test_fetch_graphql_errors(fetcher, sample_graphql_config):
    """Test handling of GraphQL errors."""
    with patch.object(fetcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "errors": [{"message": "Authentication required"}]
        }
        mock_post.return_value = mock_response

        result = fetcher.fetch(sample_graphql_config)

        assert result.error is not None
        assert "Authentication required" in result.error


def test_fetch_retry_on_5xx(fetcher, sample_graphql_config):
    """Test retry on 5xx errors."""
    with patch.object(fetcher.session, "post") as mock_post:
        # First call: 500 error, second call: success
        response_500 = MagicMock()
        response_500.status_code = 500

        response_200 = MagicMock()
        response_200.status_code = 200
        response_200.json.return_value = {
            "data": {
                "viewer": {
                    "repositories": {
                        "nodes": [{"name": "repo1"}],
                        "pageInfo": {"hasNextPage": False},
                    }
                }
            }
        }

        mock_post.side_effect = [response_500, response_200]

        with patch("time.sleep"):
            result = fetcher.fetch(sample_graphql_config)

        assert result.error is None
        assert mock_post.call_count == 2


def test_fetch_no_retry_on_4xx(fetcher, sample_graphql_config):
    """Test no retry on 4xx errors."""
    with patch.object(fetcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad request"
        mock_post.return_value = mock_response

        result = fetcher.fetch(sample_graphql_config)

        assert result.error is not None
        # Should not retry on 4xx
        assert mock_post.call_count == 1


def test_fetch_network_timeout_retry(fetcher, sample_graphql_config):
    """Test retry on network timeout."""
    import requests

    with patch.object(fetcher.session, "post") as mock_post:
        # First call: timeout, second call: success
        mock_post.side_effect = [
            requests.Timeout("Connection timeout"),
            MagicMock(
                status_code=200,
                json=MagicMock(
                    return_value={
                        "data": {
                            "viewer": {
                                "repositories": {
                                    "nodes": [],
                                    "pageInfo": {"hasNextPage": False},
                                }
                            }
                        }
                    }
                ),
            ),
        ]

        with patch("time.sleep"):
            result = fetcher.fetch(sample_graphql_config)

        assert result.error is None
        assert mock_post.call_count == 2


def test_fetch_all_multiple_sources(fetcher):
    """Test fetching from multiple GraphQL sources."""
    configs = [
        SourceConfig(
            type="graphql",
            url="https://api1.example.com/graphql",
            graphql=GraphQLConfig(query="query { items1 { id } }"),
        ),
        SourceConfig(
            type="graphql",
            url="https://api2.example.com/graphql",
            graphql=GraphQLConfig(query="query { items2 { id } }"),
        ),
    ]

    with patch.object(fetcher.session, "post") as mock_post:
        response1 = MagicMock()
        response1.status_code = 200
        response1.json.return_value = {"data": {"items1": [{"id": 1}]}}

        response2 = MagicMock()
        response2.status_code = 200
        response2.json.return_value = {"data": {"items2": [{"id": 2}]}}

        mock_post.side_effect = [response1, response2]

        results = fetcher.fetch_all(configs)

        assert len(results) == 2
        assert results[0].source_url == "https://api1.example.com/graphql"
        assert results[1].source_url == "https://api2.example.com/graphql"


def test_fetch_empty_result(fetcher):
    """Test handling of empty results."""
    config = SourceConfig(
        type="graphql",
        url="https://api.example.com/graphql",
        graphql=GraphQLConfig(
            query="query { items { id } }",
            data_path="data.items",
        ),
    )

    with patch.object(fetcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"items": []}}
        mock_post.return_value = mock_response

        result = fetcher.fetch(config)

        assert result.error is None
        assert len(result.data) == 0


def test_get_nested_dot_notation(fetcher):
    """Test dot notation path traversal."""
    obj = {
        "user": {
            "profile": {
                "address": {
                    "city": "San Francisco"
                }
            }
        }
    }

    value = fetcher._get_nested(obj, "user.profile.address.city")

    assert value == "San Francisco"


def test_get_nested_missing_path(fetcher):
    """Test handling of missing nested paths."""
    obj = {"user": {"name": "Alice"}}

    value = fetcher._get_nested(obj, "user.profile.address.city")

    assert value is None
