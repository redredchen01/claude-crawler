"""Tag, metric, image, date, and title extraction from HTML DOM.

This module contains helper functions for extracting structured signals from HTML:
- Tag scoring: multi-signal detection (class, href path, rel=tag, keyword stuffing gate)
- Metrics: scoped extraction with multiplier support (K, M, B, 万, 千, 亿)
- Images: srcset parsing, lazy-load attribute detection, quality filtering
- Dates: ISO 8601, slash-separated, CJK formats, time tag extraction
- Titles: site suffix stripping, weak title rescue from siblings

All functions operate on BeautifulSoup DOM elements. No external APIs.
"""

import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from bs4.element import Tag as BsTag

from crawler.models import ParseResult, Resource

# Tag-cloud detection threshold for the no-container fallback path. Real
# articles rarely tag past this; exceeding it strongly suggests a sidebar
# /footer site-wide tag widget (the 51cg1.com bug pattern).
_FALLBACK_TAG_CLOUD_CAP = 30

# --- Multi-signal tag scoring ---------------------------------------------
#
# Tag detection used to rely on `rel="tag"` + `[class*="tag"]` fallback,
# which missed sites whose containers didn't carry a "tag" class and
# conflated category/theme links with real tags. The scoring below treats
# each candidate <a> as a weighted sum of independent signals — href
# shape, semantic attrs, container class, text length — so cross-site
# generalization doesn't depend on any single selector.

# href path patterns (word-boundary segments)
_TAG_PATH_RE = re.compile(r"/(tag|tags|label|keyword|topic)/", re.I)
_CATEGORY_PATH_RE = re.compile(
    r"/(theme|category|categories|channel|cat|section)/", re.I
)
# Percent-encoded non-ASCII byte in href (e.g. Chinese tag slugs)
_PERCENT_CJK_RE = re.compile(r"%[89A-F][0-9A-F]", re.I)
# Class-name tokens that indicate a tag-ish element (whole-word match over
# space-separated class list)
_TAG_CLASS_RE = re.compile(r"\b(tag|tags|label|keyword|topic)\b", re.I)
# Class-name tokens that indicate a category/theme/channel link
_CATEGORY_CLASS_RE = re.compile(r"\b(cat|category|channel|section|theme)\b", re.I)

_TAG_SCORE_THRESHOLD = 3
_TAG_TEXT_MIN = 1
_TAG_TEXT_MAX = 20

# --- Metric extraction ----------------------------------------------------
#
# Numbers next to "views"/"likes"/"hearts" come back wrong on real sites
# because the old impl scanned the whole document, ignored unit suffixes,
# and happily picked copyright years. The new impl: container-scoped,
# multiplier-aware (K/M/B + CJK 万/千/亿), and year-guarded.

# Captures plain ints (1234), grouped (1,234 / 1 234), or decimals (12.3).
# The number group is followed (optionally) by a multiplier suffix.
_METRIC_NUM_RE = re.compile(
    r"(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*([kKmMbB万千亿]?)"
)

# Multiplier suffix → integer multiplier. Unknown suffix = 1.
_METRIC_MULTIPLIERS = {
    "k": 1_000, "K": 1_000,
    "m": 1_000_000, "M": 1_000_000,
    "b": 1_000_000_000, "B": 1_000_000_000,
    "千": 1_000,
    "万": 10_000,
    "亿": 100_000_000,
}

# When a metric candidate's parent text contains any of these markers, a
# bare 4-digit number in 1900..2099 range is treated as a year, not a
# metric — protects against `<footer>views: 0 © 2010</footer>` returning
# 2010, and against scraping "founded in 2008" near a "view source" link.
_METRIC_YEAR_CONTEXT_RE = re.compile(
    r"©|copyright|since|founded|版权|创建于|建立于|成立于", re.I,
)

# --- Cover image picker ---------------------------------------------------
#
# `container.find("img")` used to return the first <img> in the article,
# which is often a tracking pixel, social-share icon, or decorative
# header. The picker below: walks lazy-load attrs in priority order,
# rejects data: URIs, filters obvious icon/logo URL patterns, drops
# tiny declared dimensions, and prefers the largest qualifying image.

# Lazy-load + srcset priority lives next to `_resolve_img_src` further
# down — see _LAZY_OVERRIDE_ATTRS / _parse_srcset for the actual order.

# URL-pattern blocklist for non-cover images: site logos, user avatars,
# decorative spacers, generic placeholders. The token must sit at a path-
# segment boundary (between `/` `_` `-` `.` and one of the same), so:
#   - "/static/site-logo.png"     → filtered (logo bounded by - and .)
#   - "/avatars/u123.jpg"         → filtered (avatars bounded by /)
#   - "/uploads/iconic-art.jpg"   → kept (icon embedded in iconic, no boundary)
#   - "/cover-icon-set.jpg"       → kept (icon embedded in icon-set isn't
#                                          itself isolated; same on -set side)
# Removed `pixel` and `blank` from the list — they appear in legitimate
# cover slugs (pixel art, blank-canvas studios) more often than as
# tracking/decoration.
_ICON_URL_BOUNDARY = r"(?:^|[/._-])"
_ICON_URL_RE = re.compile(
    rf"{_ICON_URL_BOUNDARY}(logos?|icons?|avatars?|spacer|placeholder)"
    rf"(?=[/._-]|$)",
    re.I,
)

# Below this dimension, a declared <img width/height> is treated as a
# decorative element (favicon, social-share icon, ratings star). Real
# article covers virtually always exceed this on at least one axis.
_MIN_COVER_DIMENSION = 50

# --- Published date extraction --------------------------------------------
#
# The previous fallback regex `\d{4}[-/]\d{2}[-/]\d{2}` ran over the
# entire `soup.get_text()` — so copyright footers ("© 2010") and stray
# date strings were happily attributed as the article's publish date.
# Plus CJK formats like "2025年3月15日" weren't recognised at all. The
# helper below: container-scoped fallback, supports CJK + slash + ISO,
# normalises everything to `YYYY-MM-DD`.

# `\b` after the day digit fails on shapes like `2025-03-15Tabc` because
# `T` is a word char on both sides; using a negative-lookbehind-free guard
# (no trailing boundary, plus the `\d{1,2}` upper limit on day) keeps the
# match safe — invalid triples get caught by _normalize_date_triple.
_DATE_ISO_RE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})(?:T[\d:.+\-Z]*)?")
_DATE_SLASH_RE = re.compile(r"\b(\d{4})/(\d{1,2})/(\d{1,2})\b")
_DATE_CJK_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?")


def _class_tokens(el: BsTag) -> str:
    """Return the element's class list joined with spaces (empty if none)."""
    classes = el.get("class")
    if not classes:
        return ""
    if isinstance(classes, str):
        return classes
    return " ".join(classes)


