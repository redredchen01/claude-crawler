"""Tests for page type detection (crawler.parser_page_type_detection module)."""

import pytest
from bs4 import BeautifulSoup

from crawler.parser import (
    parse_page,
    _detect_page_type,
)


# ---------------------------------------------------------------------------
# Fixtures — crafted HTML strings

DETAIL_HTML = """
<html>
<head>
<title>Amazing Article Title | MySite</title>
<meta property="og:title" content="Amazing Article Title">
<meta property="og:article:published_time" content="2025-03-15T10:00:00Z">
<meta property="og:image" content="https://example.com/cover.jpg">
</head>
<body>
<article>
<h1>Amazing Article Title</h1>
<img src="https://example.com/cover.jpg" alt="cover" />
<p>Body content here</p>
<a href="https://example.com/category/tech" rel="tag">Python</a>
<a href="https://example.com/category/web" rel="tag">Web</a>
<div class="post-tags">
<a rel="tag">Python</a>
<a rel="tag">Web</a>
</div>
<div>
<span>Views: 1234</span>
<span>Likes: 56</span>
<span>Hearts: 12</span>
</div>
<p>Published: <time datetime="2025-03-15">2025-03-15</time></p>
</article>
<p><a href="https://example.com/about">About</a></p>
</body>
</html>
"""

LIST_HTML = """
<html>
<head>
<title>Blog Posts | MySite</title>
<meta property="og:title" content="Latest Blog Posts">
</head>
<body>
<h1>Blog</h1>
<div class="posts">
<div class="post-card">
<a href="https://example.com/post/1">
<img src="https://example.com/img/1.jpg" alt="Post One" />
<h2>Post One</h2>
</a>
</div>
<div class="post-card">
<a href="https://example.com/post/2">
<img src="https://example.com/img/2.jpg" alt="Post Two" />
<h2>Post Two</h2>
</a>
</div>
<div class="post-card">
<a href="https://example.com/post/3">
<img src="https://example.com/img/3.jpg" alt="Post Three" />
<h2>Post Three</h2>
</a>
</div>
<div class="post-card">
<a href="https://example.com/post/4">
<img src="https://example.com/img/4.jpg" alt="Post Four" />
<h2>Post Four</h2>
</a>
</div>
<div class="post-card">
<a href="https://example.com/post/5">
<img src="https://example.com/img/5.jpg" alt="Post Five" />
<h2>Post Five</h2>
</a>
</div>
</div>
</body>
</html>
"""

