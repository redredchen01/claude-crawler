"""Page type detection — classify pages as detail, list, tag, or other."""

import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup


# Structured-data types that indicate a detail page (single primary entity).
# These are the schema.org @type values that SEO-optimized content sites
# emit on item pages.
_JSONLD_DETAIL_TYPES = frozenset({
    "VideoObject", "Movie", "TVEpisode", "MusicRecording",
    "Article", "NewsArticle", "BlogPosting", "Product", "Recipe",
    "CreativeWork",
})


_LISTING_PATH_RE = re.compile(
    r"/(updates|list|search|archive|archives|category|categories|"
    r"channel|channels|tag|tags|theme|themes|hot|new|recent|trending|"
    r"popular|latest|page/\d+|browse|index|feed|feeds)"
    r"(?!/(?:item|view|watch|detail|article|post|video)/[a-z0-9-]+)/?",
    re.I,
)
# Thumbnail count that tips a page into "list" unconditionally. Detail
# pages with related-posts sidebars top out around 6–10; 12+ is a grid.
_LIST_STRONG_THRESHOLD = 12
# When the URL already looks like a listing, a lower thumbnail count
# still justifies "list".
_LIST_LISTING_URL_THRESHOLD = 6


def _jsonld_has_detail_entity(blocks: list) -> bool:
    """True when any JSON-LD block declares a single-item @type."""
    for item in blocks:
        if not isinstance(item, dict):
            continue
        t = item.get("@type")
        if isinstance(t, str) and t in _JSONLD_DETAIL_TYPES:
            return True
        if isinstance(t, list) and any(x in _JSONLD_DETAIL_TYPES for x in t if isinstance(x, str)):
            return True
    return False


def _heading_hierarchy_signal(soup: BeautifulSoup) -> str | None:
    """Infer page type from heading structure.

    Detail pages: single h1 + few h2/h3 + reasonable body
    List pages: many h2+ headings (card titles) or no h1
    Returns: 'detail', 'list', or None if inconclusive.

    Thresholds from Unit 3.5 threshold discovery (Set A — conservative):
    h1_max=1, h2_max=3, body_min=500, h2_list_min=8, h1_list_min=2.
    """
    h1_count = len(soup.find_all("h1"))
    h2_plus_count = len(soup.find_all(["h2", "h3", "h4"]))
    body_text = soup.get_text(strip=True)
    body_length = len(body_text)

    # Thresholds from Unit 3.5 threshold discovery (Set A)
    HEADING_DETAIL_H1_MAX = 1
    HEADING_DETAIL_H2_MAX = 3
    HEADING_DETAIL_BODY_MIN = 500
    HEADING_LIST_H2_MIN = 8
    HEADING_LIST_H1_MIN = 2

    # No h1 at all → unclear, likely list or missing structure
    if h1_count == 0:
        return "list" if h2_plus_count > 5 else None

    # Single h1 + sparse h2+ + reasonable body → detail
    if h1_count <= HEADING_DETAIL_H1_MAX and h2_plus_count <= HEADING_DETAIL_H2_MAX and body_length > HEADING_DETAIL_BODY_MIN:
        return "detail"

    # Many h2+ relative to h1 → likely list grid with h2 card titles
    if h2_plus_count >= HEADING_LIST_H2_MIN:
        return "list"

    # Multiple h1 (unusual) → list-like
    if h1_count >= HEADING_LIST_H1_MIN:
        return "list"

    return None


def _detect_page_type(html: str, url: str, soup: BeautifulSoup) -> str:
    """Determine page type from URL and HTML structure."""
    # Lazy imports to avoid circular dependency with parser_main and structured_data
    from crawler.parser_legacy import _is_link_card, _parse_jsonld_blocks, _extract_meta

    path = urlparse(url).path.strip("/")
    is_root = not path  # homepage / index

    # Tag pages — check before detail patterns
    if "/tag/" in url or "/tags/" in url:
        return "tag"

    # Detail page URL patterns — most reliable signal
    # Covers: /detail/, /video/, /article/, /post/, /novel/, /chapter/, etc.
    detail_patterns = [
        "/detail/", "/video/", "/article/", "/post/", "/chapter/",
        "/novel/", "/story/", "/item/", "/view/", "/watch/"
    ]
    if any(p in url for p in detail_patterns) and not is_root:
        return "detail"

    # Repeated-card counts, computed once and reused by all signals below.
    articles = soup.select("article")
    dotcards = soup.select("div.card, .card")
    link_cards = [a for a in soup.select("a[href]") if _is_link_card(a)]
    max_cards = max(len(articles), len(dotcards), len(link_cards))

    # Listing URLs expose themselves by path segment (homepage, /updates/,
    # /search/, /category/, /tag/, etc.). Kissavs's /av/updates/ and every
    # Wordpress archive look like this.
    is_listing_path = is_root or bool(_LISTING_PATH_RE.search(path))

    # Listing-shaped URL + enough thumbnails → list. URL path is the
    # strongest cross-site listing signal (homepage, /updates/, /search/,
    # etc.) so this runs FIRST to catch pages where JSON-LD describes
    # the first carousel item rather than the page itself (Plan 005).
    if is_listing_path and max_cards >= _LIST_LISTING_URL_THRESHOLD:
        return "list"

    # JSON-LD VideoObject/Article/etc. — detail pages with a
    # related-videos sidebar would otherwise get mis-classified by the
    # strong-list threshold below, so JSON-LD wins next for non-listing
    # URLs. A real detail page authoritatively declares itself via
    # schema.org even if the page template includes a carousel.
    jsonld_blocks = _parse_jsonld_blocks(soup)
    if not is_root and _jsonld_has_detail_entity(jsonld_blocks):
        return "detail"

    # Strong list signal — many repeated thumbnails on a non-listing URL
    # without JSON-LD. Detail pages with a "related posts" sidebar top
    # out around 6-10 thumbnails; 12+ is almost certainly a grid.
    if max_cards >= _LIST_STRONG_THRESHOLD:
        return "list"

    main_block = (
        soup.select_one("article")
        or soup.select_one("main")
        or soup.select_one(".post")
        or soup.select_one('section[class*="video"], section[class*="article"], section[class*="post"], section[class*="detail"], section[class*="content"]')
    )
    if main_block and not is_root:
        og_title = _extract_meta(soup, "og:title")
        h1 = soup.find("h1")
        has_meta = bool(og_title or h1 or soup.find("time"))
        if has_meta:
            # Disambiguate: if the URL looks like a specific item (has numeric ID or slug),
            # it's more likely a detail page even if it also has list-like elements
            segments = path.split("/")
            has_item_id = any(seg.isdigit() for seg in segments)
            if has_item_id:
                return "detail"
            # Without numeric ID, need stronger signals to distinguish from index pages
            if h1 and og_title:
                return "detail"
            # <article> with <h1> is a strong detail signal
            if soup.select_one("article") and h1:
                return "detail"

    # Moderate list signals — used after detail detection fails.
    if len(articles) > 3 or len(dotcards) > 3:
        return "list"
    if len(link_cards) > 5:
        return "list"

    # Heading hierarchy heuristic (Unit 4) — last resort before "other"
    hierarchy_signal = _heading_hierarchy_signal(soup)
    if hierarchy_signal is not None:
        return hierarchy_signal

    return "other"
