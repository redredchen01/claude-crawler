"""API Aggregation Notifier - REST/GraphQL API fetcher and data transformer."""

from .config import (
    AggregationConfig,
    DispatchConfig,
    FilterConfig,
    GraphQLConfig,
    PaginationConfig,
    SourceConfig,
    TransformConfig,
    load_config,
    validate_config,
)
from .dispatcher import DispatchResult, SlackDispatcher
from .fetcher import FetchResult, RestFetcher
from .graphql import GraphQLFetcher
from .transformer import DataTransformer, TransformResult

__all__ = [
    "AggregationConfig",
    "DispatchConfig",
    "FilterConfig",
    "GraphQLConfig",
    "PaginationConfig",
    "SourceConfig",
    "TransformConfig",
    "load_config",
    "validate_config",
    "FetchResult",
    "RestFetcher",
    "GraphQLFetcher",
    "DataTransformer",
    "TransformResult",
    "DispatchResult",
    "SlackDispatcher",
]
