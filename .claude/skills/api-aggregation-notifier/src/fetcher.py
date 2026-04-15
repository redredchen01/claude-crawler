"""REST API fetcher with auth, pagination, and retry support."""

import base64
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import requests

from .config import PaginationConfig, SourceConfig, resolve_auth

logger = logging.getLogger(__name__)


@dataclass
class FetchResult:
    """Result of a fetch operation."""

    source_url: str
    data: List[Dict] = field(default_factory=list)
    status_code: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


class RestFetcher:
    """Fetch data from REST APIs with auth, pagination, and retries."""

    def __init__(self, timeout: int = 30, max_retries: int = 3, retry_delay: float = 1.0):
        """Initialize RestFetcher.

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
        """Fetch data from a single source.

        Args:
            config: Source configuration

        Returns:
            FetchResult with data or error
        """
        if config.type != "rest":
            return FetchResult(
                source_url=config.url,
                status_code=0,
                error=f"Unsupported source type: {config.type}",
            )

        all_data = []
        current_url = config.url
        page_number = 1
        cursor = None
        max_pages = (
            config.pagination.max_pages if config.pagination else 10
        )

        while page_number <= max_pages:
            # Build request params
            params = dict(config.params)
            headers = dict(config.headers)

            # Add auth
            auth_value = resolve_auth(config.auth)
            if auth_value:
                if config.auth and config.auth.startswith("apikey:"):
                    # Custom header
                    parts = config.auth.split(":", 2)
                    if len(parts) >= 2:
                        header_name = parts[1]
                        headers[header_name] = auth_value
                elif config.auth and config.auth.startswith("param:"):
                    # Query param
                    parts = config.auth.split(":", 2)
                    if len(parts) >= 2:
                        param_key = parts[1]
                        params[param_key] = auth_value
                else:
                    # Bearer or Basic
                    headers["Authorization"] = auth_value

            # Add pagination params
            if config.pagination:
                if config.pagination.type == "page":
                    params[config.pagination.page_param] = str(page_number)
                elif config.pagination.type == "cursor" and cursor:
                    params["cursor"] = cursor
                elif config.pagination.type == "offset":
                    offset = (page_number - 1) * params.get(
                        config.pagination.limit_param, 50
                    )
                    params[config.pagination.offset_param] = str(offset)

            # Make request with retry
            response = self._request_with_retry(
                method=config.method,
                url=current_url,
                params=params,
                headers=headers,
            )

            if response is None:
                return FetchResult(
                    source_url=config.url,
                    status_code=0,
                    error="Request failed after retries",
                )

            # Check for errors
            if response.status_code >= 400:
                return FetchResult(
                    source_url=config.url,
                    status_code=response.status_code,
                    error=f"HTTP {response.status_code}: {response.text[:200]}",
                )

            # Parse response
            try:
                json_data = response.json()
            except Exception as e:
                return FetchResult(
                    source_url=config.url,
                    status_code=response.status_code,
                    error=f"Failed to parse JSON: {str(e)}",
                )

            # Extract data
            page_data = self._extract_data(json_data, config.data_path)
            if not isinstance(page_data, list):
                page_data = [page_data] if page_data else []

            all_data.extend(page_data)

            # Check for next page
            has_next = False

            if config.pagination:
                if config.pagination.type == "cursor":
                    # Look for cursor in response
                    for field in config.pagination.cursor_fields:
                        cursor = self._get_nested(json_data, field)
                        if cursor:
                            has_next = True
                            break
                elif config.pagination.type == "link_header":
                    # Parse Link header
                    link_header = response.headers.get("Link", "")
                    next_url = self._parse_link_header(link_header, "next")
                    if next_url:
                        current_url = next_url
                        has_next = True
                elif config.pagination.type in ("page", "offset"):
                    # Simple increment pagination
                    has_next = len(page_data) > 0

            if not has_next:
                break

            page_number += 1

        return FetchResult(
            source_url=config.url,
            data=all_data,
            status_code=200,
            metadata={"pages": page_number - 1, "total_records": len(all_data)},
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

    def _request_with_retry(
        self,
        method: str,
        url: str,
        params: Dict[str, str],
        headers: Dict[str, str],
    ) -> Optional[requests.Response]:
        """Make HTTP request with retry logic.

        Args:
            method: HTTP method
            url: Request URL
            params: Query parameters
            headers: Request headers

        Returns:
            Response object or None if all retries failed
        """
        delay = self.retry_delay

        for attempt in range(self.max_retries + 1):
            try:
                logger.debug(f"Attempt {attempt + 1}: {method} {url}")
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    headers=headers,
                    timeout=self.timeout,
                )

                # Don't retry on 4xx
                if 400 <= response.status_code < 500:
                    return response

                # Retry on 5xx
                if response.status_code >= 500:
                    if attempt < self.max_retries:
                        logger.warning(
                            f"HTTP {response.status_code}, retrying in {delay}s"
                        )
                        time.sleep(delay)
                        delay *= 2  # Exponential backoff
                        continue
                    return response

                return response

            except (requests.Timeout, requests.ConnectionError) as e:
                if attempt < self.max_retries:
                    logger.warning(f"Request error: {str(e)}, retrying in {delay}s")
                    time.sleep(delay)
                    delay *= 2
                    continue
                logger.error(f"Request failed after {attempt + 1} attempts: {str(e)}")
                return None

        return None

    def _extract_data(self, response: Any, data_path: Optional[str]) -> Any:
        """Extract data from JSON response.

        Handles common patterns:
        - List directly
        - {"data": [...]}
        - {"items": [...]}
        - {"results": [...]}
        - Custom dot notation path

        Args:
            response: JSON response
            data_path: Custom path in dot notation

        Returns:
            Extracted data (list or single item)
        """
        # Custom path
        if data_path:
            return self._get_nested(response, data_path)

        # Common patterns
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            for key in ("data", "items", "results"):
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

    def _parse_link_header(self, link_header: str, rel: str) -> Optional[str]:
        """Parse Link header to find URL for given rel.

        Format: <url>; rel="next", <url>; rel="last"

        Args:
            link_header: Link header value
            rel: Relationship type to find

        Returns:
            URL or None
        """
        if not link_header:
            return None

        for link in link_header.split(","):
            match = re.search(r'<([^>]+)>.*rel="([^"]+)"', link)
            if match:
                url, link_rel = match.groups()
                if link_rel == rel:
                    return url

        return None
