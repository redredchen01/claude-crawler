"""Tests for crawler.parser module."""

import pytest

from bs4 import BeautifulSoup

from crawler.parser import parse_page, _extract_detail_resource, _pick_main_container


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

from crawler.parser import _extract_metric, _parse_metric_number


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
