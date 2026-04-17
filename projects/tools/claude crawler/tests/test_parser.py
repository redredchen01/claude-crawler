"""Tests for crawler.parser module."""

import pytest

from bs4 import BeautifulSoup

from crawler.parser import (
    parse_page,
    _extract_detail_resource,
    _extract_metric,
    _extract_published_date,
    _img_qualifies,
    _normalize_date_triple,
    _parse_metric_number,
    _pick_cover_image,
    _pick_main_container,
    _resolve_img_src,
)
# Constants imported separately so test boundary assertions track config drift.
from crawler.parser import (
    _FALLBACK_TAG_CLOUD_CAP,
    _METRIC_SIBLING_CAP,
    _MIN_COVER_DIMENSION,
)


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


class TestMultiSignalTagScoring:
    """Cross-site generalization — scores each <a> by multiple signals
    (href pattern, percent-encoded CJK, class, rel) so tag extraction is
    not tied to any one selector.
    """

    # Mirrors the real site structure the brainstorm was built from:
    # tag container class *does* contain "tag", but a sibling link with
    # class="cat" + /theme/ path is a category, not a tag.
    EXAMPLE_SITE_HTML = """\
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Example Detail">
    <title>Example Detail | Site</title>
</head>
<body>
<article>
    <h1>Example Detail</h1>
    <p>body</p>
    <h3 class="tags h6-md" style="color: #FFF">
        <a href="/av/theme/sex-only/hot/" class="cat"><em>直接开啪</em></a>
        <span class="separator">•</span>
        <a href="/av/tag/%E5%81%B6%E5%83%8F/update/"><em>偶像</em></a>
        <a href="/av/tag/%E5%B7%A8%E4%B9%B3/update/"><em>巨乳</em></a>
        <a href="/av/tag/%E7%8B%AC%E8%A7%92%E6%88%8F/update/"><em>独角戏</em></a>
        <a href="/av/tag/%E7%97%B4%E5%A5%B3/update/"><em>痴女</em></a>
        <a href="/av/tag/%E7%BA%AA%E5%BD%95%E7%89%87/update/"><em>纪录片</em></a>
    </h3>
</article>
</body>
</html>
"""

    # A site whose tag container class does NOT include "tag" — must
    # still be detected via href path + percent-encoded CJK signals.
    POST_META_HTML = """\
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Meta-class Detail">
    <title>Meta Detail</title>
</head>
<body>
<article>
    <h1>Meta-class Detail</h1>
    <p>body</p>
    <div class="post-meta">
        <span>Author: Jane</span>
        <a href="/keyword/python/">Python</a>
        <a href="/label/web/">Web</a>
        <a href="/topic/performance/">Performance</a>
    </div>
</article>
</body>
</html>
"""

    def test_example_site_tags(self):
        """5 真标签入 tags，category link 不污染。"""
        result = parse_page(self.EXAMPLE_SITE_HTML, "https://example.com/av/123")
        tags = result.resources[0].tags
        assert tags == ["偶像", "巨乳", "独角戏", "痴女", "纪录片"], (
            f"Expected 5 real tags without category; got {tags}"
        )

    def test_example_site_category_detected(self):
        """class="cat" + /theme/ 归类为 category，填入 Resource.category。"""
        result = parse_page(self.EXAMPLE_SITE_HTML, "https://example.com/av/123")
        # No breadcrumb, so detected category link wins over URL segment.
        assert result.resources[0].category == "直接开啪"

    def test_example_site_separator_excluded(self):
        """<span class="separator"> 不影响结果（非 <a>，自然被忽略）。"""
        result = parse_page(self.EXAMPLE_SITE_HTML, "https://example.com/av/123")
        assert "•" not in result.resources[0].tags

    def test_container_without_tag_class(self):
        """class 名不含 'tag' 的容器也能抓到 tag（靠 href path 信号）。"""
        result = parse_page(self.POST_META_HTML, "https://example.com/post/42")
        tags = result.resources[0].tags
        assert tags == ["Python", "Web", "Performance"], (
            f"Expected tag extraction via href signals; got {tags}"
        )

    def test_breadcrumb_overrides_detected_category(self):
        """优先级: breadcrumb > detected category link > URL 首段。"""
        html = """\
<html><head><meta property="og:title" content="T"></head>
<body>
<nav class="breadcrumb"><a>Home</a> &gt; <a>Real Category</a></nav>
<article>
<h1>T</h1>
<div class="tags">
<a href="/category/noise/" class="cat">Noise Category</a>
<a rel="tag" href="/tag/foo">foo</a>
</div>
</article></body></html>
"""
        result = parse_page(html, "https://example.com/path/article")
        assert result.resources[0].category == "Real Category"

    def test_url_segment_fallback_when_no_category_signal(self):
        """既无 breadcrumb 也无 category link 时，回落到 URL 首段（现有行为）。"""
        html = """\
<html><head><meta property="og:title" content="T"></head>
<body>
<article>
<h1>T</h1>
<div class="tags"><a rel="tag" href="/tag/foo">foo</a></div>
</article></body></html>
"""
        result = parse_page(html, "https://example.com/blog/article-1")
        assert result.resources[0].category == "blog"

    def test_scoring_rejects_nontag_internal_links(self):
        """Article 内普通内容链接（无 /tag/、无 tag class、无 rel=tag）不会被误判为 tag。"""
        html = """\
<html><head><meta property="og:title" content="T"></head>
<body>
<article>
<h1>T</h1>
<p>See also <a href="/about">About page</a> for more info.</p>
<p>Or contact <a href="/contact">us</a>.</p>
</article></body></html>
"""
        result = parse_page(html, "https://example.com/post/1")
        assert result.resources[0].tags == []

    def test_scoring_rejects_overlong_anchor_text(self):
        """超过 20 字的锚文本不是 tag（S5 长度门槛兜底）。"""
        html = """\
<html><head><meta property="og:title" content="T"></head>
<body>
<article>
<h1>T</h1>
<div class="tags">
<a rel="tag" href="/tag/ok">ok</a>
<a rel="tag" href="/tag/x">This is an entire sentence pretending to be a tag</a>
</div>
</article></body></html>
"""
        result = parse_page(html, "https://example.com/post/1")
        assert result.resources[0].tags == ["ok"]


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


