"""API module tests — RequestBuilder, RetryStrategy, HTTP requests"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import requests
from ydk.commands.api import RequestBuilder, RetryStrategy, PreparedRequest


class TestRetryStrategy:
    """RetryStrategy factory tests"""

    def test_init_defaults(self):
        """Test default RetryStrategy initialization"""
        strategy = RetryStrategy()
        assert strategy.max_retries == 3
        assert strategy.backoff_factor == 2.0
        assert strategy.status_forcelist == (429, 500, 502, 503)

    def test_init_custom(self):
        """Test custom RetryStrategy initialization"""
        strategy = RetryStrategy(
            max_retries=5,
            backoff_factor=1.5,
            status_forcelist=(429, 500),
            allowed_methods=("GET", "POST"),
        )
        assert strategy.max_retries == 5
        assert strategy.backoff_factor == 1.5
        assert strategy.status_forcelist == (429, 500)
        assert strategy.allowed_methods == ("GET", "POST")

    def test_to_urllib3_retry(self):
        """Test conversion to urllib3 Retry object"""
        strategy = RetryStrategy(max_retries=3, backoff_factor=2.0)
        urllib3_retry = strategy.to_urllib3_retry()

        assert urllib3_retry.total == 3
        assert urllib3_retry.backoff_factor == 2.0
        assert 429 in urllib3_retry.status_forcelist
        assert 500 in urllib3_retry.status_forcelist

    def test_create_session(self):
        """Test creating a requests Session with retry strategy"""
        strategy = RetryStrategy()
        session = strategy.create_session()

        assert isinstance(session, requests.Session)
        # Verify adapters are mounted
        assert "http://" in session.adapters
        assert "https://" in session.adapters


class TestRequestBuilder:
    """RequestBuilder factory tests"""

    def test_init_defaults(self):
        """Test default RequestBuilder initialization"""
        builder = RequestBuilder()
        assert builder.method == "GET"
        assert builder.timeout == 10
        assert builder.headers == {}
        assert isinstance(builder.retry_strategy, RetryStrategy)

    def test_init_custom(self):
        """Test custom RequestBuilder initialization"""
        custom_strategy = RetryStrategy(max_retries=5)
        builder = RequestBuilder(
            method="POST",
            timeout=30,
            headers={"X-Custom": "header"},
            retry_strategy=custom_strategy,
        )
        assert builder.method == "POST"
        assert builder.timeout == 30
        assert builder.headers == {"X-Custom": "header"}
        assert builder.retry_strategy == custom_strategy

    def test_set_url(self):
        """Test setting URL with fluent API"""
        builder = RequestBuilder()
        result = builder.set_url("https://api.example.com/users")
        assert result is builder  # Fluent API returns self
        assert builder.url == "https://api.example.com/users"

    def test_set_params(self):
        """Test setting query parameters"""
        builder = RequestBuilder()
        params = {"page": 1, "limit": 10}
        result = builder.set_params(params)
        assert result is builder
        assert builder.params == params

    def test_set_data_dict(self):
        """Test setting form-encoded data (dict)"""
        builder = RequestBuilder()
        data = {"username": "user", "password": "pass"}
        result = builder.set_data(data)
        assert result is builder
        assert builder.data == data

    def test_set_data_str(self):
        """Test setting form-encoded data (string)"""
        builder = RequestBuilder()
        data = "key1=value1&key2=value2"
        result = builder.set_data(data)
        assert result is builder
        assert builder.data == data

    def test_set_json(self):
        """Test setting JSON body"""
        builder = RequestBuilder()
        json_data = {"name": "John", "email": "john@example.com"}
        result = builder.set_json(json_data)
        assert result is builder
        assert builder.json_data == json_data

    def test_add_header(self):
        """Test adding single header with fluent API"""
        builder = RequestBuilder()
        result = builder.add_header("Authorization", "Bearer token123")
        assert result is builder
        assert builder.headers["Authorization"] == "Bearer token123"

    def test_add_multiple_headers(self):
        """Test adding multiple headers with fluent API"""
        builder = RequestBuilder()
        (
            builder.add_header("Authorization", "Bearer token")
            .add_header("Content-Type", "application/json")
            .add_header("X-Custom", "value")
        )
        assert len(builder.headers) == 3
        assert builder.headers["Authorization"] == "Bearer token"

    def test_build_success(self):
        """Test building a valid request"""
        builder = RequestBuilder(timeout=15)
        builder.set_url("https://api.example.com/data")
        builder.add_header("Authorization", "Bearer token")
        builder.set_json({"key": "value"})

        prepared = builder.build()
        assert isinstance(prepared, PreparedRequest)
        assert prepared.method == "GET"
        assert prepared.url == "https://api.example.com/data"
        assert prepared.timeout == 15

    def test_build_without_url_raises(self):
        """Test that building without URL raises ValueError"""
        builder = RequestBuilder()
        with pytest.raises(ValueError, match="URL is required"):
            builder.build()

    def test_fluent_chain(self):
        """Test complete fluent API chain"""
        builder = RequestBuilder(method="POST", timeout=20)
        prepared = (
            builder.set_url("https://api.example.com/users")
            .set_json({"username": "john"})
            .add_header("Authorization", "Bearer abc123")
            .add_header("X-Request-ID", "12345")
            .build()
        )

        assert prepared.method == "POST"
        assert prepared.url == "https://api.example.com/users"
        assert prepared.json_data == {"username": "john"}
        assert prepared.headers["Authorization"] == "Bearer abc123"
        assert prepared.headers["X-Request-ID"] == "12345"


class TestPreparedRequest:
    """PreparedRequest tests"""

    def test_init_minimal(self):
        """Test minimal PreparedRequest initialization"""
        prepared = PreparedRequest(method="GET", url="https://example.com")
        assert prepared.method == "GET"
        assert prepared.url == "https://example.com"
        assert prepared.timeout == 10
        assert isinstance(prepared.retry_strategy, RetryStrategy)

    def test_init_full(self):
        """Test full PreparedRequest initialization"""
        retry = RetryStrategy(max_retries=5)
        prepared = PreparedRequest(
            method="POST",
            url="https://api.example.com/data",
            params={"key": "value"},
            data={"username": "user"},
            json_data={"name": "John"},
            headers={"Authorization": "Bearer token"},
            timeout=30,
            retry_strategy=retry,
        )
        assert prepared.method == "POST"
        assert prepared.url == "https://api.example.com/data"
        assert prepared.timeout == 30
        assert prepared.retry_strategy == retry

    @patch("requests.Session.request")
    def test_execute_success(self, mock_request):
        """Test successful HTTP request execution"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "ok"}
        mock_request.return_value = mock_response

        prepared = PreparedRequest(
            method="GET",
            url="https://api.example.com/users",
            timeout=10,
        )
        response = prepared.execute()

        assert response.status_code == 200
        mock_request.assert_called_once()

    @patch("requests.Session.request")
    def test_execute_with_params(self, mock_request):
        """Test execution with query parameters"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        prepared = PreparedRequest(
            method="GET",
            url="https://api.example.com/search",
            params={"q": "python", "limit": 10},
            timeout=10,
        )
        prepared.execute()

        # Verify the request was made with params
        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["params"] == {"q": "python", "limit": 10}

    @patch("requests.Session.request")
    def test_execute_post_with_json(self, mock_request):
        """Test POST request with JSON body"""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_request.return_value = mock_response

        prepared = PreparedRequest(
            method="POST",
            url="https://api.example.com/users",
            json_data={"name": "John", "email": "john@example.com"},
            timeout=10,
        )
        prepared.execute()

        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["json"] == {"name": "John", "email": "john@example.com"}
        assert call_kwargs["method"] == "POST"

    @patch("requests.Session.request")
    def test_execute_with_headers(self, mock_request):
        """Test execution with custom headers"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        prepared = PreparedRequest(
            method="GET",
            url="https://api.example.com/data",
            headers={"Authorization": "Bearer token123", "X-Custom": "value"},
            timeout=10,
        )
        prepared.execute()

        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer token123"
        assert call_kwargs["headers"]["X-Custom"] == "value"

    @patch("requests.Session.request")
    def test_execute_error_handling(self, mock_request):
        """Test execution with HTTP error"""
        mock_request.side_effect = requests.exceptions.Timeout("Request timeout")

        prepared = PreparedRequest(method="GET", url="https://example.com", timeout=5)

        with pytest.raises(requests.exceptions.Timeout):
            prepared.execute()

    def test_repr(self):
        """Test string representation"""
        prepared = PreparedRequest(method="POST", url="https://api.example.com/users")
        assert repr(prepared) == "<PreparedRequest POST https://api.example.com/users>"


