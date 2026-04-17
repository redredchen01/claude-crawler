"""HTTP response caching service."""

import sqlite3
from crawler.storage import (
    get_connection,
    get_cached_response as _get_cached_response,
    save_cached_response as _save_cached_response,
    clear_http_cache as _clear_http_cache,
    get_cache_metrics as _get_cache_metrics,
)


class CacheService:
    """Encapsulates HTTP response cache CRUD operations.

    Provides a clean abstraction over cache storage for potential future extensions
    (e.g., Redis fallback, distributed cache). For MVP, delegates to SQLite helpers.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path

    def get_cache(self, url: str) -> dict | None:
        """Fetch cached response metadata + body for URL.

        Returns dict with keys: etag, last_modified, cache_control, cached_at,
        response_body, size_bytes. Returns None if not cached.
        """
        with get_connection(self.db_path) as conn:
            return _get_cached_response(conn, url)

    def save_cache(self, url: str, etag: str | None, last_modified: str | None,
                  cache_control: str | None, response_body: bytes) -> None:
        """Store or update cached response (UPSERT by URL)."""
        with get_connection(self.db_path) as conn:
            _save_cached_response(conn, url, etag, last_modified, cache_control, response_body)

    def invalidate_cache(self, url: str) -> None:
        """Remove specific URL from cache (not yet implemented in storage layer).

        For MVP, this is a no-op. Caching is cleared via invalidate_all() or
        when server sends new content (200 response).
        """
        pass

    def invalidate_all(self) -> None:
        """Clear entire cache."""
        with get_connection(self.db_path) as conn:
            _clear_http_cache(conn)

    def get_metrics(self) -> dict:
        """Return cache statistics: total_bytes, entry_count."""
        with get_connection(self.db_path) as conn:
            return _get_cache_metrics(conn)