# ---------------------------------------------------------------------------
# Main-container picker — replaces the naïve `select_one("article")` that
# used to grab the first <article> in document order, polluting detail
# pages that have a "Related articles" sidebar block before the real
# content (or list pages misclassified as detail).
# ---------------------------------------------------------------------------

class TestPickMainContainer:
    def _pick(self, html: str):
        return _pick_main_container(BeautifulSoup(html, "lxml"))

    def test_returns_none_when_no_article_or_main(self):
        assert self._pick("<html><body><div>x</div></body></html>") is None

    def test_single_article_returned_directly(self):
        c = self._pick(
            "<html><body><article><h1>Real</h1><p>body</p></article></body></html>"
        )
        assert c is not None
        assert c.name == "article"
        assert "Real" in c.get_text()

    def test_itemprop_main_content_wins_over_decoy_article(self):
        """Schema.org's mainContentOfPage is the strongest structural
        signal — it wins even if the decoy article appears first in
        document order and has more text."""
        html = """
        <html><body>
        <article>
            <h1>Decoy First Article</h1>
            <p>{padding}</p>
        </article>
        <article itemprop="mainContentOfPage">
            <h1>Real Content</h1>
            <p>short</p>
        </article>
        </body></html>
        """.format(padding="lots of decoy content " * 100)
        c = self._pick(html)
        assert "Real Content" in c.get_text()
        assert "Decoy" not in c.get_text()

    def test_main_article_wins_over_outside_article(self):
        """Article inside <main> is the real content; sibling articles
        are typically "Related articles" / sidebar entries."""
        html = """
        <html><body>
        <article class="related"><h2>Related Item</h2><p>x</p></article>
        <main>
            <article>
                <h1>Real Article</h1>
                <p>body</p>
            </article>
        </main>
        </body></html>
        """
        c = self._pick(html)
        assert "Real Article" in c.get_text()
        assert "Related Item" not in c.get_text()

    def test_largest_by_text_when_no_structural_signal(self):
        """No itemprop / no <main> wrapping — pick the article with the
        most text content. Filters out the small "Related" entries that
        often appear above or below the real content."""
        html = """
        <html><body>
        <article><h2>Related 1</h2><p>tiny</p></article>
        <article><h2>Related 2</h2><p>also tiny</p></article>
        <article>
            <h1>Real Article</h1>
            <p>{body}</p>
        </article>
        <article><h2>Related 3</h2><p>still tiny</p></article>
        </body></html>
        """.format(body="this is the real content with substantial body text " * 50)
        c = self._pick(html)
        assert "Real Article" in c.get_text()

    def test_falls_back_to_main_when_no_article(self):
        c = self._pick(
            "<html><body><main><h1>From main</h1><p>x</p></main></body></html>"
        )
        assert c is not None
        assert c.name == "main"

    def test_article_preferred_over_main(self):
        """When both <article> and <main> exist, <article> wins — it's
        the more specific structural element."""
        html = """
        <html><body>
        <main>
            <article><h1>Real</h1><p>body</p></article>
            <aside>sidebar</aside>
        </main>
        </body></html>
        """
        c = self._pick(html)
        assert c.name == "article"


