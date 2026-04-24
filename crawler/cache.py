from __future__ import annotations

"""HTTP response caching service."""


from crawler.storage import clear_http_cache as _clear_http_cache
from crawler.storage import cleanup_expired_http_cache as _cleanup_expired_http_cache
from crawler.storage import get_cache_metrics as _get_cache_metrics
from crawler.storage import get_cached_response as _get_cached_response
from crawler.storage import (
    get_connection,
)
from crawler.storage import save_cached_response as _save_cached_response


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

    def save_cache(
        self,
        url: str,
        etag: str | None,
        last_modified: str | None,
        cache_control: str | None,
        response_body: bytes,
    ) -> None:
        """Store or update cached response (UPSERT by URL)."""
        with get_connection(self.db_path, write=True) as conn:
            _save_cached_response(
                conn, url, etag, last_modified, cache_control, response_body
            )

    def invalidate_cache(self, url: str) -> None:
        """Remove specific URL from cache. Not yet implemented."""
        raise NotImplementedError(
            "invalidate_cache is not yet implemented in storage layer"
        )

    def invalidate_all(self) -> None:
        """Clear entire cache."""
        with get_connection(self.db_path, write=True) as conn:
            _clear_http_cache(conn)

    def get_metrics(self) -> dict:
        """Return cache statistics: total_bytes, entry_count."""
        with get_connection(self.db_path) as conn:
            return _get_cache_metrics(conn)

    def cleanup_expired(self, max_age_days: int = 7) -> int:
        """Delete cached responses older than max_age_days. Returns count of deleted entries."""
        with get_connection(self.db_path, write=True) as conn:
            return _cleanup_expired_http_cache(conn, max_age_days)