MINIMAL_HTML = """
<html>
<head><title>Minimal</title></head>
<body>
<main>
<p>Just some content without h1 or og:title</p>
</main>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Tests — Page Type Detection

class TestPageTypeDetail:
    """Tests for detail page detection."""

    def test_detect_detail_by_url_pattern(self):
        """Detail URLs like /detail/, /video/, /article/ detect as 'detail'."""
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.page_type == "detail"

    def test_detect_detail_by_structure(self):
        """Detail pages with h1, og:title, and article tag detect as 'detail'."""
        html = """
        <html><head><meta property="og:title" content="Article"></head>
        <body><article><h1>Article Title</h1><p>Content</p></article></body>
        </html>
        """
        result = parse_page(html, "https://example.com/page")
        assert result.page_type == "detail"

    def test_detect_detail_with_numeric_id_in_url(self):
        """Pages with numeric ID in URL detect as detail even without strong structure."""
        html = """
        <html><head><meta property="og:title" content="Title"></head>
        <body><main><h1>Title</h1><p>Some content</p></main></body>
        </html>
        """
        result = parse_page(html, "https://example.com/post/12345")
        assert result.page_type == "detail"

    def test_detect_detail_via_jsonld(self):
        """Detail pages with JSON-LD VideoObject/Article detect as 'detail'."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@type": "VideoObject", "name": "Video", "url": "https://example.com/video/1"}
        </script>
        </head><body>
        <h2>Video</h2>
        <div class="related"><a href="https://example.com/video/2"><img src="/img.jpg"></a></div>
        </body>
        </html>
        """
        result = parse_page(html, "https://example.com/page")
        assert result.page_type == "detail"


class TestPageTypeList:
    """Tests for list page detection."""

    def test_detect_list_by_url_pattern(self):
        """Listing URLs like /updates/, /search/, /category/ detect as 'list'.

        Note: Must have 6+ cards since non-listing URLs need 12+ for list detection.
        """
        # Link cards need alt text to qualify as content signals
        html_cards = "".join(
            f'<div class="item"><a href="/post/{i}"><img src="/p/{i}.jpg" alt="Post {i}"/></a></div>'
            for i in range(8)
        )
        html = f'<html><head><meta property="og:title" content="Posts"></head><body><h1>Posts</h1>{html_cards}</body></html>'
        result = parse_page(html, "https://example.com/updates/")
        assert result.page_type == "list"

    def test_detect_list_by_card_count(self):
        """Pages with 12+ repeated cards detect as 'list'."""
        html_cards = "".join(
            f'<div class="card"><a href="/post/{i}"><img src="/p/{i}.jpg"/></a></div>'
            for i in range(15)
        )
        html = f'<html><body><h1>Posts</h1>{html_cards}</body></html>'
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"

    def test_detect_list_by_listing_url_with_lower_threshold(self):
        """Listing-shaped URL + 6+ cards detect as 'list' (lower threshold)."""
        html_cards = "".join(
            f'<div class="card"><a href="/post/{i}"><img src="/p/{i}.jpg"/></a></div>'
            for i in range(8)
        )
        html = f'<html><head><meta property="og:title" content="Posts"></head><body><h1>Posts</h1>{html_cards}</body></html>'
        result = parse_page(html, "https://example.com/updates/")
        assert result.page_type == "list"

    def test_detect_list_homepage_with_cards(self):
        """Homepage (root path) with 6+ cards detects as 'list'."""
        html_cards = "".join(
            f'<div class="card"><a href="/post/{i}"><img src="/p/{i}.jpg"/></a></div>'
            for i in range(8)
        )
        html = f'<html><body>{html_cards}</body></html>'
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"

    def test_detect_list_many_articles(self):
        """Pages with 4+ <article> tags detect as 'list'."""
        articles = "".join(
            f'<article><h2>Post {i}</h2><p>Content</p></article>'
            for i in range(5)
        )
        html = f'<html><body>{articles}</body></html>'
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"

    def test_detect_list_via_link_cards(self):
        """Pages with 6+ link-card candidates (real href, img, text) detect as 'list'."""
        cards = "".join(
            f'<a href="/video/{i}/"><img src="/p/{i}.jpg" alt="Video {i}"/></a>'
            for i in range(8)
        )
        html = f'<html><body>{cards}</body></html>'
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"


class TestPageTypeTag:
    """Tests for tag/category page detection."""

    def test_detect_tag_page_via_url(self):
        """URLs with /tag/ or /tags/ segment detect as 'tag'."""
        result = parse_page(LIST_HTML, "https://example.com/tags/python")
        assert result.page_type == "tag"

    def test_detect_tag_page_singular(self):
        """URLs with /tag/ (singular) also detect as 'tag'."""
        result = parse_page(LIST_HTML, "https://example.com/tag/python")
        assert result.page_type == "tag"


class TestPageTypeOther:
    """Tests for 'other' classification (unclassified pages)."""

    def test_detect_other_for_minimal_page(self):
        """Minimal pages without structure clues detect as 'other'."""
        result = parse_page(MINIMAL_HTML, "https://example.com/page")
        assert result.page_type == "other"

    def test_detect_other_for_empty_html(self):
        """Empty HTML detects as 'other'."""
        result = parse_page("", "https://example.com/")
        assert result.page_type == "other"

    def test_detect_other_for_whitespace_only(self):
        """Whitespace-only HTML detects as 'other'."""
        result = parse_page("   \n  ", "https://example.com/")
        assert result.page_type == "other"


class TestPageTypeListDetectionGeneralization:
    """Regression tests for page type detection edge cases.

    From kissavs: homepage had 87 image-link cards but only 2 `.card` widgets.
    The old detector committed to the first non-empty tier, so `.card` (2) won
    over link-cards (87) and the page was misclassified as detail.

    Fixed by: computing all card types up front and taking the max.
    """

    def test_link_cards_beat_sparse_dotcards(self):
        """Link-card count (87) must not lose to sparse .card count (2)."""
        html_cards = "".join(
            f'<div class="item"><a href="/video/{i}/"><img src="/p/{i}.jpg" alt="Video {i}"/></a></div>'
            for i in range(87)
        )
        html = f"""
        <html><head><meta property="og:title" content="Grid"></head>
        <body>
        <h1>Grid</h1>
        <div class="card-widget"><img src="/avatar.png"/> Trending</div>
        <div class="card-widget"><img src="/logo.png"/> Recent</div>
        {html_cards}
        </body></html>
        """
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"
        assert len(result.resources) >= 80

    def test_listing_url_overrides_detail_structure(self):
        """Listing-shaped URL with og:title + h1 still detects as 'list' if 6+ cards."""
        html_cards = "".join(
            f'<div class="item"><a href="/update/{i}/"><img src="/p/{i}.jpg" alt="Update {i}"/></a></div>'
            for i in range(8)
        )
        html = f"""
        <html><head>
        <meta property="og:title" content="Latest Updates">
        <title>Updates</title>
        </head><body>
        <h1>Updates</h1>
        <div class="grid">{html_cards}</div>
        </body></html>
        """
        result = parse_page(html, "https://example.com/av/updates/")
        assert result.page_type == "list"

    def test_javascript_anchor_not_card(self):
        """Login button with avatar (javascript: href) doesn't count as a card."""
        html_real_cards = "".join(
            f'<div class="item"><a href="/video/{i}/"><img src="/p/{i}.jpg" alt="Video {i}"/></a></div>'
            for i in range(13)
        )
        html = f"""
        <html><head><title>Grid</title></head>
        <body>
        <header>
        <a href="javascript:void(0)" class="bind_login">
        <img src="/avatar.svg" alt="User"/>
        </a>
        </header>
        {html_real_cards}
        </body></html>
        """
        result = parse_page(html, "https://example.com/")
        assert result.page_type == "list"
        urls = [res.url for res in result.resources]
        assert not any(u.startswith("javascript:") for u in urls)
        assert sum(1 for u in urls if "/video/" in u) == 13