def _score_tag_candidate(a: BsTag) -> tuple[int, bool]:
    """Score an <a> as a tag candidate. Returns (score, is_category).

    ``is_category`` short-circuits tag membership: callers use it both to
    exclude the link from the tag list *and* to harvest a category signal
    for ``Resource.category``.
    """
    text = _clean_text(a.get_text(" ", strip=True))
    text_len = len(text)
    if text_len < _TAG_TEXT_MIN or text_len > _TAG_TEXT_MAX:
        # Disqualify: empty, whitespace-only, or paragraph-length anchors
        # are never tags regardless of other signals.
        return (0, False)

    href = a.get("href", "") or ""
    own_classes = _class_tokens(a)

    # Category short-circuit — href path or own class marks this as a
    # category/theme link (not a tag). Only the <a>'s own class counts
    # here; ancestor "tag" containers can legitimately hold a category
    # link next to tags (the example site puts class="cat" inside
    # <h3 class="tags">).
    is_category = bool(
        _CATEGORY_PATH_RE.search(href)
        or _CATEGORY_CLASS_RE.search(own_classes)
    )
    if is_category:
        return (0, True)

    score = 0

    # S1: href contains a tag path segment (strong)
    if _TAG_PATH_RE.search(href):
        score += 3

    # S2: semantic rel="tag" (strong)
    rel = a.get("rel")
    if rel:
        rel_str = " ".join(rel) if isinstance(rel, list) else str(rel)
        if "tag" in rel_str.lower().split():
            score += 3

    # S3: percent-encoded non-ASCII in href (CJK tag slugs)
    if _PERCENT_CJK_RE.search(href):
        score += 1

    # S4: own or ancestor class matches a tag-ish token
    ancestor_classes = own_classes
    for parent in a.parents:
        if not isinstance(parent, BsTag):
            continue
        parent_classes = _class_tokens(parent)
        if parent_classes:
            ancestor_classes = f"{ancestor_classes} {parent_classes}"
    if _TAG_CLASS_RE.search(ancestor_classes):
        score += 2

    # S5: text in the plausible tag length range (already gated above)
    score += 1

    return (score, False)


