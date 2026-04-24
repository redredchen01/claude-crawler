
"""Tests for P1 Unit 6: Smart page detection heuristics.

Tests verify should_render() correctly identifies:
- SPA shells: small HTML + module script or empty body
- Small HTML: under 20KB (conservative default: render)
- Missing metadata: no critical meta tags
- Static sites: >20KB + rich metadata
"""

from __future__ import annotations


from crawler.page_detector import should_render


class TestSPAShellDetection:
    """Detect SPA shells: small HTML + module script or empty body."""

    def test_detects_module_script(self):
        """SPA with module script → should_render=True, reason='spa_shell'."""
        html = """<html>
            <head>
                <title>App</title>
                <script type="module" src="app.js"></script>
            </head>
            <body><div id="root"></div></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True
        assert reason == "spa_shell"

    def test_detects_empty_body(self):
        """SPA with empty body → should_render=True, reason='spa_shell'."""
        html = """<html>
            <head>
                <title>React App</title>
            </head>
            <body></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True
        assert reason in ("spa_shell", "small_html")  # <10KB qualifies as both

    def test_detects_minimal_body_content(self):
        """SPA with minimal body content → should_render=True."""
        html = """<html>
            <head>
                <title>Next.js App</title>
                <script src="next.js"></script>
            </head>
            <body><div id="__next"></div></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True


class TestSizeHeuristics:
    """Test HTML size thresholds for render decisions."""

    def test_small_html_with_content(self):
        """HTML <10KB with body content → no render indicator (rely on needs_js_rendering)."""
        html = "<html><body>" + "x" * 5000 + "</body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        # No clear SPA indicator, so no_indicator (falls back to needs_js_rendering)
        assert should_render_result is False
        assert reason == "no_indicator"

    def test_very_small_empty_html(self):
        """HTML <5KB with empty body → should_render=True (SPA shell)."""
        html = "<html><head><title>App</title></head><body></body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True
        assert reason == "spa_shell"

    def test_large_html_over_20kb_with_metadata(self):
        """HTML >20KB + metadata → should_render=False."""
        html = f"""<html>
            <head>
                <meta property="og:title" content="Title" />
                <meta property="og:description" content="Description" />
                <meta property="og:image" content="image.jpg" />
                <meta name="description" content="Meta description" />
            </head>
            <body>{"x" * 25000}</body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False
        assert reason == "static"

    def test_medium_html_without_metadata(self):
        """HTML 10-20KB without metadata → no indicator (needs_js_rendering decides)."""
        html = "<html><body>" + "x" * 15000 + "</body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False
        assert reason == "no_indicator"

    def test_empty_html(self):
        """Empty HTML → no render indicator."""
        html = ""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False
        assert reason == "no_indicator"


class TestMetadataDetection:
    """Test critical metadata detection."""

    def test_missing_critical_metadata(self):
        """HTML without critical meta tags → should_render=True."""
        html = """<html>
            <head><title>Page</title></head>
            <body><p>Content</p></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True

    def test_rich_metadata_present(self):
        """HTML with rich metadata → consider static."""
        html = f"""<html>
            <head>
                <meta property="og:title" content="Title" />
                <meta property="og:description" content="Description" />
                <meta property="og:image" content="image.jpg" />
                <meta property="twitter:card" content="summary_large_image" />
            </head>
            <body>{"x" * 25000}</body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False

    def test_partial_metadata(self):
        """HTML with 2 meta tags (under threshold) → should_render."""
        html = """<html>
            <head>
                <meta property="og:title" content="Title" />
                <meta property="og:image" content="image.jpg" />
            </head>
            <body>Content</body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True


class TestIntegration:
    """End-to-end scenarios matching real-world patterns."""

    def test_instagram_style_spa(self):
        """Instagram SPA: shell + bootstrap → should_render=True."""
        html = """<html>
            <head>
                <title>Instagram</title>
                <script type="module">/* app bootstrap */</script>
            </head>
            <body><div id="root"></div></body>
        </html>"""

        should_render_result, reason = should_render(
            html, "https://instagram.com/user/post"
        )

        assert should_render_result is True
        assert reason == "spa_shell"

    def test_static_blog(self):
        """Static blog: >20KB + rich metadata → should_render=False."""
        html = f"""<html>
            <head>
                <meta property="og:title" content="Blog Post Title" />
                <meta property="og:description" content="This is a detailed blog post description about the topic" />
                <meta property="og:image" content="https://example.com/post-image.jpg" />
                <meta property="twitter:card" content="summary_large_image" />
                <meta name="description" content="Post description for search engines" />
            </head>
            <body>
                <article>
                    <h1>Blog Post Title</h1>
                    <p>This is the full blog post content with many paragraphs...</p>
                    {"<p>More content...</p>" * 1000}
                </article>
            </body>
        </html>"""

        should_render_result, reason = should_render(
            html, "https://blog.example.com/post"
        )

        assert should_render_result is False
        assert reason == "static"

    def test_minimal_html(self):
        """Minimal HTML: <5KB → should_render=True."""
        html = "<html><body>Hello</body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True
        assert reason == "spa_shell"  # < 5KB with minimal body text

    def test_unicode_html(self):
        """Unicode content → heuristics work correctly."""
        html = """<html>
            <head>
                <title>中文页面</title>
                <meta property="og:title" content="页面标题" />
            </head>
            <body>内容</body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com/cn")

        assert should_render_result is True

    def test_malformed_html(self):
        """Malformed HTML → graceful handling."""
        html = "<html><body><p>Unclosed<body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True  # Small & malformed → render
        assert isinstance(reason, str)


class TestEdgeCases:
    """Boundary conditions and edge cases."""

    def test_html_with_only_whitespace(self):
        """HTML with only whitespace → should_render=True."""
        html = "   \n\n   "

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True

    def test_html_with_many_script_tags(self):
        """High script density → may trigger module detection."""
        html = """<html>
            <head>
                <script>/* inline 1 */</script>
                <script>/* inline 2 */</script>
                <script src="lib1.js"></script>
                <script src="lib2.js"></script>
                <script type="module" src="app.js"></script>
            </head>
            <body><div id="root"></div></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True
        assert reason == "spa_shell"

    def test_html_with_json_ld(self):
        """HTML with JSON-LD (no og tags) → conservative: render."""
        html = """<html>
            <head>
                <script type="application/ld+json">{"@context": "https://schema.org"}</script>
            </head>
            <body><article>Content</article></body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is True  # No OG tags → render

    def test_large_static_without_metadata(self):
        """Large HTML but no metadata → conservative: don't render."""
        html = "<html><body>" + "x" * 25000 + "</body></html>"

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False  # Large without metadata → no render
        assert reason == "no_indicator"  # Falls back to needs_js_rendering

    def test_case_insensitive_detection(self):
        """Meta tag detection is case-insensitive."""
        html = f"""<html>
            <head>
                <META PROPERTY="OG:TITLE" CONTENT="Title" />
                <meta property="OG:DESCRIPTION" content="Desc" />
                <Meta Property="og:image" Content="img.jpg" />
                <META NAME="DESCRIPTION" CONTENT="Description" />
            </head>
            <body>{"x" * 25000}</body>
        </html>"""

        should_render_result, reason = should_render(html, "https://example.com")

        assert should_render_result is False
        assert reason == "static"