class TestIntegration:
    """Integration tests for RequestBuilder → PreparedRequest → execute flow"""

    @patch("requests.Session.request")
    def test_full_workflow_get(self, mock_request):
        """Test complete workflow: build → prepare → execute (GET)"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"users": []}
        mock_response.content = b'{"users": []}'
        mock_request.return_value = mock_response

        builder = RequestBuilder(method="GET", timeout=15)
        prepared = (
            builder.set_url("https://api.example.com/users")
            .set_params({"limit": 10})
            .add_header("Authorization", "Bearer token")
            .build()
        )

        response = prepared.execute()
        assert response.status_code == 200

    @patch("requests.Session.request")
    def test_full_workflow_post(self, mock_request):
        """Test complete workflow: build → prepare → execute (POST)"""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": 1, "name": "John"}
        mock_request.return_value = mock_response

        builder = RequestBuilder(method="POST", timeout=20)
        prepared = (
            builder.set_url("https://api.example.com/users")
            .set_json({"name": "John", "email": "john@example.com"})
            .add_header("Content-Type", "application/json")
            .add_header("Authorization", "Bearer token")
            .build()
        )

        response = prepared.execute()
        assert response.status_code == 201

    @patch("requests.Session.request")
    def test_full_workflow_put(self, mock_request):
        """Test complete workflow for PUT request"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        builder = RequestBuilder(method="PUT")
        prepared = (
            builder.set_url("https://api.example.com/users/1")
            .set_json({"name": "Jane"})
            .add_header("Authorization", "Bearer token")
            .build()
        )

        response = prepared.execute()
        assert response.status_code == 200

    @patch("requests.Session.request")
    def test_full_workflow_delete(self, mock_request):
        """Test complete workflow for DELETE request"""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_request.return_value = mock_response

        builder = RequestBuilder(method="DELETE")
        prepared = (
            builder.set_url("https://api.example.com/users/1")
            .add_header("Authorization", "Bearer token")
            .build()
        )

        response = prepared.execute()
        assert response.status_code == 204

    @patch("requests.Session.request")
    def test_retry_strategy_applied(self, mock_request):
        """Test that retry strategy is properly applied during execution"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        custom_retry = RetryStrategy(max_retries=5, backoff_factor=1.5)
        builder = RequestBuilder(retry_strategy=custom_retry)
        prepared = (
            builder.set_url("https://api.example.com/data").build()
        )

        # Execute should use the custom retry strategy
        prepared.execute()
        assert prepared.retry_strategy == custom_retry
        assert prepared.retry_strategy.max_retries == 5
