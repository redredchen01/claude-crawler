"""GraphQL API fetcher with auth, cursor pagination, and retry support."""

import logging
import time
from typing import Any, Dict, List, Optional

import requests

from .config import SourceConfig, resolve_auth
from .fetcher import FetchResult

logger = logging.getLogger(__name__)


class GraphQLFetcher:
    """Fetch data from GraphQL APIs — same interface as RestFetcher."""

    def __init__(self, timeout: int = 30, max_retries: int = 3, retry_delay: float = 1.0):
        """Initialize GraphQLFetcher.

        Args:
            timeout: Request timeout in seconds
            max_retries: Max retry attempts
            retry_delay: Initial delay between retries (exponential backoff)
        """
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.session = requests.Session()

    def fetch(self, config: SourceConfig) -> FetchResult:
        """Fetch data from a single GraphQL source.

        Args:
            config: Source configuration (type must be "graphql")

        Returns:
            FetchResult with data or error
        """
        if config.type != "graphql":
            return FetchResult(
                source_url=config.url,
                status_code=0,
                error=f"Unsupported source type: {config.type}",
            )

        if not config.graphql:
            return FetchResult(
                source_url=config.url,
                status_code=0,
                error="GraphQL config is required",
            )

        all_data = []
        cursor = None
        page_number = 1
        max_pages = 10  # Default max pages

        while page_number <= max_pages:
            # Prepare query variables
            variables = dict(config.graphql.variables)

            # Add cursor if pagination is in use
            if config.graphql.page_info_path:
                variables[config.graphql.cursor_variable] = cursor

            # Add page size if specified
            if config.graphql.page_size > 0:
                # Common variable names for pagination
                if "first" in config.graphql.query:
                    variables.setdefault("first", config.graphql.page_size)
                if "limit" in config.graphql.query:
                    variables.setdefault("limit", config.graphql.page_size)

            # Prepare auth
            auth_value = resolve_auth(config.auth)
            headers = dict(config.headers)
            if auth_value:
                if config.auth and config.auth.startswith("apikey:"):
                    parts = config.auth.split(":", 2)
                    if len(parts) >= 2:
                        header_name = parts[1]
                        headers[header_name] = auth_value
                else:
                    headers["Authorization"] = auth_value

            headers["Content-Type"] = "application/json"

            # Execute query
            response_data = self._execute_query(
                url=config.url,
                headers=headers,
                query=config.graphql.query,
                variables=variables,
                operation_name=config.graphql.operation_name,
            )

            if response_data is None:
                return FetchResult(
                    source_url=config.url,
                    status_code=0,
                    error="Query execution failed after retries",
                )

            # Check for GraphQL errors
            if "errors" in response_data and response_data["errors"]:
                error_messages = [
                    str(e.get("message", str(e))) for e in response_data["errors"]
                ]
                return FetchResult(
                    source_url=config.url,
                    status_code=200,
                    error=f"GraphQL errors: {'; '.join(error_messages)}",
                )

            # Extract data
            page_data = self._extract_data(
                response_data.get("data", {}), config.graphql.data_path
            )
            if not isinstance(page_data, list):
                page_data = [page_data] if page_data else []

            all_data.extend(page_data)

            # Check for next page
            has_next = False
            if config.graphql.page_info_path:
                page_info = self._get_nested(
                    response_data.get("data", {}), config.graphql.page_info_path
                )
                if page_info and isinstance(page_info, dict):
                    has_next = page_info.get("hasNextPage", False)
                    if has_next:
                        cursor = page_info.get("endCursor")
            else:
                # No pagination info configured, fetch single page
                break

            if not has_next or not cursor:
                break

            page_number += 1

        return FetchResult(
            source_url=config.url,
            data=all_data,
            status_code=200,
            metadata={"pages": page_number, "total_records": len(all_data)},
        )

    def fetch_all(self, configs: List[SourceConfig]) -> List[FetchResult]:
        """Fetch from multiple sources.

        Args:
            configs: List of source configurations

        Returns:
            List of FetchResults
        """
        results = []
        for config in configs:
            result = self.fetch(config)
            results.append(result)
        return results

    def _execute_query(
        self,
        url: str,
        headers: Dict[str, str],
        query: str,
        variables: Dict[str, Any],
        operation_name: Optional[str],
    ) -> Optional[Dict]:
        """Execute GraphQL query with retry logic.

        Args:
            url: GraphQL endpoint URL
            headers: Request headers
            query: GraphQL query string
            variables: Query variables
            operation_name: Operation name (for named queries)

        Returns:
            Parsed JSON response or None if all retries failed
        """
        payload = {"query": query, "variables": variables}
        if operation_name:
            payload["operationName"] = operation_name

        delay = self.retry_delay

        for attempt in range(self.max_retries + 1):
            try:
                logger.debug(f"Attempt {attempt + 1}: GraphQL {url}")
                response = self.session.post(
                    url, json=payload, headers=headers, timeout=self.timeout
                )

                # Don't retry on 4xx
                if 400 <= response.status_code < 500:
                    logger.error(
                        f"HTTP {response.status_code}: {response.text[:200]}"
                    )
                    return None

                # Retry on 5xx
                if response.status_code >= 500:
                    if attempt < self.max_retries:
                        logger.warning(
                            f"HTTP {response.status_code}, retrying in {delay}s"
                        )
                        time.sleep(delay)
                        delay *= 2
                        continue
                    logger.error(f"HTTP {response.status_code} after {attempt + 1} attempts")
                    return None

                return response.json()

            except (requests.Timeout, requests.ConnectionError) as e:
                if attempt < self.max_retries:
                    logger.warning(f"Request error: {str(e)}, retrying in {delay}s")
                    time.sleep(delay)
                    delay *= 2
                    continue
                logger.error(f"Request failed after {attempt + 1} attempts: {str(e)}")
                return None

        return None

    def _extract_data(self, response: Any, data_path: str) -> Any:
        """Extract data from GraphQL response.

        Args:
            response: Response data (typically response["data"])
            data_path: Dot notation path to data (e.g., "repository.issues.nodes")

        Returns:
            Extracted data (list or single item)
        """
        if data_path:
            return self._get_nested(response, data_path)

        # Common GraphQL patterns
        if isinstance(response, dict):
            # Try common field names
            for key in ("nodes", "items", "results", "data"):
                if key in response:
                    return response[key]

        return response

    def _get_nested(self, obj: Any, path: str) -> Any:
        """Get nested value using dot notation.

        Args:
            obj: Object to traverse
            path: Dot notation path (e.g., "user.address.city")

        Returns:
            Value at path or None
        """
        if not path:
            return obj

        parts = path.split(".")
        current = obj

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                try:
                    index = int(part)
                    current = current[index]
                except (ValueError, IndexError):
                    return None
            else:
                return None

            if current is None:
                return None

        return current
