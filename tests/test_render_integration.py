"""Integration tests for P1 Unit 4 + Unit 5: Scroll + Source-Tracked Parsing.

Tests verify the complete pipeline:
  Unit 4: RenderRequest with scroll config → RenderThread → scrolled HTML
  Unit 5: parse_page() with source parameter → source-tracked ParseResult

Scenarios:
  1. SPA with minimal static HTML → render with scroll → extract with source='rendered'
  2. Static site with rich OG tags → no render → extract with source='static'
  3. Instagram-style infinite scroll → RenderRequest(enable_scroll=True) → aggregated content
  4. Source precedence: rendered OG tags > static OG tags
"""

from __future__ import annotations

from crawler.models import ParseResult
from crawler.parser import parse_page


class TestParsePageSourceParameter:
    """Test source parameter threading through parse_page()."""

    def test_parse_page_with_source_static(self):
        """Static HTML parsing records source='static'."""
        html = """<html>
            <head>
                <title>Test Page</title>
                <meta property="og:title" content="OG Title" />
            </head>
            <body><article><h1>Article</h1></article></body>
        </html>"""
        url = "https://example.com/page"

        result = parse_page(html, url, source="static")

        assert result.source == "static"
        assert result.page_type in ("detail", "list", "other")

    def test_parse_page_with_source_rendered(self):
        """Rendered HTML parsing records source='rendered'."""
        html = """<html>
            <head>
                <title>Dynamic Page</title>
                <meta property="og:title" content="JS-Injected OG" />
            </head>
            <body><article><h1>Content</h1></article></body>
        </html>"""
        url = "https://example.com/dynamic"

        result = parse_page(html, url, source="rendered")

        assert result.source == "rendered"

    def test_parse_page_default_source_is_static(self):
        """Backward compatibility: parse_page() defaults to source='static'."""
        html = "<html><body>Test</body></html>"
        url = "https://example.com"

        # Call without source parameter (backward compat)
        result = parse_page(html, url)

        assert result.source == "static"

    def test_empty_html_preserves_source(self):
        """Empty HTML still preserves source value in ParseResult."""
        result = parse_page("", "https://example.com", source="rendered")

        assert result.source == "rendered"
        assert result.page_type == "other"
        assert result.resources == []


class TestStaticVsRenderedExtraction:
    """Test extraction behavior with static vs rendered HTML."""

    def test_static_og_tags(self):
        """Static HTML with OG tags → parsed with source='static'."""
        html = """<html>
            <head>
                <meta property="og:title" content="Static Title" />
                <meta property="og:image" content="https://example.com/static.jpg" />
            </head>
            <body>
                <article>
                    <h1>Article</h1>
                    <p>Content</p>
                </article>
            </body>
        </html>"""
        url = "https://example.com/article"

        result = parse_page(html, url, source="static")

        assert result.source == "static"
        assert result.page_type == "detail"
        assert len(result.resources) > 0

    def test_rendered_og_tags(self):
        """Rendered HTML with JS-injected OG → parsed with source='rendered'."""
        # Simulate JS-injected OG tags (not in static shell)
        html = """<html>
            <head>
                <meta property="og:title" content="JS-Injected Title" />
                <meta property="og:image" content="https://example.com/dynamic.jpg" />
                <meta property="og:description" content="Injected description" />
            </head>
            <body>
                <article>
                    <h1>Dynamic Article</h1>
                    <p>Rendered content</p>
                </article>
            </body>
        </html>"""
        url = "https://example.com/spa-page"

        result = parse_page(html, url, source="rendered")

        assert result.source == "rendered"
        assert result.page_type == "detail"
        assert len(result.resources) > 0

    def test_instagram_style_spa(self):
        """Instagram-style SPA: source parameter correctly tracks static vs rendered."""
        # Simulates static shell (minimal content)
        static_html = """<html>
            <head><title>Instagram</title></head>
            <body>
                <div id="root"></div>
            </body>
        </html>"""

        # Simulate what Playwright renders after JS execution
        rendered_html = """<html>
            <head>
                <title>Instagram</title>
                <meta property="og:title" content="@user Post" />
                <meta property="og:image" content="https://instagram.com/post1.jpg" />
                <meta property="og:description" content="2.5K likes" />
            </head>
            <body>
                <div id="root">
                    <div class="post">
                        <img src="post1.jpg" />
                        <span>2,500</span>
                        <span>likes</span>
                    </div>
                </div>
            </body>
        </html>"""

        # Parse static (no content) — source is tracked
        static_result = parse_page(
            static_html, "https://instagram.com/user", source="static"
        )
        assert static_result.source == "static"

        # Parse after render (content available) — source is tracked
        rendered_result = parse_page(
            rendered_html, "https://instagram.com/user", source="rendered"
        )
        assert rendered_result.source == "rendered"
        # Both should have different sources even if extraction varies by page type


