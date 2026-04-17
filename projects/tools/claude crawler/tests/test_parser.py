"""Tests for crawler.parser module."""

import pytest

from bs4 import BeautifulSoup

from crawler.parser import parse_page, _extract_detail_resource


# ---------------------------------------------------------------------------
# Fixtures — crafted HTML strings
# ---------------------------------------------------------------------------

DETAIL_HTML = """\
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Amazing Article Title">
    <meta property="og:image" content="https://example.com/cover.jpg">
    <meta property="article:published_time" content="2025-03-15T10:00:00Z">
    <title>Amazing Article Title | Example Site</title>
</head>
<body>
<nav class="breadcrumb"><a href="/blog">Blog</a> &gt; <a href="/blog/tech">Tech</a></nav>
<article>
    <h1>Amazing Article Title</h1>
    <time datetime="2025-03-15">March 15, 2025</time>
    <div class="tags">
        <a rel="tag" href="/tags/python">Python</a>
        <a rel="tag" href="/tags/web">Web</a>
    </div>
    <div class="metrics">
        <span>views 1,234</span>
        <span>likes 56</span>
        <span>hearts 12</span>
    </div>
    <p>Article body text here.</p>
</article>
<a href="/about">About</a>
<a href="/contact">Contact</a>
</body>
</html>
"""

LIST_HTML = """\
<!DOCTYPE html>
<html><head><title>Blog</title></head>
<body>
<article>
    <a href="/post/1"><h2>Post One</h2></a>
    <img src="/img/1.jpg">
</article>
<article>
    <a href="/post/2"><h2>Post Two</h2></a>
    <img src="/img/2.jpg">
</article>
<article>
    <a href="/post/3"><h2>Post Three</h2></a>
    <img src="/img/3.jpg">
</article>
<article>
    <a href="/post/4"><h2>Post Four</h2></a>
    <img src="/img/4.jpg">
</article>
<article>
    <a href="/post/5"><h2>Post Five</h2></a>
    <img src="/img/5.jpg">
</article>
</body>
</html>
"""

MINIMAL_HTML = """\
<!DOCTYPE html>
<html><head><title>Simple Page | MySite</title></head>
<body>
<main><p>Hello world</p></main>
</body>
</html>
"""

