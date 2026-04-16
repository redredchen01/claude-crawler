"""Tests for crawler core: frontier, fetcher, engine."""

import queue
import tempfile
import os

import pytest
from unittest.mock import patch, MagicMock

from crawler.core.frontier import Frontier
from crawler.core.fetcher import needs_js_rendering
from crawler.core.engine import run_crawl
from crawler.parser import parse_page


# ── Frontier Tests ──


class TestFrontierBFS:
    def test_bfs_order(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/a", 1)
        f.push("https://example.com/b", 1)
        url1, d1 = f.pop()  # seed
        assert url1 == "https://example.com/"
        assert d1 == 0
        url2, _ = f.pop()
        url3, _ = f.pop()
        assert url2 == "https://example.com/a"
        assert url3 == "https://example.com/b"

    def test_pop_empty(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.pop()  # consume seed
        assert f.pop() is None


class TestFrontierDomainFilter:
    def test_reject_different_domain(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://other.com/page", 1)
        f.pop()  # seed
        assert f.pop() is None

    def test_accept_same_domain(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page", 1)
        f.pop()  # seed
        result = f.pop()
        assert result is not None
        assert "example.com" in result[0]


class TestFrontierDepthLimit:
    def test_reject_over_max_depth(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=2)
        f.push("https://example.com/deep", 3)
        f.pop()  # seed
        assert f.pop() is None

    def test_accept_at_max_depth(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=2)
        f.push("https://example.com/ok", 2)
        f.pop()  # seed
        assert f.pop() is not None


class TestFrontierMaxPages:
    def test_stop_at_max_pages(self):
        f = Frontier("https://example.com", max_pages=2, max_depth=5)
        f.push("https://example.com/a", 1)
        # visited = {seed, /a} = 2, which is max_pages
        f.push("https://example.com/b", 1)  # should be rejected
        f.pop()  # seed
        f.pop()  # /a
        assert f.pop() is None


class TestFrontierDuplicates:
    def test_reject_duplicate_url(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/a", 1)
        f.push("https://example.com/a", 1)  # duplicate
        f.pop()  # seed
        f.pop()  # /a
        assert f.pop() is None


class TestFrontierNormalization:
    def test_strip_fragment(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page#section", 1)
        f.pop()  # seed
        url, _ = f.pop()
        assert "#" not in url

    def test_trailing_slash_dedup(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page/", 1)
        f.push("https://example.com/page", 1)  # same after normalization
        f.pop()  # seed
        f.pop()  # /page
        assert f.pop() is None

    def test_skip_extensions(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/image.jpg", 1)
        f.push("https://example.com/style.css", 1)
        f.push("https://example.com/file.pdf", 1)
        f.pop()  # seed
        assert f.pop() is None


class TestFrontierVisitedCount:
    def test_visited_count(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        assert f.visited_count == 1  # seed
        f.push("https://example.com/a", 1)
        assert f.visited_count == 2


class TestFrontierIsDone:
    def test_done_when_empty(self):
        f = Frontier("https://example.com", max_pages=100, max_depth=3)
        f.pop()
        assert f.is_done()

    def test_done_when_max_pages_and_drained(self):
        f = Frontier("https://example.com", max_pages=1, max_depth=3)
        f.pop()  # drain the seed
        # queue empty, no more URLs can be pushed (max_pages reached)
        f.push("https://example.com/a", 1)  # rejected by max_pages
        assert f.is_done()


# ── Fetcher Tests ──


class TestNeedsJsRendering:
    def test_short_body_returns_true(self):
        html = "<html><body>short</body></html>"
        assert needs_js_rendering(html) is True

    def test_next_data_marker(self):
        body_text = "x" * 2000
        html = f'<html><body>{body_text}</body><script id="__NEXT_DATA__"></script></html>'
        assert needs_js_rendering(html) is True

    def test_react_root_marker(self):
        body_text = "x" * 2000
        html = f'<html><body><div data-reactroot="">{body_text}</div></body></html>'
        assert needs_js_rendering(html) is True

    def test_nuxt_marker(self):
        body_text = "x" * 2000
        html = f'<html><body>{body_text}</body><script>window.__nuxt__</script></html>'
        # __nuxt is substring of __nuxt__
        assert needs_js_rendering(html) is True

    def test_normal_html_returns_false(self):
        body_text = "This is a normal page with plenty of content. " * 100
        html = f"<html><body><p>{body_text}</p></body></html>"
        assert needs_js_rendering(html) is False

    def test_no_body_tag_short_content(self):
        html = "<html>short</html>"
        assert needs_js_rendering(html) is True


# ── Extract Links Tests ──


class TestExtractLinks:
    def test_extracts_absolute_links(self):
        html = '<html><body><a href="https://example.com/page">link</a></body></html>'
        result = parse_page(html, "https://example.com/")
        assert "https://example.com/page" in result.links

    def test_resolves_relative_links(self):
        html = '<html><body><a href="/about">link</a></body></html>'
        result = parse_page(html, "https://example.com/page")
        assert "https://example.com/about" in result.links

    def test_no_links(self):
        html = "<html><body>no links</body></html>"
        result = parse_page(html, "https://example.com/")
        assert result.links == []


# ── Engine Tests ──


MOCK_HTML = """
<html>
<body>
<p>{content}</p>
<a href="{link}">Next</a>
</body>
</html>
"""


class TestEngine:
    def _make_html(self, content: str, link: str = "") -> str:
        body = content * 300  # ensure long enough to pass JS rendering check (>1024 chars)
        if link:
            return f'<html><body><p>{body}</p><a href="{link}">Next</a></body></html>'
        return f"<html><body><p>{body}</p></body></html>"

    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_basic_crawl(self, mock_sleep, mock_fetch):
        html_seed = self._make_html("seed page", "https://example.com/page2")
        html_page2 = self._make_html("page two")
        mock_fetch.side_effect = [html_seed, html_page2]

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl(
                "https://example.com",
                db_path,
                max_pages=5,
                max_depth=2,
                rate_limit=0,
            )
            assert job_id is not None
            assert mock_fetch.call_count == 2

    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_progress_queue(self, mock_sleep, mock_fetch):
        html = self._make_html("content only")
        mock_fetch.return_value = html

        pq = queue.Queue()
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl("https://example.com", db_path, max_pages=1, rate_limit=0, progress_queue=pq)

        messages = []
        while not pq.empty():
            messages.append(pq.get())

        assert len(messages) >= 1
        assert messages[-1]["status"] == "completed"

    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_respects_max_pages(self, mock_sleep, mock_fetch):
        """Engine stops after max_pages."""
        mock_fetch.return_value = self._make_html("page", "https://example.com/next")

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl("https://example.com", db_path, max_pages=2, rate_limit=0)
            assert mock_fetch.call_count <= 2

    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_handles_fetch_failure(self, mock_sleep, mock_fetch):
        mock_fetch.return_value = None

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl("https://example.com", db_path, max_pages=1, rate_limit=0)
            assert job_id is not None

    @patch("crawler.core.engine._check_robots", return_value=True)
    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_scan_job_completed(self, mock_sleep, mock_fetch, mock_robots):
        mock_fetch.return_value = self._make_html("done")

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl("https://example.com", db_path, max_pages=5, rate_limit=0)

            from crawler.storage import get_scan_job
            job = get_scan_job(db_path, job_id)
            assert job.status == "completed"
            assert job.pages_scanned >= 1

    @patch("crawler.core.engine._check_robots", return_value=True)
    @patch("crawler.core.engine.fetch_page")
    @patch("crawler.core.engine.time.sleep")
    def test_resources_persisted_after_crawl(self, mock_sleep, mock_fetch, mock_robots):
        """Crawled detail pages should have resources saved to DB."""
        html = (
            '<html><head><meta property="og:title" content="Test Article"></head>'
            '<body><article><h1>Test Article</h1>'
            '<p>' + 'content ' * 200 + '</p>'
            '<a rel="tag">python</a><a rel="tag">web</a>'
            '<span>views 1234</span>'
            '</article></body></html>'
        )
        mock_fetch.return_value = html

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl("https://example.com/post/123", db_path, max_pages=1, rate_limit=0)

            from crawler.storage import get_scan_job, get_resources
            job = get_scan_job(db_path, job_id)
            assert job.resources_found >= 1

            resources = get_resources(db_path, job_id)
            assert len(resources) >= 1
            assert resources[0].title == "Test Article"
            assert "python" in resources[0].tags


class TestRobotsTxt:
    def test_empty_entries_allows_crawl(self):
        """robots.txt returning 403/404 (empty entries) should allow crawling."""
        from crawler.core.engine import _check_robots

        cache: dict = {}
        # Mock RobotFileParser.read() to produce empty entries (simulates 403)
        with patch("crawler.core.engine.RobotFileParser") as MockRP:
            rp_instance = MockRP.return_value
            rp_instance.entries = []  # empty = 403/404 response
            rp_instance.read.return_value = None

            allowed = _check_robots("https://example.com/page", cache, "TestBot/1.0")
            assert allowed is True
            assert cache.get("example.com") is None  # cached as None = allow all

    def test_valid_entries_respected(self):
        """Valid robots.txt with disallow rules should be enforced."""
        from crawler.core.engine import _check_robots
        from urllib.robotparser import RobotFileParser

        cache: dict = {}
        with patch("crawler.core.engine.RobotFileParser") as MockRP:
            rp_instance = MockRP.return_value
            rp_instance.entries = ["non-empty"]  # has valid entries
            rp_instance.read.return_value = None
            rp_instance.can_fetch.return_value = False

            allowed = _check_robots("https://example.com/blocked", cache, "TestBot/1.0")
            assert allowed is False