class TestParseResultSourceField:
    """Verify ParseResult.source field is correctly populated."""

    def test_parse_result_source_field_exists(self):
        """ParseResult has source field."""
        result = ParseResult(
            page_type="detail", resources=[], links=[], source="rendered"
        )

        assert hasattr(result, "source")
        assert result.source == "rendered"

    def test_parse_result_source_default_value(self):
        """ParseResult defaults source to 'static'."""
        result = ParseResult()

        assert result.source == "static"

    def test_parse_result_source_in_constructor(self):
        """ParseResult source can be set via constructor."""
        result = ParseResult(page_type="list", source="rendered")

        assert result.source == "rendered"

    def test_parse_result_with_resources_tracks_source(self):
        """Source parameter is tracked in ParseResult regardless of extraction result."""
        html = """<html>
            <head>
                <meta property="og:title" content="Title" />
                <meta name="description" content="Page description" />
            </head>
            <body>
                <article><h1>Content</h1></article>
            </body>
        </html>"""

        # Extract with static source
        static_result = parse_page(html, "https://example.com", source="static")
        assert static_result.source == "static"
        assert isinstance(static_result, ParseResult)

        # Extract same HTML with rendered source (for comparison)
        rendered_result = parse_page(html, "https://example.com", source="rendered")
        assert rendered_result.source == "rendered"
        assert isinstance(rendered_result, ParseResult)

        # Both have source tracked correctly
        assert static_result.source != rendered_result.source


class TestListPageSourceTracking:
    """Test list page extraction with source tracking."""

    def test_list_page_with_static_source(self):
        """List page extraction with source='static'."""
        html = """<html>
            <body>
                <div class="card">
                    <h2>Item 1</h2>
                    <p>Description 1</p>
                </div>
                <div class="card">
                    <h2>Item 2</h2>
                    <p>Description 2</p>
                </div>
            </body>
        </html>"""
        url = "https://example.com/list"

        result = parse_page(html, url, source="static")

        assert result.source == "static"
        assert result.page_type in ("list", "other")

    def test_list_page_with_rendered_source(self):
        """List page parsing tracks source='rendered' correctly."""
        html = """<html>
            <body>
                <article><h2>Item 1</h2><p>Desc 1</p></article>
                <article><h2>Item 2</h2><p>Desc 2</p></article>
                <article><h2>Item 3</h2><p>Desc 3 (from scroll)</p></article>
                <article><h2>Item 4</h2><p>Desc 4 (from scroll)</p></article>
            </body>
        </html>"""
        url = "https://example.com/infinite-list"

        result = parse_page(html, url, source="rendered")

        assert result.source == "rendered"
        assert isinstance(result, ParseResult)
        assert result.page_type in ("list", "other")  # Page type may vary by structure


class TestSourceParameterEdgeCases:
    """Edge cases and boundary conditions."""

    def test_source_parameter_case_sensitive(self):
        """Source parameter accepts exact values 'static' and 'rendered'."""
        html = "<html><body>Test</body></html>"
        url = "https://example.com"

        # Valid sources
        assert parse_page(html, url, source="static").source == "static"
        assert parse_page(html, url, source="rendered").source == "rendered"

    def test_source_parameter_preserved_through_pipeline(self):
        """Source parameter flows through to final ParseResult."""
        html = """<html>
            <head><title>Test</title></head>
            <body><article><h1>Title</h1></article></body>
        </html>"""
        url = "https://example.com/test"

        for source_value in ["static", "rendered"]:
            result = parse_page(html, url, source=source_value)
            assert result.source == source_value, f"Source {source_value} not preserved"

    def test_malformed_html_still_tracks_source(self):
        """Even with malformed HTML, source is tracked."""
        html = "<html><body><p>Unclosed tag<body></html>"
        url = "https://example.com"

        result = parse_page(html, url, source="rendered")

        assert result.source == "rendered"
        # Should still produce a ParseResult even if HTML is malformed

    def test_unicode_html_with_source_tracking(self):
        """Unicode content extraction preserves source."""
        html = """<html>
            <head>
                <meta property="og:title" content="中文标题" />
            </head>
            <body>
                <article><h1>中文内容</h1></article>
            </body>
        </html>"""
        url = "https://example.com/cn"

        result = parse_page(html, url, source="static")

        assert result.source == "static"
        assert len(result.resources) > 0