LINK_HTML = """\
<!DOCTYPE html>
<html><head><title>Links</title></head>
<body>
<a href="/page1">Page 1</a>
<a href="https://external.com/foo">External</a>
<a href="#section">Anchor</a>
<a href="javascript:void(0)">JS</a>
<a href="mailto:a@b.com">Email</a>
<a href="tel:123">Phone</a>
<a href="/page2">Page 2</a>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestDetailPage:
    def test_page_type(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.page_type == "detail"

    def test_title(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].title == "Amazing Article Title"

    def test_cover_url(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].cover_url == "https://example.com/cover.jpg"

    def test_tags(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].tags == ["Python", "Web"]

    def test_tags_scoped_to_article_container_not_sidebar(self):
        """Regression: site-wide tag-cloud widgets in sidebar/footer must
        not leak into per-article tag lists. Repro: 51cg1.com had an
        ~50-tag sidebar that appeared on every article page; pre-fix the
        parser scanned the whole DOM and assigned all 50 tags to every
        article, drowning out the 1-3 article-specific tags."""
        sidebar_tags = "".join(
            f'<a rel="tag">sidebar-tag-{i}</a>' for i in range(40)
        )
        html = (
            '<html><head><meta property="og:title" content="Real Article"></head>'
            '<body>'
            '<article>'
            '<h1>Real Article</h1>'
            '<p>body</p>'
            '<div class="post-tags">'
            '<a rel="tag">article-tag-1</a>'
            '<a rel="tag">article-tag-2</a>'
            '</div>'
            '</article>'
            f'<aside class="sidebar"><h3>Hot Tags</h3>{sidebar_tags}</aside>'
            '</body></html>'
        )
        result = parse_page(html, "https://example.com/post/1")
        tags = result.resources[0].tags
        assert tags == ["article-tag-1", "article-tag-2"], (
            f"Expected only the article-scoped tags; got {tags}"
        )

    def test_tags_no_container_falls_back_with_size_cap(self):
        """When the page has neither <article> nor <main>, we fall back to
        whole-document scanning — but apply a 30-tag cap to detect tag-cloud
        spam. Tested via the internal helper because pages without
        article/main classify as page_type='other' and don't reach
        _extract_detail_resource through parse_page."""
        cloud_tags = "".join(
            f'<a rel="tag">cloud-tag-{i}</a>' for i in range(50)
        )
        html = f'<html><body><h1>Some Title</h1>{cloud_tags}</body></html>'
        soup = BeautifulSoup(html, "lxml")
        resource = _extract_detail_resource(soup, "https://example.com/post/1")
        # Whole-doc scan saw 50 tags → cap kicked in → tags dropped.
        assert resource.tags == [], (
            f"Tag-cloud cap should drop the noise; got {resource.tags}"
        )

    def test_tags_no_container_under_cap_keeps_results(self):
        """When no container exists but tag count is reasonable (<=30),
        whole-doc fallback is allowed."""
        few_tags = "".join(
            f'<a rel="tag">small-tag-{i}</a>' for i in range(5)
        )
        html = f'<html><body><h1>Some Title</h1>{few_tags}</body></html>'
        soup = BeautifulSoup(html, "lxml")
        resource = _extract_detail_resource(soup, "https://example.com/post/1")
        assert len(resource.tags) == 5

    def test_views(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].views == 1234

    def test_likes(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].likes == 56

    def test_hearts(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].hearts == 12

    def test_category(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].category == "Tech"

    def test_published_at(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert result.resources[0].published_at == "2025-03-15"

    def test_links_extracted(self):
        result = parse_page(DETAIL_HTML, "https://example.com/blog/tech/article-1")
        assert any("/about" in link for link in result.links)
        assert any("/contact" in link for link in result.links)


class TestListPage:
    def test_page_type(self):
        result = parse_page(LIST_HTML, "https://example.com/blog")
        assert result.page_type == "list"

    def test_resource_count(self):
        result = parse_page(LIST_HTML, "https://example.com/blog")
        assert len(result.resources) == 5

    def test_resource_titles(self):
        result = parse_page(LIST_HTML, "https://example.com/blog")
        titles = [r.title for r in result.resources]
        assert titles == ["Post One", "Post Two", "Post Three", "Post Four", "Post Five"]

    def test_resource_urls(self):
        result = parse_page(LIST_HTML, "https://example.com/blog")
        assert result.resources[0].url == "https://example.com/post/1"

    def test_resource_covers(self):
        result = parse_page(LIST_HTML, "https://example.com/blog")
        assert result.resources[0].cover_url == "https://example.com/img/1.jpg"


class TestTagPage:
    def test_page_type(self):
        result = parse_page(LIST_HTML, "https://example.com/tags/python")
        assert result.page_type == "tag"

    def test_tag_url_variant(self):
        result = parse_page(LIST_HTML, "https://example.com/tag/python")
        assert result.page_type == "tag"


class TestMissingFields:
    def test_page_type_other(self):
        result = parse_page(MINIMAL_HTML, "https://example.com/page")
        # main block exists, h1 is missing but title exists — detected as "detail" or "other"
        # Since <main> exists but no h1/time/og:title → "other"
        assert result.page_type == "other"

    def test_title_fallback_to_title_tag(self):
        """When only <title> is present, title is extracted (suffix stripped)."""
        html = '<html><head><title>My Page | MySite</title></head><body><article><h1>My Page</h1><p>Content</p></article></body></html>'
        result = parse_page(html, "https://example.com/my-page")
        assert result.resources[0].title == "My Page"

    def test_default_metrics(self):
        html = '<html><head><title>No Metrics</title></head><body><article><h1>No Metrics</h1></article></body></html>'
        result = parse_page(html, "https://example.com/no-metrics")
        r = result.resources[0]
        assert r.views == 0
        assert r.likes == 0
        assert r.hearts == 0

    def test_empty_tags(self):
        html = '<html><head><title>No Tags</title></head><body><article><h1>No Tags</h1></article></body></html>'
        result = parse_page(html, "https://example.com/no-tags")
        assert result.resources[0].tags == []


class TestEmptyHTML:
    def test_empty_string(self):
        result = parse_page("", "https://example.com")
        assert result.page_type == "other"
        assert result.resources == []
        assert result.links == []

    def test_whitespace_only(self):
        result = parse_page("   \n  ", "https://example.com")
        assert result.page_type == "other"
        assert result.resources == []
        assert result.links == []


class TestLinkExtraction:
    def test_valid_links_count(self):
        result = parse_page(LINK_HTML, "https://example.com")
        # /page1, external, /page2 = 3 valid links
        assert len(result.links) == 3

    def test_absolute_internal(self):
        result = parse_page(LINK_HTML, "https://example.com")
        assert "https://example.com/page1" in result.links
        assert "https://example.com/page2" in result.links

    def test_absolute_external(self):
        result = parse_page(LINK_HTML, "https://example.com")
        assert "https://external.com/foo" in result.links

    def test_no_anchors(self):
        result = parse_page(LINK_HTML, "https://example.com")
        assert not any("#" in link and link.endswith("#section") for link in result.links)

    def test_no_javascript(self):
        result = parse_page(LINK_HTML, "https://example.com")
        assert not any("javascript" in link for link in result.links)

    def test_no_mailto(self):
        result = parse_page(LINK_HTML, "https://example.com")
        assert not any("mailto" in link for link in result.links)
