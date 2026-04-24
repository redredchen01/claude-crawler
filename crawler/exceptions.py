from __future__ import annotations

"""Unified exception hierarchy for Claude Crawler.

All crawler-specific errors inherit from CrawlerException, allowing callers to
catch and handle failures by category: network, rendering, parsing, or storage.
"""


class CrawlerException(Exception):
    """Base exception for all crawler-specific errors."""

    pass


class NetworkError(CrawlerException):
    """HTTP fetch, connection, redirect, or SSRF protection failures."""

    def __init__(self, message: str, failure_reason: str | None = None):
        super().__init__(message)
        self.failure_reason = failure_reason


class RenderError(CrawlerException):
    """JavaScript rendering, browser crash, or Playwright failures."""

    pass


class ParserError(CrawlerException):
    """HTML parsing, structured data extraction, or DOM traversal failures."""

    pass


class StorageError(CrawlerException):
    """Database schema, transaction, or persistence failures."""

    pass
