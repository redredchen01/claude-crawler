from __future__ import annotations

"""Retry logic with exponential backoff for transient failures.

Supports selective retry per failure category:
- Network errors: exponential backoff (1s, 2s, 4s, 8s) up to 3 attempts
- Render errors: browser restart (1 attempt)
- Storage errors: transaction rollback (no retry)
"""

import logging
import time
from typing import Any, Callable, TypeVar

from crawler.exceptions import NetworkError, RenderError, StorageError

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Exponential backoff sequence (seconds)
BACKOFF_SEQUENCE = [1, 2, 4, 8]
MAX_NETWORK_RETRIES = 3


def retry_network(
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any,
) -> T:
    """Execute func with exponential backoff on NetworkError.

    Retries up to 3 times with 1s, 2s, 4s, 8s backoff.
    Raises NetworkError if all retries fail.
    """
    for attempt in range(MAX_NETWORK_RETRIES):
        try:
            return func(*args, **kwargs)
        except NetworkError as exc:
            if attempt >= MAX_NETWORK_RETRIES - 1:
                raise
            backoff = BACKOFF_SEQUENCE[min(attempt, len(BACKOFF_SEQUENCE) - 1)]
            logger.warning(
                "Network error on attempt %d/%d; retrying in %ds: %s",
                attempt + 1,
                MAX_NETWORK_RETRIES,
                backoff,
                exc,
            )
            time.sleep(backoff)


def retry_render(
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any,
) -> T:
    """Execute func with browser restart on RenderError.

    No retry on RenderError — just log and propagate.
    Caller (RenderThread) handles browser restart separately.
    """
    try:
        return func(*args, **kwargs)
    except RenderError as exc:
        logger.error("Render error (no retry): %s", exc)
        raise


def retry_storage(
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any,
) -> T:
    """Execute func with transaction rollback on StorageError.

    No retry on StorageError — transaction must be rolled back and
    the caller should retry the entire write request.
    """
    try:
        return func(*args, **kwargs)
    except StorageError as exc:
        logger.error("Storage error (no retry, rollback required): %s", exc)
        raise
