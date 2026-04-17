"""HTML page parser — extracts resources, links, and page metadata."""

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


def _extract_number_near_keyword(soup: BeautifulSoup, keywords: list[str]) -> int:
    """Find a number near keyword text in the HTML."""
    num_re = re.compile(r"\d[\d,]*")
    for kw in keywords:
        # Search elements whose text contains the keyword
        for el in soup.find_all(string=re.compile(re.escape(kw), re.I)):
            parent = el.parent
            if parent is None:
                continue
            # Check the parent element text for a number
            text = parent.get_text(" ", strip=True)
            m = num_re.search(text)
            if m:
                return int(m.group().replace(",", ""))
            # Check adjacent siblings
            for sib in parent.next_siblings:
                if hasattr(sib, "get_text"):
                    sib_text = sib.get_text(strip=True)
                else:
                    sib_text = str(sib).strip()
                m = num_re.search(sib_text)
                if m:
                    return int(m.group().replace(",", ""))
    return 0


# ---------------------------------------------------------------------------
# Page-type detection
# ---------------------------------------------------------------------------

def _detect_page_type(html: str, url: str, soup: BeautifulSoup) -> str:
    """Determine page type from URL and HTML structure."""
    # Tag pages
    if "/tag/" in url or "/tags/" in url:
        return "tag"

    # Detail pages — single main content with rich metadata (check before list)
    path = urlparse(url).path.strip("/")
    is_root = not path  # homepage / index
    main_block = soup.select_one("article") or soup.select_one("main") or soup.select_one(".post")
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

    # List pages — look for repeated card-like elements
    for selector in ["article", "div.card", ".card"]:
        elements = soup.select(selector)
        if len(elements) > 3:
            return "list"

    # Fallback list detection: repeated <a> with images (card grids)
    all_links = soup.select("a[href]")
    link_cards = [a for a in all_links if a.find("img") and a.get_text(strip=True)]
    if len(link_cards) > 5:
        return "list"

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

    return soup.select_one("main")


def _extract_detail_resource(soup: BeautifulSoup, url: str) -> Resource:
    """Extract a single Resource from a detail page."""
    # Title
    title = _extract_meta(soup, "og:title")
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = _clean_text(h1.get_text(strip=True))
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            raw = title_tag.get_text(strip=True)
            # Strip " | Site Name" or " - Site Name" suffix
            title = re.split(r"\s*[|\-–—]\s*", raw, maxsplit=1)[0].strip()

    # Locate the article container once — used for both cover image and
    # tag scoping. Without scoping, sidebar/footer "tag cloud" widgets
    # leak into every article's tag set (the site-wide tags appear on
    # every page, producing identical tag lists across all articles).
    # See _pick_main_container for the multi-article disambiguation rules.
    container = _pick_main_container(soup)

    # Cover image
    cover_url = _extract_meta(soup, "og:image")
    if not cover_url and container:
        img = container.find("img")
        if img and img.get("src"):
            cover_url = urljoin(url, img["src"])

    # Tags — restrict to the article container when available; otherwise
    # fall back to whole-document scoring but apply the tag-cloud cap
    # (real articles rarely have >30 tags; exceeding it strongly suggests
    # a site-wide widget leaking in).
    tag_scope = container if container is not None else soup
    tags, detected_category = _extract_tags_and_category(tag_scope)
    if container is None and len(tags) > _FALLBACK_TAG_CLOUD_CAP:
        tags = []
        detected_category = ""

    # Metrics
    views = _extract_number_near_keyword(soup, ["views", "view", "浏览", "浏览量"])
    likes = _extract_number_near_keyword(soup, ["likes", "like", "赞", "点赞"])
    hearts = _extract_number_near_keyword(soup, ["hearts", "heart", "爱心", "收藏"])

    # Category priority: breadcrumb > detected category link (from the
    # tag block) > URL first segment. Breadcrumb wins because it's the
    # site's own structured signal; the detected link beats URL segments
    # because it carries the human-readable category name.
    category = ""
    breadcrumb = soup.select_one("nav.breadcrumb") or soup.select_one('[class*="breadcrumb"]')
    if breadcrumb:
        items = breadcrumb.find_all("a")
        if items:
            category = _clean_text(items[-1].get_text(strip=True))
    if not category and detected_category:
        category = detected_category
    if not category:
        path = urlparse(url).path.strip("/")
        segments = path.split("/")
        if len(segments) >= 2:
            category = segments[0]

    # Published date
    published_at = ""
    time_tag = soup.find("time")
    if time_tag and time_tag.get("datetime"):
        published_at = time_tag["datetime"]
    if not published_at:
        published_at = _extract_meta(soup, "article:published_time")
    if not published_at:
        text = soup.get_text()
        m = re.search(r"\d{4}[-/]\d{2}[-/]\d{2}", text)
        if m:
            published_at = m.group()

    return Resource(
        title=title,
        url=url,
        cover_url=cover_url,
        tags=tags,
        views=views,
        likes=likes,
        hearts=hearts,
        category=category,
        published_at=published_at,
    )


# ---------------------------------------------------------------------------
# Resource extraction — list page
# ---------------------------------------------------------------------------

def _extract_list_resources(soup: BeautifulSoup, url: str) -> list[Resource]:
    """Extract multiple Resources from a list/tag page."""
    resources: list[Resource] = []

    # Find repeated card structures
    cards = soup.select("article")
    if len(cards) <= 1:
        cards = soup.select("div.card, .card")
    # Fallback: repeated <a> elements with images (common in CMS card grids)
    if len(cards) <= 1:
        all_links = soup.select("a[href]")
        cards = [a for a in all_links if a.find("img") and a.get_text(strip=True)]

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

        # URL
        res_url = urljoin(url, a_tag["href"])

        # Cover — prefer data-src (lazy-loaded) over src placeholder
        img = card.find("img")
        if img:
            img_src = img.get("data-src") or img.get("src") or ""
            cover = urljoin(url, img_src) if img_src else ""
        else:
            cover = ""

        # Tags (optional in cards) — same scoring path as detail pages so
        # the two extractors don't drift in behavior.
        tags, _ = _extract_tags_and_category(card)

        # Metrics (optional)
        views = _extract_number_near_keyword(card, ["views", "view", "浏览"])
        likes = _extract_number_near_keyword(card, ["likes", "like", "赞"])
        hearts = _extract_number_near_keyword(card, ["hearts", "heart", "收藏"])

        resources.append(Resource(
            title=title,
            url=res_url,
            cover_url=cover,
            tags=tags,
            views=views,
            likes=likes,
            hearts=hearts,
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

        if absolute not in seen:
            seen.add(absolute)
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

    return ParseResult(
        page_type=page_type,
        resources=resources,
        links=links,
    )
