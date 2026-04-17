"""Canonical URL normalization for deterministic dedup across runs."""

import ipaddress
import socket
from urllib.parse import urlparse, urlunparse

# Hostnames we treat as private even before doing DNS / IP lookup. Saves
# the resolver round-trip on the obvious cases. ``localhost.localdomain``
# matches some legacy /etc/hosts entries.
_PRIVATE_HOSTNAMES = frozenset({
    "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
})


def is_private_host(hostname: str | None) -> bool:
    """Return True if ``hostname`` resolves to a private/loopback/link-local
    /reserved IP, or is one of the well-known private hostnames.

    Used as the SSRF gate — ``allow_redirects=False`` + per-hop host check
    prevents a public URL from 302'ing into AWS metadata
    (``169.254.169.254``), private RFC1918 ranges (``10.0.0.0/8``,
    ``192.168.0.0/16``), IPv6 link-local (``fe80::/10``), or loopback.

    Returns ``False`` for ``None`` / empty / unresolvable hostnames — the
    caller decides whether unresolvable means safe (DNS error) or unsafe
    (typo). Falsy here = let the request proceed and fail naturally.
    """
    if not hostname:
        return False
    host = hostname.lower().strip("[]")  # strip IPv6 brackets if present
    if host in _PRIVATE_HOSTNAMES:
        return True
    # Try as a literal IP first — avoids needless DNS for IP literals.
    try:
        ip = ipaddress.ip_address(host)
        return _ip_is_private(ip)
    except ValueError:
        pass
    # Hostname → resolve to all addresses, reject if ANY hop is private.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False  # unresolvable: let it fail naturally downstream
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except (ValueError, IndexError):
            continue
        if _ip_is_private(ip):
            return True
    return False


def _ip_is_private(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


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
