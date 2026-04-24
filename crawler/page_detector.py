from __future__ import annotations

"""Intelligent page detection heuristics to identify pages needing JS rendering.

Before parsing HTML, check if page is likely a SPA shell or has critical metadata
missing. Conservative approach: when in doubt, recommend rendering.

Heuristics (O(1) checks, no parsing):
  - SPA shell: <10KB + module script or empty body
  - Small HTML: <20KB (conservative default: render)
  - Missing metadata: No critical meta tags → render
  - Static site: >20KB + rich metadata → skip render

Integration: Called in engine._fetch_html() before needs_js_rendering().
"""

import re


def should_render(html: str, url: str) -> tuple[bool, str]:
    """Check if page likely needs JS rendering via fast heuristics.

    Only triggers for clear SPA shell indicators. Falls back to needs_js_rendering()
    for general cases to avoid breaking existing behavior.

    Args:
        html: Raw HTML body
        url: Request URL (for context, currently unused)

    Returns:
        (should_render, reason) where reason describes the heuristic that fired
    """
    if not html:
        return False, "no_indicator"

    # Check 1: Obvious SPA shell (module script indicator)
    if re.search(r'<script\s+type=["\']?module["\']?', html, re.IGNORECASE):
        return True, "spa_shell"

    # Check 2: Very small HTML (< 5KB) with empty body → likely SPA shell
    html_size = len(html)
    if html_size < 5_000:
        body_content = _extract_body_text(html)
        if len(body_content) < 100:
            return True, "spa_shell"

    # Check 3: Large static pages with rich metadata → skip rendering
    if html_size >= 20_000 and _has_critical_metadata(html):
        return False, "static"

    # No clear indicator → let needs_js_rendering() decide
    return False, "no_indicator"


def _is_spa_shell(html: str) -> bool:
    """Detect SPA shell: small HTML with module script or empty body.

    Indicators:
      - <script type="module"> (Next.js, Vite, modern SPAs)
      - Very small body content (<100 chars of text)
    """
    # Check for module script
    if re.search(r'<script\s+type=["\']?module["\']?', html, re.IGNORECASE):
        return True

    # Check for empty or nearly-empty body
    body_content = _extract_body_text(html)
    if len(body_content) < 100:
        return True

    return False


def _has_critical_metadata(html: str) -> bool:
    """Check presence of critical meta tags.

    Critical tags (need at least 3 of 5):
      - og:title, og:description, og:image
      - twitter:card
      - name="description" or name="og:description"
    """
    critical_tags = [
        r'property=["\']og:title["\']',
        r'property=["\']og:description["\']',
        r'property=["\']og:image["\']',
        r'property=["\']twitter:card["\']',
        r'name=["\']description["\']',
    ]

    found_count = sum(
        1 for pattern in critical_tags if re.search(pattern, html, re.IGNORECASE)
    )

    # Need at least 3 of the critical tags
    return found_count >= 3


def _extract_body_text(html: str) -> str:
    """Extract and dedupe body content, return text-only version."""
    # Simple regex body extraction (avoid parsing cost)
    body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.DOTALL | re.IGNORECASE)
    body_html = body_match.group(1) if body_match else html

    # Strip HTML tags, collapse whitespace
    text = re.sub(r"<[^>]+>", "", body_html)
    text = re.sub(r"\s+", " ", text).strip()

    return text