class TestDetailResourceMultiArticleRegression:
    """End-to-end: parse_page on a detail page with sidebar 'Related'
    articles must return the *real* article's metadata, not a decoy."""

    def test_related_sidebar_does_not_pollute_title(self):
        # Only meta og:title / h1 outside the article block matter for
        # title extraction in the current parser. The bug surface is
        # tags + cover image, which are scoped to the container.
        html = """
        <html><head>
            <meta property="og:title" content="Real Article Title">
            <meta property="og:image" content="https://example.com/real-cover.jpg">
        </head><body>
        <article class="related-sidebar">
            <h2>Related Item</h2>
            <img src="/decoy-cover.jpg">
            <a rel="tag">decoy-tag</a>
        </article>
        <main>
            <article>
                <h1>Real Article Title</h1>
                <p>body</p>
                <a rel="tag">real-tag-1</a>
                <a rel="tag">real-tag-2</a>
            </article>
        </main>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/123")
        # parse_page should classify as detail and return one resource.
        assert result.page_type == "detail"
        assert len(result.resources) == 1
        r = result.resources[0]
        assert r.tags == ["real-tag-1", "real-tag-2"], (
            f"Expected only real-article tags, got {r.tags}"
        )
        # og:image takes priority over container <img>, so cover_url
        # is not a meaningful regression marker here. The tag scoping
        # is the load-bearing assertion.


# ---------------------------------------------------------------------------
# Unit 1 — Metric extraction precision (K/M/B + 万/千/亿 + year guard)
# ---------------------------------------------------------------------------


class TestParseMetricNumber:
    def test_plain_int(self):
        assert _parse_metric_number("views 1234", year_guard=False) == 1234

    def test_thousand_separator_comma(self):
        assert _parse_metric_number("1,234,567", year_guard=False) == 1234567

    def test_thousand_separator_space(self):
        assert _parse_metric_number("1 234 567", year_guard=False) == 1234567

    def test_decimal_with_K_suffix(self):
        assert _parse_metric_number("12.3K", year_guard=False) == 12300

    def test_M_suffix(self):
        assert _parse_metric_number("1.5M views", year_guard=False) == 1_500_000

    def test_B_suffix(self):
        assert _parse_metric_number("2B hits", year_guard=False) == 2_000_000_000

    def test_lowercase_suffix(self):
        assert _parse_metric_number("3k", year_guard=False) == 3000

    def test_cjk_wan(self):
        assert _parse_metric_number("浏览 1.2万", year_guard=False) == 12_000

    def test_cjk_qian(self):
        assert _parse_metric_number("3千", year_guard=False) == 3000

    def test_cjk_yi(self):
        assert _parse_metric_number("1.5亿", year_guard=False) == 150_000_000

    def test_year_guard_skips_bare_4digit_year(self):
        # In a copyright context, 2010 is a year, not a metric.
        assert _parse_metric_number("© 2010", year_guard=True) is None

    def test_year_guard_does_not_skip_when_off(self):
        assert _parse_metric_number("© 2010", year_guard=False) == 2010

    def test_year_guard_does_not_skip_with_suffix(self):
        # 2010K is unambiguously a metric, never a year.
        assert _parse_metric_number("2010K", year_guard=True) == 2_010_000

    def test_year_guard_does_not_skip_decimal(self):
        # 2010.5 isn't a year; let it through.
        assert _parse_metric_number("2010.5", year_guard=True) == 2010

    def test_year_guard_takes_next_match_when_year_skipped(self):
        # First number is a year; second is the real metric.
        assert _parse_metric_number(
            "© 2010 — likes 42", year_guard=True,
        ) == 42

    def test_no_match_returns_none(self):
        assert _parse_metric_number("no numbers here", year_guard=False) is None


class TestExtractMetric:
    def _scope(self, html: str) -> "BsTag":
        return BeautifulSoup(html, "lxml")

    def test_basic_views(self):
        s = self._scope("<div><span>views 1,234</span></div>")
        assert _extract_metric(s, ["views"]) == 1234

    def test_K_suffix_in_real_html(self):
        s = self._scope("<div><span>12.3K views</span></div>")
        assert _extract_metric(s, ["views"]) == 12300

    def test_cjk_wan_in_real_html(self):
        s = self._scope("<div><span>浏览 1.2万</span></div>")
        assert _extract_metric(s, ["浏览"]) == 12000

    def test_returns_zero_when_keyword_missing(self):
        s = self._scope("<div><span>no metric here 1234</span></div>")
        assert _extract_metric(s, ["views"]) == 0

    def test_year_guard_in_footer_context(self):
        # Footer with copyright AND a "view" keyword — bare 2010 is rejected.
        s = self._scope(
            '<footer>page views 0 © 2010 by example</footer>'
        )
        # The "0" is the real (zero) metric; year guard prevents 2010 from
        # being returned as a fallback when 0 already matched.
        assert _extract_metric(s, ["views"]) == 0

    def test_year_guard_skips_bare_year_picks_next_real_metric(self):
        """When the keyword's parent text starts with a copyright year
        followed by a real metric, we should skip the year and return
        the real metric."""
        s = self._scope(
            '<footer>views since © 2010: 4096</footer>'
        )
        assert _extract_metric(s, ["views"]) == 4096

    def test_scoping_prevents_sidebar_leak(self):
        """Container has no metric; sidebar (outside scope) does — must
        return 0 instead of leaking the sidebar value."""
        html = """
        <html><body>
        <article>
            <h1>Real article</h1>
            <p>body</p>
        </article>
        <aside>views 9999</aside>
        </body></html>
        """
        soup = BeautifulSoup(html, "lxml")
        article = soup.find("article")
        assert _extract_metric(article, ["views"]) == 0

    def test_sibling_traversal_still_works(self):
        s = self._scope(
            "<div><span>views</span><span>42</span></div>"
        )
        assert _extract_metric(s, ["views"]) == 42

    def test_skips_script_and_style(self):
        # Pre-existing protection (kissavs `hearts=1` regression).
        s = self._scope(
            '<div><script>"hearts": 1</script><style>.heart{}</style></div>'
        )
        assert _extract_metric(s, ["hearts"]) == 0

    def test_cjk_yi_via_helper(self):
        s = self._scope("<div><span>views 5亿</span></div>")
        assert _extract_metric(s, ["views"]) == 500_000_000


class TestDetailMetricsScopedToContainer:
    """End-to-end: parse_page on a detail page must not pull metrics from
    a sibling sidebar even when the sidebar contains the same keyword."""

    def test_sidebar_views_do_not_leak_into_detail(self):
        html = """
        <html>
        <head>
            <meta property="og:title" content="Real Article">
            <meta property="og:image" content="https://example.com/c.jpg">
        </head>
        <body>
        <article>
            <h1>Real Article</h1>
            <p>views 42</p>
        </article>
        <aside class="sidebar">
            <p>Trending: views 99999</p>
        </aside>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        assert result.page_type == "detail"
        # Container view count, not sidebar.
        assert result.resources[0].views == 42