def _extract_tags_and_category(scope: BsTag) -> tuple[list[str], str]:
    """Walk ``scope`` scoring each <a> and return (tags, detected_category).

    ``tags`` preserves document order and is de-duplicated. ``detected_category``
    is the text of the first is_category anchor encountered (empty if none).
    """
    tags: list[str] = []
    detected_category = ""
    for a in scope.find_all("a"):
        score, is_category = _score_tag_candidate(a)
        if is_category:
            if not detected_category:
                detected_category = _clean_text(a.get_text(" ", strip=True))
            continue
        if score < _TAG_SCORE_THRESHOLD:
            continue
        text = _clean_text(a.get_text(" ", strip=True))
        if text and text != "+" and text not in tags:
            tags.append(text)
    return tags, detected_category


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _clean_text(text: str) -> str:
    """Strip whitespace and normalize."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


# Hrefs that are not real resource URLs — used to filter image-link
# card candidates so UI chrome (<a href="javascript:..."> login buttons
# with avatar images, anchor-only links) doesn't pollute the card list.
_NON_RESOURCE_HREF_PREFIXES = ("javascript:", "#", "mailto:", "tel:")


def _is_link_card(a: BsTag) -> bool:
    """True when an <a> looks like a card thumbnail: real resource href,
    nested <img>, and at least one content signal (visible text, img
    alt, or img title). Pure icon <a> tags (pagination arrows, chrome
    with empty alt) are rejected."""
    img = a.find("img")
    if img is None:
        return False
    href = a.get("href", "") or ""
    if not href or href.startswith(_NON_RESOURCE_HREF_PREFIXES):
        return False
    if a.get_text(strip=True):
        return True
    if (img.get("alt") or "").strip():
        return True
    if (img.get("title") or "").strip():
        return True
    return False


# Thumbnail title is "weak" (probably a badge, not the real title) when
# it's too short to be meaningful or matches the duration pattern. In
# either case the list-card extractor looks for a better title via
# same-URL sibling or img[alt].
_WEAK_TITLE_MAX_LEN = 6


# URL path segments that identify a listing page. Used by
# `_detect_page_type` so that a listing URL with a moderate number of
# thumbnails classifies as "list" even when it also carries og:title +
# h1 (which listing pages normally do for SEO).
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


# Duration strings like "2:06:24" / "12:05" / "0:58" that card thumbnails
# overlay on top of the poster image. Used to detect when a list-card's
# derived title is actually just a duration badge and needs rescuing
# from a sibling link in the detail block.
_DURATION_RE = re.compile(r"^\d{1,2}(?::\d{2}){1,2}$")


def _rescue_title_from_siblings(thumb_a: BsTag, target_url: str, base_url: str) -> str:
    """Find a non-duration title link pointing at ``target_url``.

    Walks up from ``thumb_a`` looking for a different <a href=...> that
    resolves to the same URL as the thumbnail but carries substantive
    text (not another duration badge). Returns "" if no such sibling is
    reachable within 5 parent levels.
    """
    current = thumb_a
    for _ in range(5):
        parent = current.parent
        if parent is None or parent.name == "body":
            break
        for other in parent.find_all("a", href=True):
            if other is thumb_a:
                continue
            other_href = other.get("href", "") or ""
            if not other_href:
                continue
            if urljoin(base_url, other_href) != target_url:
                continue
            text = _clean_text(other.get_text(" ", strip=True))
            if text and not _DURATION_RE.fullmatch(text):
                return text
        current = parent
    return ""


# Pipe-only chain for og:title — `|｜` are the SEO-chain separators used
# by virtually every CMS ("Item｜Section｜Brand"). Hyphens are kept out of
# this set because they're legitimately embedded in product codes
# (`GRACE-029`) and article slugs.
_TITLE_PIPE_CHAIN_RE = re.compile(r"\s*[|｜]\s*")
# Broader set for the <title> fallback, where the suffix may use a dash
# ("Item - Site"). Used with maxsplit=1 so a dashed product code in the
# middle of the title doesn't get split.
_TITLE_FALLBACK_SEP_RE = re.compile(r"\s*[|｜\-–—]\s*")


def _strip_title_site_suffix(raw: str, *, require_chain: bool) -> str:
    """Return the leading segment of a "Title | Site" style string.

    ``require_chain=True`` (og:title path): strip only when the title has
    2+ pipe separators — the SEO-chain signature ``Item｜Section｜Brand``.
    Single-pipe and dash-only titles are left intact to protect legit
    punctuation (product codes like ``GRACE-029``).

    ``require_chain=False`` (``<title>`` fallback): split on the first
    separator (pipe or dash) and keep the leading segment.
    """
    if not raw:
        return ""
    if require_chain:
        parts = _TITLE_PIPE_CHAIN_RE.split(raw)
        if len(parts) < 3:
            return _clean_text(raw)
        return _clean_text(parts[0])
    return _clean_text(
        _TITLE_FALLBACK_SEP_RE.split(raw, maxsplit=1)[0]
    )


def _parse_jsonld_blocks(soup: BeautifulSoup) -> list:
    """Return every JSON-LD payload on the page as Python objects.

    Skips blocks that fail to parse so one malformed script doesn't
    blind the whole extraction path. Flattens ``@graph`` arrays so
    callers can iterate entities uniformly regardless of whether the
    site wraps them.
    """
    blocks: list = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, list):
            blocks.extend(data)
        else:
            blocks.append(data)
    flattened: list = []
    for item in blocks:
        if isinstance(item, dict) and "@graph" in item and isinstance(item["@graph"], list):
            flattened.extend(item["@graph"])
        else:
            flattened.append(item)
    return flattened


# Structured-data types that indicate a detail page (single primary entity).
# These are the schema.org @type values that SEO-optimized content sites
# emit on item pages.
_JSONLD_DETAIL_TYPES = frozenset({
    "VideoObject", "Movie", "TVEpisode", "MusicRecording",
    "Article", "NewsArticle", "BlogPosting", "Product", "Recipe",
    "CreativeWork",
})


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


# Map InteractionCounter.interactionType.@type to our Resource metric field.
# schema.org uses WatchAction for plays/views, LikeAction for likes,
# FavoriteAction or BookmarkAction for bookmark/heart counts.
_INTERACTION_TYPE_MAP = {
    "WatchAction": "views",
    "ViewAction": "views",
    "ReadAction": "views",
    "LikeAction": "likes",
    "AgreeAction": "likes",
    "FavoriteAction": "hearts",
    "BookmarkAction": "hearts",
}


def _extract_jsonld_metrics(blocks: list) -> dict:
    """Harvest view/like/heart counts from JSON-LD InteractionCounter entries.

    Returns a dict with any of ``views``, ``likes``, ``hearts`` keys that
    were found; missing keys mean "JSON-LD didn't carry this metric" and
    callers should fall back to DOM heuristics.
    """
    metrics: dict = {}
    for item in blocks:
        if not isinstance(item, dict):
            continue
        stats = item.get("interactionStatistic")
        if stats is None:
            continue
        if isinstance(stats, dict):
            stats = [stats]
        if not isinstance(stats, list):
            continue
        for counter in stats:
            if not isinstance(counter, dict):
                continue
            itype = counter.get("interactionType")
            # schema.org allows either a string or an {@type: ...} nested obj
            type_name = ""
            if isinstance(itype, dict):
                type_name = itype.get("@type", "") or ""
            elif isinstance(itype, str):
                # Some sites write the URL form "http://schema.org/WatchAction"
                type_name = itype.rsplit("/", 1)[-1]
            metric_key = _INTERACTION_TYPE_MAP.get(type_name)
            if not metric_key or metric_key in metrics:
                continue
            count = counter.get("userInteractionCount")
            try:
                metrics[metric_key] = int(count)
            except (TypeError, ValueError):
                continue
    return metrics


def _extract_meta(soup: BeautifulSoup, property_name: str) -> str:
    """Get meta content by property or name attribute."""
    tag = soup.find("meta", attrs={"property": property_name})
    if tag and tag.get("content"):
        return tag["content"].strip()
    tag = soup.find("meta", attrs={"name": property_name})
    if tag and tag.get("content"):
        return tag["content"].strip()
    return ""


def _extract_text(soup: BeautifulSoup, selectors: list[str]) -> str:
    """Try multiple CSS selectors, return first non-empty text."""
    for sel in selectors:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return _clean_text(el.get_text(strip=True))
    return ""


def _parse_metric_number(text: str, *, year_guard: bool) -> int | None:
    """Find the first number-with-optional-multiplier match in ``text``.

    Returns the resolved integer, or ``None`` if no usable number was
    found. ``year_guard`` skips bare 4-digit values in 1900..2099 (which
    are far more likely to be years than metrics).
    """
    for m in _METRIC_NUM_RE.finditer(text):
        raw, suffix = m.group(1), m.group(2)
        cleaned = raw.replace(",", "").replace(" ", "")
        try:
            value = float(cleaned)
        except ValueError:
            continue
        multiplier = _METRIC_MULTIPLIERS.get(suffix, 1)
        # Year guard: bare 4-digit int with no multiplier and no decimal,
        # in plausible-year range, and parent context flagged as footer-
        # like. Treat as year noise — try the next match.
        if (
            year_guard and not suffix and "." not in cleaned
            and len(cleaned) == 4 and 1900 <= int(cleaned) <= 2099
        ):
            continue
        return int(value * multiplier)
    return None


# Cap on `parent.next_siblings` traversal — beyond a few inline siblings
# we're pulling text from arbitrary downstream nodes, which produces noise
# (a card's "Trending" section ranks above the article's actual metric).
_METRIC_SIBLING_CAP = 3


def _extract_metric(scope: BsTag, keywords: list[str]) -> int:
    """Find a metric value near any of ``keywords`` inside ``scope``.

    Recognises K / M / B and CJK 千 / 万 / 亿 suffixes. Skips 4-digit year
    candidates when the parent context looks like a copyright/footer
    (``©``, ``copyright``, ``founded``, ``版权``, etc.). Caller chooses
    the scope (article container in detail pages, card in list pages) —
    this function never walks past it.

    The keyword *anchors* the search: only digits appearing AFTER the
    keyword inside the parent text are considered. This stops the
    "<span>views 1234 likes 5678</span>" collision where every metric
    keyword used to return the same first number.

    Returns ``0`` when nothing matched, preserving the prior "no metric =
    zero" contract.
    """
    for kw in keywords:
        kw_re = re.compile(re.escape(kw), re.I)
        for el in scope.find_all(string=kw_re):
            parent = el.parent
            if parent is None:
                continue
            # Skip matches inside <script>/<style> — those NavigableStrings
            # are code/CSS, not user-visible text, and their get_text() is
            # huge so any stray digit will mis-fire (kissavs shipped
            # `hearts=1` from a JS string containing "heart").
            if parent.name in ("script", "style") or any(
                a.name in ("script", "style") for a in parent.parents
            ):
                continue
            parent_text = parent.get_text(" ", strip=True)
            parent_year_guard = bool(_METRIC_YEAR_CONTEXT_RE.search(parent_text))
            # Slice parent_text around the keyword's position — the
            # keyword anchor is otherwise discarded by get_text(), letting
            # adjacent "likes 5678" leak into "views" extraction when both
            # share a parent. Search "after keyword" first (canonical
            # `views 1234` shape), then "before keyword" (`12.3K views`
            # shape with the number on the left).
            kw_match = kw_re.search(parent_text)
            if kw_match:
                after_kw = parent_text[kw_match.end():]
                before_kw = parent_text[:kw_match.start()]
                slices = (after_kw, before_kw)
            else:
                slices = (parent_text,)
            for chunk in slices:
                value = _parse_metric_number(chunk, year_guard=parent_year_guard)
                if value is not None:
                    return value
            sibling_count = 0
            for sib in parent.next_siblings:
                if sibling_count >= _METRIC_SIBLING_CAP:
                    break
                sib_text = (
                    sib.get_text(" ", strip=True)
                    if hasattr(sib, "get_text")
                    else str(sib).strip()
                )
                if not sib_text:
                    continue
                sibling_count += 1
                # Recompute year_guard per sibling — a sibling whose own
                # text declares a copyright must trip the guard even if
                # the keyword's parent didn't (Adversarial F2).
                sib_year_guard = parent_year_guard or bool(
                    _METRIC_YEAR_CONTEXT_RE.search(sib_text)
                )
                value = _parse_metric_number(sib_text, year_guard=sib_year_guard)
                if value is not None:
                    return value
    return 0


# ---------------------------------------------------------------------------
# Structured-data extraction (Plan 005)
# ---------------------------------------------------------------------------
# Four source extractors produce a unified field dict with omit-from-dict
# semantics: a field missing from the returned dict means "this source
# didn't have that field" (distinct from present-but-empty-string which
# would mean "source said empty"). `_extract_structured` merges the four
# source dicts by priority (JSON-LD > OG > Twitter > microdata) via a
# pure `_merge_by_priority` helper that can be unit-tested without BS4.
#
# Each source returns the same unified keys: title, cover_url, views,
# likes, hearts, tags, category, published_at, description. `description`
# is a special case — it's never assigned to a Resource field (Scope
# line 58, Q2), but propagates through the chain to raw_data.


# Image URL paths whose basename or stem contains any of these
# substrings are almost certainly site-level logos / default covers /
# placeholder avatars, not per-item images. Used by OG / Twitter /
# microdata / JSON-LD extractors to reject `og:image` / `image`
# fallback values that would otherwise give every Resource in a scan
# the same generic cover. Adversarial F7. Substring match (case-
# insensitive) across the path — accepts some false positives (e.g. a
# blog post URL containing "logo") as a tradeoff for covering all the
# real placeholder naming conventions.
_PLACEHOLDER_URL_SUBSTRINGS = (
    "logo", "default", "placeholder", "avatar",
    "noimage", "no-image", "no_image",
    "siteicon", "site-icon", "site_icon",
    "missing",
)

# SEO stuffing guards for tags from JSON-LD `keywords` and friends —
# see adversarial F2. Overriding DOM's multi-signal scorer with 20+
# generic SEO keywords is strictly worse than keeping DOM tags.
_SEO_STUFFING_COUNT_THRESHOLD = 15
_SEO_STUFFING_MIN_AVG_LEN = 2

# Separators used by JSON-LD/OG/microdata when `keywords` / `article:tag`
# arrives as a single delimited string rather than a list.
_TAG_KEYWORD_SPLIT_RE = re.compile(r"[,，、;；]+")


def _meta_or_none(soup: BeautifulSoup, property_name: str) -> str | None:
    """Like `_extract_meta` but returns `None` when missing/empty so
    source extractors can use dict omission to mean 'source didn't
    provide'. Preserves the distinction from 'source provided empty'.
    """
    val = _extract_meta(soup, property_name)
    return val if val else None


def _valid_cover_url(url: str) -> bool:
    """Accept as cover_url when it has a protocol AND its path does not
    look like a site-level placeholder (logo, default, etc.)."""
    if not url:
        return False
    if "://" not in url and not url.startswith("//"):
        return False
    path = urlparse(url).path.lower()
    return not any(s in path for s in _PLACEHOLDER_URL_SUBSTRINGS)


def _parse_tags_keywords(value) -> list[str]:
    """Normalize the many shapes JSON-LD/OG put tags in:
    list[str] | comma/CJK-delimited str → list[str] (trimmed, deduped,
    order preserved). Empty input → empty list."""
    if value is None:
        return []
    if isinstance(value, list):
        candidates = [str(v).strip() for v in value if v is not None]
    elif isinstance(value, str):
        candidates = [s.strip() for s in _TAG_KEYWORD_SPLIT_RE.split(value)]
    else:
        return []
    out: list[str] = []
    for c in candidates:
        if c and c not in out:
            out.append(c)
    return out


def _tags_pass_stuffing_gate(tags: list[str]) -> bool:
    """SEO-stuffing heuristic: JSON-LD `keywords` on SEO-heavy sites
    often ships 20+ generic terms; DOM's multi-signal scorer produces
    5-10 page-specific tags. Override with JSON-LD only when it looks
    like a curated list, not a keyword dump."""
    if not tags:
        return False
    if len(tags) > _SEO_STUFFING_COUNT_THRESHOLD:
        return False
    avg_len = sum(len(t) for t in tags) / len(tags)
    if avg_len < _SEO_STUFFING_MIN_AVG_LEN:
        return False
    return True


def _extract_opengraph(soup: BeautifulSoup) -> dict:
    """OpenGraph meta → unified field dict. Unhit fields omitted."""
    out: dict = {}

    title = _meta_or_none(soup, "og:title")
    if title is not None:
        out["title"] = _strip_title_site_suffix(title, require_chain=True)

    cover = _meta_or_none(soup, "og:image")
    if cover and _valid_cover_url(cover):
        out["cover_url"] = cover

    desc = _meta_or_none(soup, "og:description")
    if desc is not None:
        out["description"] = desc

    section = _meta_or_none(soup, "article:section")
    if section is not None:
        out["category"] = section

    published = _meta_or_none(soup, "article:published_time")
    if published is not None:
        out["published_at"] = published

    # article:tag can appear multiple times — order preserved, deduped
    tag_nodes = soup.find_all("meta", attrs={"property": "article:tag"})
    tags: list[str] = []
    for node in tag_nodes:
        t = (node.get("content") or "").strip()
        if t and t not in tags:
            tags.append(t)
    if tags and _tags_pass_stuffing_gate(tags):
        out["tags"] = tags

    return out


def _extract_twitter_cards(soup: BeautifulSoup) -> dict:
    """Twitter Card meta → unified field dict. Unhit fields omitted."""
    out: dict = {}

    title = _meta_or_none(soup, "twitter:title")
    if title is not None:
        out["title"] = _strip_title_site_suffix(title, require_chain=True)

    # Twitter's image comes under two property names historically
    cover = (
        _meta_or_none(soup, "twitter:image")
        or _meta_or_none(soup, "twitter:image:src")
    )
    if cover and _valid_cover_url(cover):
        out["cover_url"] = cover

    desc = _meta_or_none(soup, "twitter:description")
    if desc is not None:
        out["description"] = desc

    return out


def _microdata_itemprop_value(el: BsTag) -> str:
    """Extract the value from an itemprop-bearing element per the HTML
    microdata spec. Rules: <meta> uses content, <img|audio|video|source>
    uses src, <a|area|link> uses href, <time> uses datetime, others fall
    back to visible text."""
    name = el.name
    if name == "meta":
        return (el.get("content") or "").strip()
    if name in ("img", "audio", "video", "source", "embed", "iframe"):
        return (el.get("src") or "").strip()
    if name in ("a", "area", "link"):
        return (el.get("href") or "").strip()
    if name == "time":
        dt = el.get("datetime")
        if dt:
            return dt.strip()
    return _clean_text(el.get_text(" ", strip=True))


def _extract_microdata(soup: BeautifulSoup) -> dict:
    """schema.org microdata → unified field dict. Picks the largest
    top-level [itemscope][itemtype] block by text content (parallels
    `_pick_main_container`'s disambiguation rule for sibling blocks).
    Unhit fields omitted."""
    candidates = soup.select("[itemscope][itemtype]")
    if not candidates:
        return {}
    # Only top-level scopes (not nested) — sort by text length, keep
    # the largest so a small BreadcrumbList doesn't beat the main
    # Article.
    top_level = [c for c in candidates if not c.find_parent(attrs={"itemscope": True})]
    if not top_level:
        top_level = candidates
    scope = max(top_level, key=lambda el: len(el.get_text(strip=True)))

    # itemprop → unified field mapping
    # schema.org convention: name→title, image→cover_url, description,
    # articleSection/genre→category, datePublished/uploadDate→published_at,
    # keywords→tags.
    prop_map = {
        "name": "title",
        "headline": "title",
        "image": "cover_url",
        "thumbnailUrl": "cover_url",
        "description": "description",
        "articleSection": "category",
        "genre": "category",
        "datePublished": "published_at",
        "uploadDate": "published_at",
    }

    out: dict = {}
    keyword_value: str | list | None = None

    # First matching itemprop wins (consistent with schema.org spec)
    for el in scope.find_all(attrs={"itemprop": True}):
        # Skip properties nested inside a deeper itemscope (they belong
        # to the nested entity, not this one)
        parent_scope = el.find_parent(attrs={"itemscope": True})
        if parent_scope is not scope:
            continue
        prop = el.get("itemprop")
        if isinstance(prop, list):
            # schema.org allows space-separated multi-prop on one element
            props = prop
        else:
            props = (prop or "").split()

        value = _microdata_itemprop_value(el)
        if not value:
            continue

        for p in props:
            if p == "keywords" and keyword_value is None:
                keyword_value = value
                continue
            target = prop_map.get(p)
            if target is None:
                continue
            if target == "cover_url" and not _valid_cover_url(value):
                continue
            if target not in out:
                out[target] = value

    # keywords → tags list via shared normalization + stuffing gate
    if keyword_value is not None:
        tags = _parse_tags_keywords(keyword_value)
        if tags and _tags_pass_stuffing_gate(tags):
            out["tags"] = tags

    return out


def _jsonld_image_url(value) -> str | None:
    """Extract a URL from schema.org's varied `image`/`thumbnailUrl` shape:
    str | {url: str} | list[str|dict]."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        url = value.get("url")
        return url if isinstance(url, str) else None
    if isinstance(value, list):
        for item in value:
            u = _jsonld_image_url(item)
            if u:
                return u
    return None


def _jsonld_first_string(value) -> str | None:
    """Take a scalar or first-in-list string from a schema.org property."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for v in value:
            if isinstance(v, str) and v:
                return v
    return None


def _extract_jsonld(blocks: list) -> dict:
    """JSON-LD entity list → unified field dict. Picks the first entity
    whose @type is in `_JSONLD_DETAIL_TYPES`; for multiple matches,
    prefers the one with both a name and an image (most complete).
    Falls back to document order on ties.

    Input is the flattened entity list from `_parse_jsonld_blocks`;
    caller must run that first (keeps `_extract_jsonld` BS4-free so
    merge/priority tests don't need HTML fixtures)."""
    # Pick primary detail entity
    detail_entities = []
    for item in blocks:
        if not isinstance(item, dict):
            continue
        t = item.get("@type")
        types = t if isinstance(t, list) else [t] if isinstance(t, str) else []
        if any(tt in _JSONLD_DETAIL_TYPES for tt in types if isinstance(tt, str)):
            detail_entities.append(item)
    if not detail_entities:
        return {}
    # Completeness preference: has name AND image > only name > first
    primary = max(
        detail_entities,
        key=lambda e: (bool(e.get("name") or e.get("headline")) + bool(e.get("image"))),
    )

    out: dict = {}

    title = _jsonld_first_string(primary.get("name")) or _jsonld_first_string(
        primary.get("headline")
    )
    if title:
        out["title"] = _strip_title_site_suffix(title, require_chain=True)

    cover = _jsonld_image_url(primary.get("image")) or _jsonld_image_url(
        primary.get("thumbnailUrl")
    )
    if cover and _valid_cover_url(cover):
        out["cover_url"] = cover

    desc = _jsonld_first_string(primary.get("description"))
    if desc:
        out["description"] = desc

    category = _jsonld_first_string(
        primary.get("articleSection")
    ) or _jsonld_first_string(primary.get("genre"))
    if category:
        out["category"] = category

    published = _jsonld_first_string(
        primary.get("datePublished")
    ) or _jsonld_first_string(primary.get("uploadDate"))
    if published:
        out["published_at"] = published

    tags = _parse_tags_keywords(primary.get("keywords"))
    if tags and _tags_pass_stuffing_gate(tags):
        out["tags"] = tags

    # Metrics — delegates to the existing helper so any callers still
    # depending on that function behaviorally get the same numbers.
    metrics = _extract_jsonld_metrics(blocks)
    for k in ("views", "likes", "hearts"):
        if k in metrics:
            out[k] = metrics[k]

    return out


# ---------------------------------------------------------------------------
# Merge by priority (pure function — unit-testable without BS4)
# ---------------------------------------------------------------------------

def _is_valid_field(field: str, value) -> bool:
    """Whether `value` for `field` is acceptable to enter merged_fields.
    Invalid values fall through to the next priority source or DOM."""
    if field in ("views", "likes", "hearts"):
        # >= 0 (not > 0) — JSON-LD-declared 0 is a real signal
        # (Correctness #2 in parser.py). Reject string/float.
        return isinstance(value, int) and not isinstance(value, bool) and value >= 0
    if field == "cover_url":
        return isinstance(value, str) and _valid_cover_url(value)
    if field == "tags":
        return (
            isinstance(value, list)
            and len(value) > 0
            and all(isinstance(t, str) and t for t in value)
        )
    if field in ("title", "category", "published_at"):
        return isinstance(value, str) and 0 < len(value) < 500
    return False


def _merge_by_priority(
    source_outputs: list[tuple[str, dict]],
) -> tuple[dict, dict, str]:
    """Merge source extractor outputs by list order.

    `source_outputs` is `[(source_name, field_dict), ...]` in decreasing
    priority. Returns `(merged_fields, provenance, description_value)`.

    - `merged_fields` holds the first valid value per field
    - `provenance` maps each field that was hit to the winning source
      name; fields not in any source map to `PROVENANCE_MISSING`
    - `description_value` is the first valid (non-empty) description
      string across sources; never enters `merged_fields` or
      `provenance` (it's a raw_data sibling, not a tracked field)

    Pure Python — no BS4 dependency, so priority logic can be unit-
    tested with dict literals instead of HTML fixtures.
    """
    from crawler.raw_data import (
        PROVENANCE_MISSING,
        PROVENANCE_FIELDS,
    )

    merged: dict = {}
    provenance: dict = {}
    description_value = ""

    for source_name, fields in source_outputs:
        if not isinstance(fields, dict):
            continue
        for field, value in fields.items():
            if field == "description":
                if not description_value and isinstance(value, str) and value:
                    description_value = value
                continue
            if field not in PROVENANCE_FIELDS:
                continue  # defensive — ignore fields outside whitelist
            if field in merged:
                continue  # higher priority source already won
            if _is_valid_field(field, value):
                merged[field] = value
                provenance[field] = source_name

    # Fill in "missing" entries for any whitelist field never hit
    for field in PROVENANCE_FIELDS:
        provenance.setdefault(field, PROVENANCE_MISSING)

    return merged, provenance, description_value


def _extract_structured(soup: BeautifulSoup) -> tuple[dict, dict, str]:
    """Thin BS4-aware wrapper: run all four source extractors, feed
    their outputs into `_merge_by_priority`, return merged result.

    Priority order: JSON-LD > OpenGraph > Twitter Cards > microdata."""
    from crawler.raw_data import (
        PROVENANCE_JSONLD,
        PROVENANCE_OG,
        PROVENANCE_TWITTER,
        PROVENANCE_MICRODATA,
    )

    blocks = _parse_jsonld_blocks(soup)
    source_outputs = [
        (PROVENANCE_JSONLD, _extract_jsonld(blocks)),
        (PROVENANCE_OG, _extract_opengraph(soup)),
        (PROVENANCE_TWITTER, _extract_twitter_cards(soup)),
        (PROVENANCE_MICRODATA, _extract_microdata(soup)),
    ]
    return _merge_by_priority(source_outputs)


# ---------------------------------------------------------------------------
# Page-type detection
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Resource extraction — detail page
# ---------------------------------------------------------------------------

def _pick_main_container(soup: BeautifulSoup):
    """Pick the element most likely to hold the article's real content.

    The naïve `select_one("article")` returned the *first* article in
    document order. That breaks two real cases:

      1. Detail pages with a "Related articles" sidebar block before the
         main content → the decoy article gets picked, and its tags +
         cover image pollute the result.
      2. List pages misclassified as detail (e.g. one card above the
         fold) → the first card's metadata is attributed to the list URL.

    Selection priority:

      1. ``article[itemprop="mainContentOfPage"]`` — Schema.org's explicit
         "this is the main content" signal. Strongest, used by CMS
         themes that care.
      2. ``main article`` — article nested inside <main> is the real
         content; siblings of <main> are typically nav/sidebar/related.
      3. Largest ``<article>`` by text length when 2+ articles exist
         without a structural signal — filters out small "Related"
         entries which are typically <50 chars vs the real body's
         hundreds-to-thousands.
      4. First ``<article>`` (back-compat with the single-article case).
      5. ``<main>`` as a last resort.

    Returns the chosen tag, or ``None`` if neither <article> nor <main>
    is present.
    """
    itemprop_match = soup.select_one('article[itemprop="mainContentOfPage"]')
    if itemprop_match is not None:
        return itemprop_match

    main_article = soup.select_one("main article")
    if main_article is not None:
        return main_article

    articles = soup.find_all("article")
    if len(articles) >= 2:
        return max(articles, key=lambda a: len(a.get_text(strip=True)))
    if articles:
        return articles[0]

    main = soup.select_one("main")
    if main is not None:
        return main

    # Last-resort fallback for sites that use <section> as their content
    # container (kissavs uses <section class="video-info">). Pick the
    # largest matching section by text length so a small meta <section>
    # doesn't beat the real body.
    candidates = soup.select(
        'section[class*="video"], section[class*="article"], '
        'section[class*="post"], section[class*="detail"], '
        'section[class*="content"]'
    )
    if candidates:
        return max(candidates, key=lambda s: len(s.get_text(strip=True)))
    return None


def _parse_srcset(srcset: str) -> str:
    """Pick the largest URL from an HTML5 ``srcset`` attribute.

    Recognises both width descriptors (``url 1024w``) and density
    descriptors (``url 2x``). Negative or zero descriptors are skipped.
    When all entries lack a parseable descriptor, the first URL wins.
    """
    best_url = ""
    best_score = 0  # 0 means "no descriptor seen" — first valid entry wins
    for entry in srcset.split(","):
        parts = entry.strip().split()
        if not parts:
            continue
        url_part = parts[0]
        score = 0
        if len(parts) >= 2:
            desc = parts[1]
            if desc.endswith("w"):
                try:
                    w = int(desc[:-1])
                    if w > 0:
                        score = w
                except ValueError:
                    pass
            elif desc.endswith("x"):
                try:
                    # Density descriptors compare ordinally against each
                    # other; map to a notional pixel-width by multiplying.
                    x = float(desc[:-1])
                    if x > 0:
                        score = int(x * 1000)
                except ValueError:
                    pass
        # First non-empty URL wins when no descriptor seen anywhere; later
        # entries with a real (positive) descriptor overtake.
        if not best_url:
            best_url = url_part
            best_score = score
        elif score > best_score:
            best_url = url_part
            best_score = score
    return best_url


# Explicit lazy-load attrs that always override `src` (which is usually
# the placeholder when these are present).
_LAZY_OVERRIDE_ATTRS = ("data-src", "data-lazy-src", "data-original")


def _resolve_img_src(img: BsTag) -> str:
    """Walk image-source attrs in priority order, picking the best URL.

    Order: explicit lazy attrs (data-src/data-lazy-src/data-original) →
    ``srcset`` (largest descriptor) → plain ``src``. The previous order
    treated ``src`` as a lazy attr ahead of ``srcset``, so a placeholder
    ``src`` would beat a real ``srcset`` URL — see Adversarial F6.
    Returns ``""`` if no usable URL is present.
    """
    for attr in _LAZY_OVERRIDE_ATTRS:
        val = img.get(attr)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    srcset = img.get("srcset")
    if srcset and isinstance(srcset, str) and srcset.strip():
        result = _parse_srcset(srcset)
        if result:
            return result

    src = img.get("src")
    if src and isinstance(src, str) and src.strip():
        return src.strip()

    return ""


def _img_qualifies(img: BsTag, src: str) -> bool:
    """True if ``src`` looks like a real cover candidate (not data: / icon /
    sub-50px decorative element)."""
    if not src or src.startswith("data:"):
        return False
    if _ICON_URL_RE.search(src):
        return False
    try:
        w = int(img.get("width", 0) or 0)
        h = int(img.get("height", 0) or 0)
    except (TypeError, ValueError):
        w = h = 0
    if w and h and w < _MIN_COVER_DIMENSION and h < _MIN_COVER_DIMENSION:
        return False
    return True


def _pick_cover_image(
    soup: BeautifulSoup | None,
    container: BsTag | None,
    base_url: str,
) -> str:
    """Pick the most likely cover image for the resource.

    Priority: ``og:image`` (from <head>) → ``twitter:image`` meta →
    largest qualifying ``<img>`` inside ``container`` → empty string.

    ``og:image``/``twitter:image`` skip ``data:`` URIs (placeholder
    payloads SEO scrapers sometimes return); container scan applies the
    full lazy-load + icon/avatar / size filter.

    When multiple qualifying images have no declared dimensions (zero
    area), the **last** one wins — covers virtually always appear after
    the article title, while the first un-sized image is more likely a
    decorative author byline / share-icon that slipped past the URL
    filter.

    Pass ``soup=None`` to skip the meta-tag step (used by list-card
    extraction, where each card needs its own thumbnail rather than the
    page-wide og:image).
    """
    if soup is not None:
        for meta_key in ("og:image", "twitter:image"):
            candidate = _extract_meta(soup, meta_key)
            if candidate and not candidate.startswith("data:"):
                return urljoin(base_url, candidate)

    if container is None:
        return ""

    qualifying: list[tuple[int, int, str]] = []
    for index, img in enumerate(container.find_all("img")):
        src = _resolve_img_src(img)
        if not _img_qualifies(img, src):
            continue
        try:
            w = int(img.get("width", 0) or 0)
            h = int(img.get("height", 0) or 0)
        except (TypeError, ValueError):
            w = h = 0
        qualifying.append((w * h, index, src))

    if not qualifying:
        return ""
    # Sort key: largest declared area first; for the zero-area tie group,
    # later index wins (covers come after the title — the first <img> is
    # likely a byline avatar / share icon that slipped past _img_qualifies).
    qualifying.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return urljoin(base_url, qualifying[0][2])


def _normalize_date_triple(year: int, month: int, day: int) -> str:
    """Validate and zero-pad a (year, month, day) triple to ``YYYY-MM-DD``.

    Returns ``""`` if the triple isn't a plausible publish date (year out
    of 1970..2099, month not 1..12, day not 1..31). Year floor at 1970
    (Unix epoch) to capture digitised pre-2000 archives without weakening
    the regex's "must have full triple" guard against bare copyright years.
    """
    if not (1970 <= year <= 2099):
        return ""
    if not (1 <= month <= 12):
        return ""
    if not (1 <= day <= 31):
        return ""
    return f"{year:04d}-{month:02d}-{day:02d}"


def _extract_published_date(soup: BeautifulSoup, container) -> str:
    """Pick the article's publish date with container-scoped regex fallback.

    Resolution order:
      1. ``<time datetime>`` inside container (truncated to date).
      2. ``<meta property="article:published_time">``.
      3. ``<time datetime>`` anywhere in the document.
      4. Regex over ``container.get_text()`` only — never the whole page,
         so footer copyright dates ("© 2010") and unrelated date strings
         in nav/sidebar don't get attributed.

    Output is always normalised to ``YYYY-MM-DD`` (or empty string).
    Recognised regex formats: ISO ``YYYY-MM-DD[T...]``, slash
    ``YYYY/M/D``, CJK ``YYYY年M月D日``.
    """
    def _from_datetime_attr(time_tag) -> str:
        if not time_tag or not time_tag.get("datetime"):
            return ""
        # Truncate ISO datetime to date portion.
        dt = time_tag["datetime"].strip()
        m = _DATE_ISO_RE.search(dt)
        if not m:
            return ""
        return _normalize_date_triple(int(m[1]), int(m[2]), int(m[3]))

    if container is not None:
        t = container.find("time", attrs={"datetime": True})
        result = _from_datetime_attr(t)
        if result:
            return result

    meta_dt = _extract_meta(soup, "article:published_time")
    if meta_dt:
        m = _DATE_ISO_RE.search(meta_dt)
        if m:
            normalised = _normalize_date_triple(int(m[1]), int(m[2]), int(m[3]))
            if normalised:
                return normalised

    # Fallback: any <time datetime> in the doc (cases where container is
    # missing or the publish-time time tag lives outside <article>).
    t = soup.find("time", attrs={"datetime": True})
    result = _from_datetime_attr(t)
    if result:
        return result

    # Regex fallback runs only on the container — keeps copyright footers
    # and stray sidebar dates out of the result.
    if container is None:
        return ""
    text = container.get_text(" ", strip=True)
    for regex in (_DATE_ISO_RE, _DATE_SLASH_RE, _DATE_CJK_RE):
        m = regex.search(text)
        if m:
            normalised = _normalize_date_triple(int(m[1]), int(m[2]), int(m[3]))
            if normalised:
                return normalised
    return ""


def _breadcrumb_category(soup: BeautifulSoup, url: str) -> str:
    """Extract category from breadcrumb navigation. Handles the case
    where the final breadcrumb entry is the current item (its href
    resolves to the current URL) by using the previous entry instead.
    Returns "" when no breadcrumb present or when it yields no items."""
    breadcrumb = (
        soup.select_one("nav.breadcrumb")
        or soup.select_one('[class*="breadcrumb"]')
    )
    if not breadcrumb:
        return ""
    items = breadcrumb.find_all("a")
    current_path = urlparse(url).path
    if items and current_path and len(items) >= 2:
        last_href = items[-1].get("href", "") or ""
        # Only skip when the last item has an actual href that resolves
        # to the current URL — a bare-text last item (no href) is a
        # typography choice, not a self-link.
        if last_href:
            last_path = urlparse(urljoin(url, last_href)).path
            if last_path == current_path:
                items = items[:-1]
    if items:
        return _clean_text(items[-1].get_text(strip=True))
    return ""


def _is_placeholder_url(url: str) -> bool:
    """Return True if URL points to a placeholder image (1x1 GIF, data URL, etc.)."""
    if not url:
        return True
    url_lower = url.lower()
    # Data URLs, SVG placeholders
    if url_lower.startswith("data:"):
        return True
    # Common 1x1 GIF patterns
    if "1x1" in url_lower or "pixel" in url_lower:
        return True
    return False


def _extract_detail_resource(soup: BeautifulSoup, url: str) -> Resource:
    """Extract a single Resource from a detail page.

    Two-phase extraction (Plan 005):
      1. Structured-data first — JSON-LD / OpenGraph / Twitter / microdata
         via `_extract_structured`. Fields present in that result win.
      2. DOM heuristics fall back for fields the structured path missed.

    Each field's winning source is recorded to the provenance map and
    serialized into `Resource.raw_data` for export/UI consumption.
    """
    from crawler.raw_data import (
        PROVENANCE_DOM,
        build_raw_data,
    )

    # Phase 1: run all four source extractors + merge
    merged, provenance, description_value = _extract_structured(soup)

    # Phase 2: per-field DOM fallback. Each block updates `merged` and
    # marks provenance[field] = PROVENANCE_DOM when a DOM value is used.

    # --- Title ---
    title = merged.get("title", "")
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = _clean_text(h1.get_text(strip=True))
            if title:
                provenance["title"] = PROVENANCE_DOM
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            raw = title_tag.get_text(strip=True)
            title = _strip_title_site_suffix(raw, require_chain=False)
            if title:
                provenance["title"] = PROVENANCE_DOM

    # --- Main container (used by cover, tags, metrics, date) ---
    container = _pick_main_container(soup)

    # --- Cover image ---
    # Multi-fallback chain when structured extractors miss cover_url
    cover_url = merged.get("cover_url", "")
    if not cover_url and container:
        # Try container's images first
        cover_url = _pick_cover_image(None, container, url)
        if cover_url:
            provenance["cover_url"] = PROVENANCE_DOM
    if not cover_url:
        # Try any <img> in the page (for video thumbnails, etc.)
        img = soup.find("img")
        if img and img.get("src"):
            src = img.get("src", "").strip()
            if src and not _is_placeholder_url(src):
                cover_url = urljoin(url, src)
                provenance["cover_url"] = PROVENANCE_DOM
    if not cover_url:
        # Last resort: try video poster attribute or thumbnail data attribute
        for video in soup.find_all(["video", "source"]):
            if video.get("poster"):
                cover_url = urljoin(url, video["poster"])
                provenance["cover_url"] = PROVENANCE_DOM
                break
            if video.get("src"):
                cover_url = urljoin(url, video["src"])
                provenance["cover_url"] = PROVENANCE_DOM
                break

    # --- Tags + detected-category side effect (used by category rule) ---
    # When structured provides tags we skip DOM tag scoring, but still
    # compute detected_category from the tag block for the category
    # fallback chain below.
    tag_scope = container if container is not None else soup
    tags = merged.get("tags") or []
    if tags:
        # Still scan DOM for detected_category (throw away DOM tags)
        _, detected_category_dom = _extract_tags_and_category(tag_scope)
    else:
        tags, detected_category_dom = _extract_tags_and_category(tag_scope)
        # Tag-cloud sanity cap when no container exists
        if container is None and len(tags) > _FALLBACK_TAG_CLOUD_CAP:
            tags = []
            detected_category_dom = ""
        if tags:
            provenance["tags"] = PROVENANCE_DOM

    # --- Metrics (views / likes / hearts) ---
    # Scope DOM heuristic to the article container (or <body>) so
    # sidebar widgets and footer "© 2025" noise don't get attributed.
    metric_scope = container or soup.body or soup
    for key, kws in (
        ("views", ["views", "view", "浏览", "浏览量"]),
        ("likes", ["likes", "like", "赞", "点赞"]),
        ("hearts", ["hearts", "heart", "爱心", "收藏"]),
    ):
        if key not in merged:
            v = _extract_metric(metric_scope, kws)
            if v:
                merged[key] = v
                provenance[key] = PROVENANCE_DOM
            else:
                merged[key] = 0

    # --- Category ---
    # Priority: breadcrumb > structured > detected tag-block > URL path > domain hint
    breadcrumb_cat = _breadcrumb_category(soup, url)
    if breadcrumb_cat:
        category = breadcrumb_cat
        provenance["category"] = PROVENANCE_DOM
    elif merged.get("category"):
        category = merged["category"]
    elif detected_category_dom:
        category = detected_category_dom
        provenance["category"] = PROVENANCE_DOM
    else:
        # Aggressive URL-based category extraction
        path = urlparse(url).path.strip("/")
        segments = [s for s in path.split("/") if s and s not in ("detail", "video", "article", "post")]
        if segments:
            # Pick first non-pattern segment as category
            category = segments[0]
            provenance["category"] = PROVENANCE_DOM
        else:
            # Last resort: use domain-based hint
            domain = urlparse(url).netloc.replace("www.", "")
            domain_hint = domain.split(".")[0]
            if domain_hint and len(domain_hint) > 2:
                category = domain_hint
                provenance["category"] = PROVENANCE_DOM
            else:
                category = ""

    # --- Published date ---
    published_at = merged.get("published_at", "")
    if not published_at:
        published_at = _extract_published_date(soup, container)
        if published_at:
            provenance["published_at"] = PROVENANCE_DOM

    # --- Raw data payload (provenance + description) ---
    raw_data = build_raw_data(provenance, description=description_value)

    # Deduplicate and normalize tags
    tags = _deduplicate_tags(tags)
    
    return Resource(
        title=title,
        url=url,
        cover_url=cover_url,
        tags=tags,
        views=merged.get("views", 0),
        likes=merged.get("likes", 0),
        hearts=merged.get("hearts", 0),
        category=category,
        published_at=published_at,
        raw_data=raw_data,
    )


# ---------------------------------------------------------------------------
# Resource extraction — list page
# ---------------------------------------------------------------------------

def _extract_list_resources(soup: BeautifulSoup, url: str) -> list[Resource]:
    """Extract multiple Resources from a list/tag page."""
    resources: list[Resource] = []
    from crawler.raw_data import (
        PROVENANCE_DOM,
        PROVENANCE_JSONLD,
        build_raw_data,
    )

    # Find repeated card structures. Rather than committing to the first
    # non-empty tier, compute all three sources and pick whichever is
    # richest — a page with 2 hashtag widgets matching `.card` and 87
    # image-link cards is really 87 cards, not 2.
    articles = soup.select("article")
    dotcards = soup.select("div.card, .card")
    link_cards = [a for a in soup.select("a[href]") if _is_link_card(a)]
    cards = max(
        (articles, dotcards, link_cards),
        key=lambda src: len(src),
    )
    if len(cards) <= 1:
        cards = []

    for card in cards:
        # If the card itself is an <a>, use it directly; otherwise find nested <a>
        if card.name == "a" and card.get("href"):
            a_tag = card
        else:
            a_tag = card.find("a", href=True)
            if not a_tag:
                continue

        # Title
        heading = card.find(re.compile(r"^h[1-6]$"))
        if heading:
            title = _clean_text(heading.get_text(strip=True))
        else:
            # For <a> cards, prefer figcaption or dedicated text element over full a_tag text
            figcaption = card.find("figcaption")
            if figcaption:
                title = _clean_text(figcaption.get_text(strip=True))
            else:
                title = _clean_text(a_tag.get_text(strip=True))

        # "Weak" titles — duration badges ("2:06:24"), short promo
        # ribbons ("精選"), or otherwise too-short text — are almost
        # always overlay chrome on the thumbnail, not the real title.
        # Rescue in priority order:
        #   1. a sibling <a> in the card's ancestors that points at the
        #      same URL (typical `<h3 class="title"><a>...</a></h3>`)
        #   2. the thumbnail <img>'s alt attribute (banner carousels
        #      often put the real title only in the alt)
        if _DURATION_RE.fullmatch(title) or len(title) <= _WEAK_TITLE_MAX_LEN:
            target = urljoin(url, a_tag["href"])
            rescued = _rescue_title_from_siblings(a_tag, target, url)
            if not rescued:
                img = a_tag.find("img") or card.find("img")
                if img:
                    alt = _clean_text(img.get("alt", "") or "")
                    if alt and len(alt) > len(title):
                        rescued = alt
            if rescued:
                title = rescued

        # URL
        res_url = urljoin(url, a_tag["href"])

        # Cover — same picker as detail pages so the two paths share the
        # lazy-load + icon/avatar / size filter rules. soup=None skips
        # the page-wide og:image step (each card needs its own thumbnail).
        cover = _pick_cover_image(None, card, url)

        # Tags (optional in cards) — same scoring path as detail pages so
        # the two extractors don't drift in behavior.
        tags, _ = _extract_tags_and_category(card)

        # Try structured data first for card metrics
        card_metrics = {}
        if res_url:
            # For list items, try to extract from page-level structured data
            # pointing to this specific URL (rare but some carousels do it)
            blocks = _parse_jsonld_blocks(soup)
            for block in blocks:
                if isinstance(block, dict):
                    if block.get('url') == res_url:
                        card_metrics = _extract_jsonld_metrics([block])
                        if card_metrics:
                            break
        # Metrics: structured data first, then DOM fallback
        views = card_metrics.get('views') or _extract_metric(card, ["views", "view", "浏览", "浏览量"])
        likes = card_metrics.get('likes') or _extract_metric(card, ["likes", "like", "赞", "点赞"])
        hearts = card_metrics.get('hearts') or _extract_metric(card, ["hearts", "heart", "爱心", "收藏"])

        # Track provenance for list items
        provenance = {}

        # Metrics source tracking
        if 'views' in card_metrics:
            provenance['views'] = PROVENANCE_JSONLD
        elif views:
            provenance['views'] = PROVENANCE_DOM
        if 'likes' in card_metrics:
            provenance['likes'] = PROVENANCE_JSONLD
        elif likes:
            provenance['likes'] = PROVENANCE_DOM
        if 'hearts' in card_metrics:
            provenance['hearts'] = PROVENANCE_JSONLD
        elif hearts:
            provenance['hearts'] = PROVENANCE_DOM
        
        # Other fields from card DOM
        if tags:
            provenance['tags'] = PROVENANCE_DOM
        if title:
            provenance['title'] = PROVENANCE_DOM
        
        raw_data = build_raw_data(provenance)
        
        # Deduplicate and normalize tags
        tags = _deduplicate_tags(tags)
        
        resources.append(Resource(
            title=title,
            url=res_url,
            cover_url=cover,
            tags=tags,
            views=views,
            likes=likes,
            hearts=hearts,
            raw_data=raw_data,
        ))

    return resources


# ---------------------------------------------------------------------------
# Link extraction
# ---------------------------------------------------------------------------

_SKIP_SCHEMES = {"javascript", "mailto", "tel", "data"}


def _extract_links(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Extract and normalize all valid links from the page."""
    links: list[str] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()

        # Skip anchors and unwanted schemes
        if href.startswith("#"):
            continue
        parsed = urlparse(href)
        if parsed.scheme and parsed.scheme.lower() in _SKIP_SCHEMES:
            continue

        absolute = urljoin(base_url, href)
        normalized = _normalize_url(absolute)

        if normalized not in seen:
            seen.add(normalized)
            links.append(absolute)

    return links


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def parse_page(html: str, url: str) -> ParseResult:
    """Parse an HTML page and extract resources, links, and page type."""
    if not html or not html.strip():
        return ParseResult()

    soup = BeautifulSoup(html, "lxml")
    page_type = _detect_page_type(html, url, soup)
    links = _extract_links(soup, url)

    resources: list[Resource] = []
    if page_type == "detail":
        res = _extract_detail_resource(soup, url)
        resources = [res]
    elif page_type in ("list", "tag"):
        resources = _extract_list_resources(soup, url)
    elif page_type == "other":
        # Fallback: try detail extraction for "other" pages with h1/title
        # Better to extract something than nothing
        h1 = soup.find("h1")
        title_tag = soup.find("title")
        if h1 or title_tag:
            res = _extract_detail_resource(soup, url)
            if res.title:  # Only use if we got a title
                resources = [res]

    return ParseResult(
        page_type=page_type,
        resources=resources,
        links=links,
    )


# --- URL Normalization (deduplication) ---

def _normalize_url(url: str) -> str:
    """Normalize URL to reduce duplicates.
    
    - Remove trailing slashes
    - Remove tracking params (utm_*, fbclid, gclid, etc.)
    - Lowercase domain  
    - Sort query params
    """
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    
    parsed = urlparse(url)
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip('/')
    
    # Filter tracking params
    tracking = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                'fbclid', 'gclid', 'msclkid', '_ga', 'ref', 'source'}
    params = parse_qs(parsed.query, keep_blank_values=False)
    params = {k: v for k, v in params.items() if k.lower() not in tracking}
    
    query = urlencode(sorted(params.items())) if params else ''
    return urlunparse((parsed.scheme, netloc, path, '', query, ''))


# --- Tag Deduplication & Normalization ---

_TAG_ALIASES = {
    # Common variations
    '巨乳': ['大乳', '大波', '丰乳'],
    '少女': ['萝莉', '幼女'],
    '熟女': ['老妇', '妇女'],
    '丝袜': ['黑丝', '连裤袜'],
    '骑乘': ['上位', '女上位'],
    '口交': ['吹箫', '含', '吞'],
    '肛交': ['后庭', '菊花'],
    '自慰': ['自摸', '打手枪', '手淫'],
    '出轨': ['婚外', '背夫'],
    '调教': ['训练', '调习'],
    '颜射': ['脸射', '面射'],
}


def _normalize_tag(tag: str) -> str:
    """Normalize tag: lowercase, strip, deduplicate variants."""
    tag = tag.strip().lower()
    # Find canonical form
    for canonical, aliases in _TAG_ALIASES.items():
        if tag == canonical.lower() or tag in [a.lower() for a in aliases]:
            return canonical.lower()
    return tag


def _deduplicate_tags(tags: list[str]) -> list[str]:
    """Remove duplicate tags (accounting for aliases) and sort by frequency."""
    if not tags:
        return []
    
    normalized = [_normalize_tag(t) for t in tags]
    # Keep first occurrence of each normalized tag
    seen = set()
    result = []
    for tag in normalized:
        if tag and tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result
