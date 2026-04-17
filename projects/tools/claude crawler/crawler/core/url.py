"""Canonical URL normalization for deterministic dedup across runs."""

from urllib.parse import urlparse, urlunparse


def normalize(url: str) -> str:
    """Normalize URL for deduplication.

    Rules:
    - Lowercase scheme and netloc
    - Strip URL fragment
    - Preserve query string as-is
    - Root path "/" is kept; any other trailing slash is stripped

    Deterministic by contract — stable across runs so resume-from-DB
    dedup works correctly.
    """
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path
    if path == "" or path == "/":
        path = "/"
    elif path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((scheme, netloc, path, parsed.params, parsed.query, ""))