class TestListPageDetectionGeneralization:
    """Regression: kissavs homepage had 87 image-link cards but only 2
    `.card` widgets (hashtag buttons). The old detector committed to
    the first non-empty tier, so `.card` (2) won over link-cards (87)
    and the page was typed as "list" with only 2 resources returned.
    The updates listing page was misclassified as "detail" because
    `section[class*='content']` matched a page-level header section
    and the page had og:title + h1.

    The generalized detector now:
      - computes article/`.card`/link-card counts up front,
      - treats 12+ repeated cards OR (listing-URL + 6+) as definitive
        "list" BEFORE detail detection,
      - rejects javascript:/# anchors as card candidates.
    """

    GRID_HTML = """\
<html><head><meta property="og:title" content="Grid Page">
<title>Grid</title></head>
<body>
<h1>Grid Page</h1>
<div class="card-widget-a"><img src="/avatar.png"/> Trending</div>
<div class="card-widget-b"><img src="/logo.png"/> Recent</div>
<!-- Widget .card count is 2; grid below is the real content. -->
<div class="grid">
"""+ "".join(
        f'<div class="item"><a href="/video/v{i}/"><img src="/p/{i}.jpg" alt="Video {i} — full title"/></a></div>'
        for i in range(15)
    ) + """
</div>
</body></html>
"""

    LISTING_PATH_HTML = """\
<html><head>
<meta property="og:title" content="Latest Updates | Site">
<title>Updates</title>
</head>
<body>
<section class="content-header"><h1>Latest Updates</h1></section>
<div class="grid">
""" + "".join(
        f'<div class="item"><a href="/video/u{i}/"><img src="/p/{i}.jpg" alt="Update {i}"/></a></div>'
        for i in range(8)
    ) + """
</div>
</body></html>
"""

    LOGIN_POLLUTION_HTML = """\
<html><head><title>Grid</title></head>
<body>
<header>
  <a href="javascript:void(0)" class="bind_login">
    <img src="/avatar.svg" alt="User"/>
    <span>登入</span>
  </a>
</header>
<div class="grid">
""" + "".join(
        f'<div class="item"><a href="/video/g{i}/"><img src="/p/{i}.jpg" alt="Video {i}"/></a></div>'
        for i in range(13)
    ) + """
</div>
</body></html>
"""

    def test_rich_link_cards_beat_sparse_dotcards(self):
        """`.card` count of 2 must not eclipse 15 link-cards."""
        r = parse_page(self.GRID_HTML, "https://example.com/")
        assert r.page_type == "list"
        assert len(r.resources) >= 13, (
            f"Expected ≥13 video resources, got {len(r.resources)}"
        )

    def test_listing_url_lowers_detail_threshold(self):
        """Listing-shaped URL + 8 thumbnails = list, even with og:title + h1."""
        r = parse_page(self.LISTING_PATH_HTML, "https://example.com/av/updates/")
        assert r.page_type == "list"
        assert len(r.resources) == 8

    def test_javascript_anchor_not_treated_as_card(self):
        """Login button with avatar <img> but javascript: href must not
        leak into results."""
        r = parse_page(self.LOGIN_POLLUTION_HTML, "https://example.com/")
        urls = [res.url for res in r.resources]
        assert not any(u.startswith("javascript:") for u in urls)
        # All 13 real video cards should be present.
        assert sum(1 for u in urls if "/video/" in u) == 13

    def test_weak_title_recovers_from_img_alt(self):
        """Banner-carousel cards where the only visible text is a short
        promo ribbon (e.g. '精選') should recover the real title from
        img[alt]."""
        html = """\
<html><head><title>Banner</title></head>
<body>
""" + "".join(
            f'<div class="item"><div class="img-box"><a href="/video/b{i}/">'
            f'<img src="/p/{i}.jpg" alt="Banner {i} — Long Real Title Here"/>'
            f'<div class="ribbon">精選</div></a></div></div>'
            for i in range(10)
        ) + "</body></html>"
        r = parse_page(html, "https://example.com/")
        titles = [res.title for res in r.resources]
        assert "精選" not in titles
        assert any(t.startswith("Banner 0") for t in titles)


class TestListCardDurationTitleRescue:
    """Regression: on kissavs.com, every card had a thumbnail <a> whose
    only visible text was the duration badge (``<span class="label">
    2:06:24</span>``) and a SEPARATE title <a> inside
    ``<h3 class="title">`` in the detail block. The link-card fallback
    picked the thumbnail <a> as the card, so ``a_tag.get_text()``
    became the duration and shipped as the resource title.

    The fix walks up from the thumbnail to sibling links pointing at
    the same URL and reuses their non-duration text as the title.
    """

    HTML = """\
<!DOCTYPE html>
<html><head><title>Video grid</title></head>
<body>
<div class="grid">
    <article class="video-card">
        <div class="img-box"><a href="/video/foo-001/">
            <img src="/p/foo-001.jpg" alt="Foo 001"/>
            <span class="label">2:06:24</span>
        </a></div>
        <div class="detail"><h3 class="title"><a href="/video/foo-001/">Foo 001 — The Real Title</a></h3></div>
    </article>
    <article class="video-card">
        <div class="img-box"><a href="/video/bar-042/">
            <img src="/p/bar-042.jpg" alt="Bar 042"/>
            <span class="label">1:15:03</span>
        </a></div>
        <div class="detail"><h3 class="title"><a href="/video/bar-042/">Bar 042 — Another Title</a></h3></div>
    </article>
    <article class="video-card">
        <div class="img-box"><a href="/video/baz-007/">
            <img src="/p/baz-007.jpg" alt="Baz 007"/>
            <span class="label">58:19</span>
        </a></div>
        <div class="detail"><h3 class="title"><a href="/video/baz-007/">Baz 007 — Short Form</a></h3></div>
    </article>
    <article class="video-card">
        <div class="img-box"><a href="/video/qux-123/">
            <img src="/p/qux.jpg" alt="Qux"/>
            <span class="label">45:30</span>
        </a></div>
        <div class="detail"><h3 class="title"><a href="/video/qux-123/">Qux 123 — Filler</a></h3></div>
    </article>
    <article class="video-card">
        <div class="img-box"><a href="/video/wiz-987/">
            <img src="/p/wiz.jpg" alt="Wiz"/>
            <span class="label">1:05:47</span>
        </a></div>
        <div class="detail"><h3 class="title"><a href="/video/wiz-987/">Wiz 987 — Filler</a></h3></div>
    </article>
</div>
</body></html>
"""

    def test_title_not_duration_hms(self):
        """HH:MM:SS badge must not be picked up as title."""
        r = parse_page(self.HTML, "https://example.com/")
        titles = [res.title for res in r.resources]
        assert "2:06:24" not in titles
        assert "Foo 001 — The Real Title" in titles

    def test_title_not_duration_ms(self):
        """MM:SS badge must not be picked up either."""
        r = parse_page(self.HTML, "https://example.com/")
        titles = [res.title for res in r.resources]
        assert "58:19" not in titles
        assert "Baz 007 — Short Form" in titles

    def test_no_duration_titles_remain(self):
        """Sanity check across all cards."""
        import re
        dur = re.compile(r"^\d{1,2}(?::\d{2}){1,2}$")
        r = parse_page(self.HTML, "https://example.com/")
        assert not [res.title for res in r.resources if dur.fullmatch(res.title)]