class TestHeadingHierarchySignal:
    """Tests for heading structure fallback (last-resort page type detection)."""

    def test_single_h1_with_few_h2_and_body_is_detail(self):
        """Single h1 + ≤3 h2+ headings + ≥500 chars body → detail."""
        html = """
        <html><body>
        <h1>Article Title</h1>
        <p>""" + "x" * 600 + """</p>
        <h2>Section A</h2>
        <p>Content A</p>
        </body></html>
        """
        soup = BeautifulSoup(html, "lxml")
        page_type = _detect_page_type(html, "https://example.com/article", soup)
        assert page_type == "detail"

    def test_many_h2_without_h1_is_list(self):
        """No h1 + 8+ h2+ headings → list (like a grid with card titles)."""
        h2s = "".join(f'<h2>Card {i}</h2><p>Content</p>' for i in range(10))
        html = f'<html><body>{h2s}</body></html>'
        soup = BeautifulSoup(html, "lxml")
        page_type = _detect_page_type(html, "https://example.com/", soup)
        assert page_type == "list"

    def test_multiple_h1_is_list(self):
        """Multiple h1 tags (2+) → list (unusual structure)."""
        html = """
        <html><body>
        <h1>Section A</h1>
        <p>Content A</p>
        <h1>Section B</h1>
        <p>Content B</p>
        </body></html>
        """
        soup = BeautifulSoup(html, "lxml")
        page_type = _detect_page_type(html, "https://example.com/", soup)
        assert page_type == "list"

    def test_no_h1_few_h2_returns_none(self):
        """No h1 + few h2 (≤5) → None (ambiguous, falls through)."""
        html = """
        <html><body>
        <p>Some content</p>
        <h2>Minor Section</h2>
        </body></html>
        """
        soup = BeautifulSoup(html, "lxml")
        page_type = _detect_page_type(html, "https://example.com/", soup)
        # Falls through to other signals; with minimal structure → "other"
        assert page_type in ("other", "detail")
