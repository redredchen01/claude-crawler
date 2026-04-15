"""Configuration loading and validation for API aggregation."""

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml


@dataclass
class PaginationConfig:
    """Pagination configuration."""

    type: str  # "page", "cursor", "link_header", "offset"
    page_param: str = "page"
    cursor_fields: List[str] = field(default_factory=lambda: ["cursor", "next_cursor"])
    offset_param: str = "offset"
    limit_param: str = "limit"
    max_pages: int = 10
    data_path: Optional[str] = None  # dot notation for nested data


@dataclass
class FilterConfig:
    """Filter configuration for data transformation."""

    field: str
    op: str  # "eq", "ne", "gt", "lt", "contains", "startswith", "regex"
    value: Any


@dataclass
class GraphQLConfig:
    """Configuration for GraphQL queries."""

    query: str
    variables: Dict[str, Any] = field(default_factory=dict)
    operation_name: Optional[str] = None
    page_size: int = 50
    data_path: str = ""
    page_info_path: str = ""
    cursor_variable: str = "after"


@dataclass
class SourceConfig:
    """Configuration for a single data source."""

    type: str  # "rest" or "graphql"
    url: str
    method: str = "GET"
    auth: Optional[str] = None  # env var name or literal
    headers: Dict[str, str] = field(default_factory=dict)
    params: Dict[str, str] = field(default_factory=dict)
    pagination: Optional[PaginationConfig] = None
    data_path: Optional[str] = None
    graphql: Optional[GraphQLConfig] = None


@dataclass
class TransformConfig:
    """Configuration for data transformation."""

    type: str = "table"  # "table", "json", "csv"
    columns: List[str] = field(default_factory=list)
    sort_by: Optional[str] = None
    sort_order: str = "desc"  # "asc" or "desc"
    filters: List[FilterConfig] = field(default_factory=list)
    limit: int = 50
    deduplicate_by: Optional[str] = None
    rename: Dict[str, str] = field(default_factory=dict)


@dataclass
class DispatchConfig:
    """Configuration for result dispatch."""

    type: str  # "slack", "email", etc.
    destination: str  # Slack channel ID, webhook URL, or email
    title: Optional[str] = None
    mention: Optional[str] = None
    thread_ts: Optional[str] = None
    unfurl_links: bool = False
    webhook_url: Optional[str] = None
    token_env: Optional[str] = None


@dataclass
class AggregationConfig:
    """Complete aggregation configuration."""

    sources: List[SourceConfig]
    transform: TransformConfig
    dispatch: Optional[DispatchConfig] = None


def load_config(path_or_dict: Any) -> AggregationConfig:
    """Load configuration from file path or dict.

    Args:
        path_or_dict: Path to YAML file or dict containing config

    Returns:
        AggregationConfig instance

    Raises:
        ValueError: If config format is invalid
    """
    if isinstance(path_or_dict, str):
        with open(path_or_dict, "r") as f:
            data = yaml.safe_load(f)
    elif isinstance(path_or_dict, dict):
        data = path_or_dict
    else:
        raise ValueError("Config must be file path (str) or dict")

    return _parse_config(data)


def _parse_config(data: Dict) -> AggregationConfig:
    """Parse raw config dict into AggregationConfig."""
    if not isinstance(data, dict):
        raise ValueError("Config must be a dict")

    sources = []
    for src in data.get("sources", []):
        pagination = None
        if "pagination" in src:
            p = src["pagination"]
            pagination = PaginationConfig(
                type=p.get("type", "page"),
                page_param=p.get("page_param", "page"),
                cursor_fields=p.get("cursor_fields", ["cursor", "next_cursor"]),
                offset_param=p.get("offset_param", "offset"),
                limit_param=p.get("limit_param", "limit"),
                max_pages=p.get("max_pages", 10),
                data_path=p.get("data_path"),
            )

        graphql_config = None
        if "graphql" in src:
            g = src["graphql"]
            graphql_config = GraphQLConfig(
                query=g["query"],
                variables=g.get("variables", {}),
                operation_name=g.get("operation_name"),
                page_size=g.get("page_size", 50),
                data_path=g.get("data_path", ""),
                page_info_path=g.get("page_info_path", ""),
                cursor_variable=g.get("cursor_variable", "after"),
            )

        sources.append(
            SourceConfig(
                type=src.get("type", "rest"),
                url=src["url"],
                method=src.get("method", "GET"),
                auth=src.get("auth"),
                headers=src.get("headers", {}),
                params=src.get("params", {}),
                pagination=pagination,
                data_path=src.get("data_path"),
                graphql=graphql_config,
            )
        )

    filters = []
    for f in data.get("transform", {}).get("filters", []):
        filters.append(FilterConfig(field=f["field"], op=f["op"], value=f["value"]))

    transform_data = data.get("transform", {})
    transform = TransformConfig(
        type=transform_data.get("type", "table"),
        columns=transform_data.get("columns", []),
        sort_by=transform_data.get("sort_by"),
        sort_order=transform_data.get("sort_order", "desc"),
        filters=filters,
        limit=transform_data.get("limit", 50),
        deduplicate_by=transform_data.get("deduplicate_by"),
        rename=transform_data.get("rename", {}),
    )

    dispatch = None
    if "dispatch" in data:
        d = data["dispatch"]
        dispatch = DispatchConfig(type=d["type"], destination=d["destination"])

    return AggregationConfig(sources=sources, transform=transform, dispatch=dispatch)


