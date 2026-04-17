"""HTML page parser — extracts resources, links, and page metadata."""

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from crawler.models import ParseResult, Resource

# Tag-cloud detection threshold for the no-container fallback path. Real
# articles rarely tag past this; exceeding it strongly suggests a sidebar
# /footer site-wide tag widget (the 51cg1.com bug pattern).
_FALLBACK_TAG_CLOUD_CAP = 30


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
    container = soup.select_one("article") or soup.select_one("main")

    # Cover image
    cover_url = _extract_meta(soup, "og:image")
    if not cover_url and container:
        img = container.find("img")
        if img and img.get("src"):
            cover_url = urljoin(url, img["src"])

    # Tags — restrict to article container when available; only fall back to
    # whole-document search when no container exists, and apply a sanity
    # cap (real articles rarely have 30+ tags; >30 strongly suggests a
    # site-wide tag-cloud widget).
    tag_scope = container if container is not None else soup
    tags: list[str] = []
    # a[rel="tag"]
    for a in tag_scope.select('a[rel="tag"]'):
        t = _clean_text(a.get_text(strip=True))
        if t and t not in tags:
            tags.append(t)
    # Elements with class containing "tag" — match both a[class*="tag"] and [class*="tag"] a
    if not tags:
        for el in tag_scope.select('a[class*="tag"], [class*="tag"] a'):
            t = _clean_text(el.get_text(strip=True))
            if t and t not in tags and t != "+":
                tags.append(t)
    # Tag-cloud sanity check: no article legitimately has >FALLBACK_TAG_CAP
    # tags. If the scope yielded a tag-cloud-sized list (no container
    # guard), treat as noise and drop entirely so it doesn't drown out
    # per-article signals.
    if container is None and len(tags) > _FALLBACK_TAG_CLOUD_CAP:
        tags = []

    # Metrics
    views = _extract_number_near_keyword(soup, ["views", "view", "浏览", "浏览量"])
    likes = _extract_number_near_keyword(soup, ["likes", "like", "赞", "点赞"])
    hearts = _extract_number_near_keyword(soup, ["hearts", "heart", "爱心", "收藏"])

    # Category — breadcrumb last item or URL path
    category = ""
    breadcrumb = soup.select_one("nav.breadcrumb") or soup.select_one('[class*="breadcrumb"]')
    if breadcrumb:
        items = breadcrumb.find_all("a")
        if items:
            category = _clean_text(items[-1].get_text(strip=True))
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

        # Tags (optional in cards)
        tags: list[str] = []
        for tag_el in card.select('a[rel="tag"], a[class*="tag"], [class*="tag"] a'):
            t = _clean_text(tag_el.get_text(strip=True))
            if t and t not in tags and t != "+":
                tags.append(t)

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