class TestKissavsStyleStructuredSite:
    """End-to-end coverage of a site shaped like kissavs.com:

      - No <article>/<main>; main content in <section class="video-info">
      - JSON-LD VideoObject + InteractionCounter(WatchAction, LikeAction)
      - og:title carries an SEO chain (Title｜Section｜Brand)
      - Breadcrumb ends at the current item (self-link)

    Each assertion protects a specific regression observed on the real
    site before the multi-fix landed (page-type fell through to list,
    title was "登入" from a sidebar card, metrics were 0, category was
    the item slug).
    """

    HTML = """\
<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="GRACE-029 诱惑Sweet Room｜角色剧情｜KISSAVS">
<meta property="og:image" content="https://cdn.example.com/grace-029.jpg">
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "VideoObject",
  "name": "GRACE-029 诱惑Sweet Room",
  "interactionStatistic": [
    {"@type": "InteractionCounter",
     "interactionType": {"@type": "WatchAction"},
     "userInteractionCount": 14143},
    {"@type": "InteractionCounter",
     "interactionType": {"@type": "LikeAction"},
     "userInteractionCount": 3096}
  ]
}
</script>
</head>
<body>
<ul class="dx-breadcrumbs">
  <li><a href="/">首页</a></li>
  <li><a href="/av/theme/roleplay/hot/">角色剧情</a></li>
  <li><a href="/video/grace-029/">GRACE-029</a></li>
</ul>
<section class="video-info">
  <h1>GRACE-029 诱惑Sweet Room</h1>
  <svg><use xlink:href="/icons.svg#icon-eye"></use></svg>
  <span class="mr-3">14143</span>
  <button class="btn">
    <span class="mr-2">点赞</span>
    <svg><use xlink:href="/icons.svg#icon-heart"></use></svg>
    <span class="count" id="bind_like_count">3096</span>
  </button>
  <div class="tags h6-md">
    <a href="/av/theme/roleplay/" class="cat">角色剧情</a>
    <a href="/av/tag/%E5%A4%AB%E5%A6%BB/">夫妻</a>
    <a href="/av/tag/%E6%83%85%E8%89%B2/">情色</a>
  </div>
</section>
<script>
  // Script content mentioning "heart" used to crash the keyword
  // heuristic into returning a stray digit as hearts=1.
  var heartConfig = { count: 1 };
</script>
</body>
</html>
"""

    def test_page_type_detail_via_jsonld(self):
        """VideoObject in JSON-LD forces detail classification even
        without <article>/<main>."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        assert r.page_type == "detail"

    def test_section_video_info_used_as_container(self):
        """Main-container fallback picks section[class*='video']."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        # Tags inside <section class="video-info"> are found (scope worked).
        assert set(r.resources[0].tags) == {"夫妻", "情色"}

    def test_views_and_likes_from_jsonld(self):
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        res = r.resources[0]
        assert res.views == 14143
        assert res.likes == 3096

    def test_hearts_not_polluted_by_script_text(self):
        """`<script>` with a 'heart' string in it must not leak a digit
        into hearts — pre-fix this returned 1 from the script body."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        assert r.resources[0].hearts == 0

    def test_title_seo_chain_stripped(self):
        """og:title with 2+ pipes strips the brand tail."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        assert r.resources[0].title == "GRACE-029 诱惑Sweet Room"

    def test_title_preserves_product_code_hyphen(self):
        """Hyphen in 'GRACE-029' must not be treated as a separator."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        assert "GRACE-029" in r.resources[0].title

    def test_breadcrumb_skips_current_item_self_link(self):
        """Last breadcrumb href == current URL path → use the one
        before it as category."""
        r = parse_page(self.HTML, "https://example.com/video/grace-029/")
        assert r.resources[0].category == "角色剧情"


# ---------------------------------------------------------------------------
# Unit 2 — Cover image picker (og → twitter → largest qualifying)
# ---------------------------------------------------------------------------

def _img(html: str):
    return BeautifulSoup(html, "lxml").find("img")


class TestResolveImgSrc:
    def test_data_src_wins_over_src(self):
        i = _img('<img data-src="real.jpg" src="placeholder.gif">')
        assert _resolve_img_src(i) == "real.jpg"

    def test_data_src_wins_over_data_lazy_and_data_original(self):
        # _LAZY_SRC_ATTRS priority: data-src > data-lazy-src > data-original > src
        i = _img(
            '<img data-original="x.jpg" data-lazy-src="y.jpg" '
            'data-src="z.jpg" src="placeholder.gif">'
        )
        assert _resolve_img_src(i) == "z.jpg"

    def test_data_lazy_wins_when_no_data_src(self):
        i = _img('<img data-lazy-src="y.jpg" data-original="x.jpg">')
        assert _resolve_img_src(i) == "y.jpg"

    def test_falls_back_to_src(self):
        i = _img('<img src="real.jpg">')
        assert _resolve_img_src(i) == "real.jpg"

    def test_srcset_picks_largest(self):
        i = _img(
            '<img srcset="small.jpg 320w, medium.jpg 640w, large.jpg 1024w">'
        )
        assert _resolve_img_src(i) == "large.jpg"

    def test_srcset_no_w_descriptors_picks_first(self):
        i = _img('<img srcset="a.jpg, b.jpg">')
        assert _resolve_img_src(i) in ("a.jpg", "b.jpg")

    def test_no_src_returns_empty(self):
        i = _img('<img>')
        assert _resolve_img_src(i) == ""

    def test_whitespace_only_src_returns_empty(self):
        i = _img('<img src="   ">')
        assert _resolve_img_src(i) == ""


class TestImgQualifies:
    @pytest.mark.parametrize("src", [
        "data:image/png;base64,iVBOR...",
        "data:image/gif;base64,R0lGODlh...",
    ])
    def test_data_uri_disqualifies(self, src):
        i = _img('<img>')
        assert _img_qualifies(i, src) is False

    @pytest.mark.parametrize("src", [
        "/static/logo.png",
        "/img/avatar/u123.jpg",
        "/static/icon-fb.svg",
        "/spacer.gif",
        "/assets/placeholder/default.png",
    ])
    def test_icon_url_patterns_disqualify(self, src):
        i = _img('<img>')
        assert _img_qualifies(i, src) is False

    @pytest.mark.parametrize("src", [
        # ce:review autofix: tightened icon regex must NOT reject these
        # legitimate cover slugs that contain the icon-tokens as substrings.
        "/uploads/iconic-art.jpg",
        "/cover/hero-blank-canvas.jpg",  # "blank" no longer in icon list
        "/uploads/pixel-art-cover.png",  # "pixel" no longer in icon list
        "/cover-iconic-photo.jpg",
        "/products/2024-spacers-tutorial-thumb.jpg",  # "spacer" needs token isolation
    ])
    def test_legitimate_cover_slugs_pass(self, src):
        i = _img('<img>')
        assert _img_qualifies(i, src) is True, (
            f"{src} should qualify — icon regex too aggressive"
        )

    def test_small_dimensions_disqualify(self):
        i = _img('<img width="32" height="32">')
        assert _img_qualifies(i, "/real.jpg") is False

    def test_one_axis_large_qualifies(self):
        # Banner-shape image: 1000×40. Qualifies because at least one
        # axis is ≥ _MIN_COVER_DIMENSION.
        i = _img('<img width="1000" height="40">')
        assert _img_qualifies(i, "/real.jpg") is True

    def test_no_dimensions_qualifies(self):
        i = _img('<img>')
        assert _img_qualifies(i, "/real.jpg") is True

    def test_normal_image_qualifies(self):
        i = _img('<img width="800" height="600">')
        assert _img_qualifies(i, "/real.jpg") is True

    def test_empty_src_disqualifies(self):
        assert _img_qualifies(_img('<img>'), "") is False


class TestPickCoverImage:
    def _parse(self, html: str):
        return BeautifulSoup(html, "lxml")

    def test_og_image_wins_over_container_img(self):
        soup = self._parse("""
        <html><head>
            <meta property="og:image" content="https://example.com/cover.jpg">
        </head><body>
            <article><img src="/decoy.jpg"></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/post") \
            == "https://example.com/cover.jpg"

    def test_og_image_data_uri_falls_through(self):
        soup = self._parse("""
        <html><head>
            <meta property="og:image" content="data:image/png;base64,xyz">
        </head><body>
            <article><img src="/real.jpg"></article>
        </body></html>
        """)
        article = soup.find("article")
        result = _pick_cover_image(soup, article, "https://example.com/")
        assert result.endswith("/real.jpg")

    def test_twitter_image_when_no_og_image(self):
        soup = self._parse("""
        <html><head>
            <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
        </head><body>
            <article><img src="/decoy.jpg"></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/") \
            == "https://cdn.example.com/tw.jpg"

    def test_lazy_load_in_container(self):
        soup = self._parse("""
        <html><body>
            <article>
                <img data-src="https://cdn.example.com/real.jpg"
                     src="/spacer.gif">
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/") \
            == "https://cdn.example.com/real.jpg"

    def test_skips_logo_picks_real(self):
        soup = self._parse("""
        <html><body>
            <article>
                <img src="/static/logo.png">
                <img src="/cover-real.jpg">
            </article>
        </body></html>
        """)
        article = soup.find("article")
        result = _pick_cover_image(soup, article, "https://example.com/")
        assert result.endswith("/cover-real.jpg")

    def test_picks_largest_by_dimension(self):
        soup = self._parse("""
        <html><body>
            <article>
                <img src="/small.jpg" width="100" height="100">
                <img src="/big.jpg" width="1200" height="800">
                <img src="/medium.jpg" width="600" height="400">
            </article>
        </body></html>
        """)
        article = soup.find("article")
        result = _pick_cover_image(soup, article, "https://example.com/")
        assert result.endswith("/big.jpg")

    def test_all_disqualified_returns_empty(self):
        soup = self._parse("""
        <html><body>
            <article>
                <img src="/static/logo.png">
                <img src="data:image/gif;base64,R0lG">
                <img src="/avatar/u1.jpg">
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/") == ""

    def test_no_container_no_meta_returns_empty(self):
        soup = self._parse("<html><body></body></html>")
        assert _pick_cover_image(soup, None, "https://example.com/") == ""

    def test_soup_none_skips_meta_step(self):
        """List-card path passes soup=None — only container scan runs,
        page-wide og:image isn't consulted (each card needs its own)."""
        soup = self._parse("""
        <html><head>
            <meta property="og:image" content="https://example.com/page-cover.jpg">
        </head><body>
            <article><img src="/card-cover.jpg"></article>
        </body></html>
        """)
        article = soup.find("article")
        result = _pick_cover_image(None, article, "https://example.com/")
        assert result.endswith("/card-cover.jpg")
        assert "page-cover" not in result

    def test_relative_url_resolved_against_base(self):
        soup = self._parse("""
        <html><body>
            <article><img src="/path/cover.jpg"></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/") \
            == "https://example.com/path/cover.jpg"


class TestDetailCoverIntegration:
    def test_lazy_loaded_detail_cover(self):
        """End-to-end: detail page with lazy-loaded cover gets the real
        image, not the placeholder."""
        html = """
        <html><head>
            <meta property="og:title" content="Real Article">
        </head><body>
        <article>
            <h1>Real Article</h1>
            <img data-src="https://cdn.example.com/real-cover.jpg"
                 src="/spacer.gif">
            <p>body</p>
        </article>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        assert result.resources[0].cover_url == \
            "https://cdn.example.com/real-cover.jpg"

    def test_detail_skips_logo_picks_real(self):
        """Detail page with logo as first <img> picks the real cover."""
        html = """
        <html><head>
            <meta property="og:title" content="Real Article">
        </head><body>
        <article>
            <h1>Real Article</h1>
            <img src="/static/site-logo.png">
            <img src="/uploads/cover.jpg">
            <p>body</p>
        </article>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        assert result.resources[0].cover_url == "https://example.com/uploads/cover.jpg"


# ---------------------------------------------------------------------------
# Unit 3 — Published date precision (CJK + container-scoped + year-guard)
# ---------------------------------------------------------------------------

class TestNormalizeDateTriple:
    def test_pads_single_digit_month_day(self):
        assert _normalize_date_triple(2025, 3, 5) == "2025-03-05"

    def test_two_digit_month_day_unchanged(self):
        assert _normalize_date_triple(2025, 12, 31) == "2025-12-31"

    def test_year_below_1970_rejected(self):
        # ce:review autofix lowered the floor from 1990 → 1970 so digitised
        # pre-1990 archive content survives. 1969 still rejected.
        assert _normalize_date_triple(1969, 6, 15) == ""

    def test_year_at_1970_floor_accepted(self):
        assert _normalize_date_triple(1970, 1, 1) == "1970-01-01"

    def test_year_1989_accepted_after_floor_lowered(self):
        assert _normalize_date_triple(1989, 6, 15) == "1989-06-15"

    def test_year_above_2099_rejected(self):
        assert _normalize_date_triple(2100, 1, 1) == ""

    def test_invalid_month_rejected(self):
        assert _normalize_date_triple(2025, 13, 1) == ""
        assert _normalize_date_triple(2025, 0, 1) == ""

    def test_invalid_day_rejected(self):
        assert _normalize_date_triple(2025, 6, 32) == ""
        assert _normalize_date_triple(2025, 6, 0) == ""


class TestExtractPublishedDate:
    def _parse(self, html: str):
        return BeautifulSoup(html, "lxml")

    def test_iso_datetime_in_container_truncated_to_date(self):
        soup = self._parse("""
        <html><body>
            <article>
                <time datetime="2025-03-15T10:00:00Z">March 15, 2025</time>
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_iso_date_only_in_container(self):
        soup = self._parse("""
        <html><body>
            <article>
                <time datetime="2025-03-15">x</time>
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_meta_article_published_time_used_as_fallback(self):
        soup = self._parse("""
        <html><head>
            <meta property="article:published_time"
                  content="2025-03-15T10:00:00Z">
        </head><body>
            <article><h1>x</h1></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_container_time_wins_over_sidebar_time(self):
        soup = self._parse("""
        <html><body>
            <article>
                <time datetime="2025-03-15">x</time>
            </article>
            <aside>
                <time datetime="2024-01-01">old post</time>
            </aside>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_cjk_format_in_container(self):
        soup = self._parse("""
        <html><body>
            <article>
                <h1>x</h1>
                <p>发布于 2025年3月15日</p>
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_cjk_with_zero_padding(self):
        soup = self._parse("""
        <html><body>
            <article><p>2025年03月05日</p></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-05"

    def test_slash_format_in_container(self):
        soup = self._parse("""
        <html><body>
            <article><p>Posted 2025/3/15</p></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_copyright_footer_year_not_picked(self):
        """Container has no date; copyright in footer (outside container)
        must not be returned. Bare year alone shouldn't match anyway."""
        soup = self._parse("""
        <html><body>
            <article>
                <h1>x</h1>
                <p>body without dates</p>
            </article>
            <footer>© 2010 Example Corp</footer>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == ""

    def test_bare_year_alone_doesnt_match(self):
        """`2025` alone has no month/day — regex requires a triple."""
        soup = self._parse("""
        <html><body>
            <article><p>Year is 2025</p></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == ""

    def test_invalid_date_components_rejected(self):
        """`2025-13-45` has invalid month/day — falls through to next regex."""
        soup = self._parse("""
        <html><body>
            <article><p>Build 2025-13-45 v2</p></article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == ""

    def test_no_date_anywhere_returns_empty(self):
        soup = self._parse("<html><body><article>nothing</article></body></html>")
        article = soup.find("article")
        assert _extract_published_date(soup, article) == ""

    def test_no_container_skips_regex_fallback(self):
        """When _pick_main_container returns None, regex fallback over the
        whole soup is intentionally skipped to avoid copyright noise."""
        soup = self._parse("""
        <html><body>
            <p>2025-03-15</p>
            <footer>© 2010</footer>
        </body></html>
        """)
        # No <article>/<main> means no container; meta + <time> also absent.
        # Even though a date exists in <p>, we don't run regex on the whole
        # document — return empty rather than risk copyright noise.
        assert _extract_published_date(soup, None) == ""

    def test_doc_level_time_used_when_container_has_no_time(self):
        """Container exists but has no <time>; doc-level <time> in header
        is used as the structured fallback before regex."""
        soup = self._parse("""
        <html><body>
            <header>
                <time datetime="2025-03-15">x</time>
            </header>
            <article>
                <h1>x</h1><p>body</p>
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"

    def test_first_match_wins_in_container(self):
        soup = self._parse("""
        <html><body>
            <article>
                <p>Posted 2025-03-15. Updated 2025-04-01.</p>
            </article>
        </body></html>
        """)
        article = soup.find("article")
        assert _extract_published_date(soup, article) == "2025-03-15"


class TestDetailDateRegression:
    """End-to-end: detail page with copyright-only footer must not
    return the copyright year as published_at."""

    def test_copyright_footer_does_not_pollute_published_at(self):
        html = """
        <html><head>
            <meta property="og:title" content="Real Article">
        </head><body>
        <article>
            <h1>Real Article</h1>
            <p>body without dates</p>
        </article>
        <footer>© 2010 Example Corp — All rights reserved</footer>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        # Pre-fix: returned "2010" via global regex. Now: empty.
        assert result.resources[0].published_at == ""

    def test_cjk_date_round_trip_through_parse_page(self):
        html = """
        <html><head>
            <meta property="og:title" content="Real Article">
        </head><body>
        <article>
            <h1>Real Article</h1>
            <p>发布日期：2025年3月15日</p>
        </article>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        assert result.resources[0].published_at == "2025-03-15"


# ---------------------------------------------------------------------------
# ce:review autofix — bugs caught by reviewer pass on Units 1–3
# ---------------------------------------------------------------------------

class TestExtractMetricSharedParentBug:
    """F1 (P0): when multiple metric keywords share a parent, each keyword
    must anchor its OWN number — not collapse to the first match."""

    def test_views_likes_hearts_in_one_span_return_distinct_numbers(self):
        s = BeautifulSoup(
            "<div><span>views 1234 likes 5678 hearts 12</span></div>",
            "lxml",
        )
        assert _extract_metric(s, ["views"]) == 1234
        assert _extract_metric(s, ["likes"]) == 5678
        assert _extract_metric(s, ["hearts"]) == 12

    def test_number_before_keyword_still_works(self):
        # `12.3K views` — number lives BEFORE keyword. After-then-before
        # slice covers this shape.
        s = BeautifulSoup("<div><span>12.3K views</span></div>", "lxml")
        assert _extract_metric(s, ["views"]) == 12300

    def test_after_keyword_wins_when_both_sides_have_numbers(self):
        # The canonical "label: value" reading order has number after the
        # keyword, so it should beat a stray number to the left.
        s = BeautifulSoup(
            "<div><span>1234 — views 9999</span></div>", "lxml",
        )
        assert _extract_metric(s, ["views"]) == 9999


class TestExtractMetricSiblingYearLeak:
    """F2 (P1): year_guard must be recomputed (or OR'd) per sibling so a
    sibling whose own text is © 2010 doesn't leak the year."""

    def test_sibling_with_copyright_does_not_leak_year(self):
        s = BeautifulSoup(
            '<div><span>views</span><span>© 2010 Example</span></div>',
            "lxml",
        )
        assert _extract_metric(s, ["views"]) == 0

    def test_sibling_traversal_capped(self):
        # Far-downstream siblings should not be considered. Build a parent
        # with > _METRIC_SIBLING_CAP empty siblings and one number at the end.
        siblings = "".join(
            f'<span>noise{i}</span>' for i in range(_METRIC_SIBLING_CAP + 2)
        )
        html = f'<div><span>views</span>{siblings}<span>9999</span></div>'
        s = BeautifulSoup(html, "lxml")
        # Far-end 9999 is past the cap → returns 0.
        assert _extract_metric(s, ["views"]) == 0


class TestResolveImgSrcLazySrcsetPriority:
    """F6 (P1): when a placeholder lives in `src` and the real image is in
    `srcset`, srcset must win over plain src (but explicit lazy attrs still
    win over srcset)."""

    def test_srcset_beats_plain_src(self):
        i = _img(
            '<img src="placeholder.gif" '
            'srcset="real-1024w.jpg 1024w, real-640w.jpg 640w">'
        )
        assert _resolve_img_src(i) == "real-1024w.jpg"

    def test_data_src_beats_srcset(self):
        # Explicit lazy attr is the strongest signal — overrides srcset.
        i = _img(
            '<img data-src="lazy-real.jpg" '
            'srcset="something.jpg 1024w" src="placeholder.gif">'
        )
        assert _resolve_img_src(i) == "lazy-real.jpg"

    def test_density_descriptor_2x_picked_over_1x(self):
        # 2x descriptor maps to ordinal score and beats unspecified.
        i = _img('<img srcset="img.jpg, img-2x.jpg 2x, img-3x.jpg 3x">')
        assert _resolve_img_src(i) == "img-3x.jpg"

    def test_negative_width_skipped(self):
        i = _img('<img srcset="real.jpg 1024w, decoy.jpg -100w">')
        assert _resolve_img_src(i) == "real.jpg"


class TestPickCoverZeroAreaTiebreaker:
    """Correctness #5 (P2): when multiple qualifying images all have no
    declared dimensions, prefer the LAST one (later = closer to the real
    cover; first = often byline avatar / decorative top image)."""

    def test_zero_area_tie_picks_last(self):
        soup = BeautifulSoup("""
        <html><body><article>
            <img src="byline-avatar-no-size.jpg">
            <img src="decorative-divider.jpg">
            <img src="real-cover.jpg">
        </article></body></html>
        """, "lxml")
        article = soup.find("article")
        assert _pick_cover_image(soup, article, "https://example.com/") == \
            "https://example.com/real-cover.jpg"


class TestJsonLdZeroNotOverridden:
    """Correctness #2 (P1): JSON-LD-declared `0` is a real signal, not a
    fallback trigger. The detail extractor must distinguish "no JSON-LD
    metric" from "JSON-LD said 0"."""

    def test_jsonld_zero_views_not_overridden_by_dom(self):
        html = """
        <html>
        <head>
            <meta property="og:title" content="Real Article">
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "interactionStatistic": [
                {"@type": "InteractionCounter",
                 "interactionType": "https://schema.org/WatchAction",
                 "userInteractionCount": 0}
              ]
            }
            </script>
        </head>
        <body>
            <article>
                <h1>Real Article</h1>
                <p>views 9999</p>
            </article>
        </body></html>
        """
        result = parse_page(html, "https://example.com/post/1")
        # JSON-LD said 0 explicitly; DOM scan must not override it.
        assert result.resources[0].views == 0


class TestIsoDateRegexNoTrailingBoundary:
    """Correctness #3 (P2): `_DATE_ISO_RE` previously had a trailing `\\b`
    that failed when ISO-T was followed by a non-bracket char like `Tabc`.
    Now matches up to the optional time block then stops (no boundary)."""

    def test_iso_followed_by_unexpected_char_still_matches_date(self):
        soup = BeautifulSoup(
            '<html><body><article>'
            '<time datetime="2025-03-15Tweird-suffix">x</time>'
            '</article></body></html>',
            "lxml",
        )
        article = soup.find("article")
        # Date portion still extracts cleanly even when the time-tail is junk.
        assert _extract_published_date(soup, article) == "2025-03-15"


class TestMetricSiblingCapBoundary:
    """Maintainability F3: assert against the constant, not a hardcoded
    number, so the test tracks if someone bumps _METRIC_SIBLING_CAP."""

    def test_traversal_uses_constant(self):
        # Cap+1 inline siblings; the metric in the (cap+2)-th is unreachable.
        sibs = "".join(
            f'<span>x{i}</span>' for i in range(_METRIC_SIBLING_CAP)
        )
        html = f'<div><span>views</span>{sibs}<span>9999</span></div>'
        s = BeautifulSoup(html, "lxml")
        assert _extract_metric(s, ["views"]) == 0