def validate_config(config: AggregationConfig) -> List[str]:
    """Validate configuration.

    Args:
        config: AggregationConfig to validate

    Returns:
        List of error messages (empty if valid)
    """
    errors = []

    # Validate sources
    if not config.sources:
        errors.append("At least one source is required")

    for i, source in enumerate(config.sources):
        if not source.url:
            errors.append(f"Source {i}: URL is required")
        if source.type not in ("rest", "graphql"):
            errors.append(f"Source {i}: type must be 'rest' or 'graphql'")
        if source.method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            errors.append(f"Source {i}: invalid HTTP method '{source.method}'")

        if source.type == "graphql":
            if not source.graphql:
                errors.append(f"Source {i}: graphql config is required for GraphQL sources")
            elif not source.graphql.query:
                errors.append(f"Source {i}: GraphQL query is required")

        if source.pagination:
            valid_types = ("page", "cursor", "link_header", "offset")
            if source.pagination.type not in valid_types:
                errors.append(
                    f"Source {i}: pagination type must be one of {valid_types}"
                )

    # Validate transform
    valid_transform_types = ("table", "json", "csv")
    if config.transform.type not in valid_transform_types:
        errors.append(f"Transform type must be one of {valid_transform_types}")

    if config.transform.sort_order not in ("asc", "desc"):
        errors.append("sort_order must be 'asc' or 'desc'")

    for i, f in enumerate(config.transform.filters):
        valid_ops = ("eq", "ne", "gt", "lt", "contains", "startswith", "regex")
        if f.op not in valid_ops:
            errors.append(f"Filter {i}: op must be one of {valid_ops}")

    if config.transform.limit < 0:
        errors.append("limit must be >= 0")

    # Validate dispatch
    if config.dispatch:
        if config.dispatch.type not in ("slack", "email"):
            errors.append("dispatch type must be 'slack' or 'email'")
        if not config.dispatch.destination:
            errors.append("dispatch destination is required")

    return errors


def resolve_auth(auth_str: Optional[str]) -> Optional[str]:
    """Resolve auth string to actual value.

    Handles:
    - bearer:{ENV_VAR} -> Bearer token from env var
    - apikey:{HEADER}:{ENV_VAR} -> Custom header value
    - basic:{USER_ENV}:{PASS_ENV} -> HTTP Basic auth
    - param:{KEY}:{ENV_VAR} -> Query param value
    - literal string -> use as-is

    Args:
        auth_str: Auth string to resolve

    Returns:
        Resolved auth value or None
    """
    if not auth_str:
        return None

    if auth_str.startswith("bearer:"):
        env_var = auth_str.split(":", 1)[1]
        return f"Bearer {os.getenv(env_var, '')}"

    if auth_str.startswith("apikey:"):
        parts = auth_str.split(":", 2)
        if len(parts) >= 3:
            header = parts[1]
            env_var = parts[2]
            return os.getenv(env_var, "")

    if auth_str.startswith("basic:"):
        parts = auth_str.split(":", 2)
        if len(parts) >= 3:
            user_env = parts[1]
            pass_env = parts[2]
            user = os.getenv(user_env, "")
            password = os.getenv(pass_env, "")
            import base64

            credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
            return f"Basic {credentials}"

    if auth_str.startswith("param:"):
        parts = auth_str.split(":", 2)
        if len(parts) >= 3:
            key = parts[1]
            env_var = parts[2]
            return os.getenv(env_var, "")

    # Return literal
    return auth_str
