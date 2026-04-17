"""Tests for crawler core: frontier, fetcher, engine."""

import queue
import tempfile
import threading
import os

import pytest
from unittest.mock import patch, MagicMock

from crawler.core.frontier import Frontier
from crawler.core.fetcher import needs_js_rendering
from crawler.core.engine import run_crawl
from crawler.core.writer import WriterThread
from crawler.parser import parse_page


# ── Frontier Tests ──


def _fake_writer():
    """MagicMock writer that hands out incrementing page_ids on
    insert_pages_batch. Used by Frontier-only unit tests so they don't need
    a real WriterThread."""
    from itertools import count
    from unittest.mock import MagicMock
    writer = MagicMock()
    counter = count(start=1)

    def fake_batch(scan_job_id, items):
        return [next(counter) for _ in items]

    writer.insert_pages_batch.side_effect = fake_batch
    return writer


def _make_frontier(seed_url: str, max_pages: int = 100, max_depth: int = 3,
                   *, auto_seed: bool = True):
    """Construct a Frontier with a fake writer for unit testing.

    Back-compat shim: wraps push() to auto-flush and pop() to return
    2-tuples, preserving the pre-batch Frontier API used by ~17 inherited
    unit tests (TestFrontierBFS, TestFrontierDomainFilter, etc.). New
    tests should construct ``Frontier`` directly and assert on 3-tuple pop
    results — see TestFrontierWriterMode for the canonical pattern. This
    shim exists to avoid a 17-test rewrite during B5 and is a candidate
    for removal once those tests migrate.
    """
    f = Frontier(
        seed_url, max_pages=max_pages, max_depth=max_depth,
        writer=_fake_writer(), scan_job_id=1, auto_seed=auto_seed,
    )
    real_push = f.push

    def auto_flush_push(url, depth):
        real_push(url, depth)
        f.flush_batch()

    f.push = auto_flush_push  # type: ignore[method-assign]

    # Also wrap pop to return 2-tuples for back-compat with the legacy
    # tests' unpacking. Tests that explicitly want page_id use
    # TestFrontierWriterMode (which calls Frontier directly).
    real_pop = f.pop

    def two_tuple_pop():
        item = real_pop()
        if item is None:
            return None
        url, depth, _page_id = item
        return (url, depth)

    f.pop = two_tuple_pop  # type: ignore[method-assign]
    return f


class TestFrontierBFS:
    def test_bfs_order(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
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
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.pop()  # consume seed
        assert f.pop() is None


class TestFrontierDomainFilter:
    def test_reject_different_domain(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://other.com/page", 1)
        f.pop()  # seed
        assert f.pop() is None

    def test_accept_same_domain(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page", 1)
        f.pop()  # seed
        result = f.pop()
        assert result is not None
        assert "example.com" in result[0]


class TestFrontierDepthLimit:
    def test_reject_over_max_depth(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=2)
        f.push("https://example.com/deep", 3)
        f.pop()  # seed
        assert f.pop() is None

    def test_accept_at_max_depth(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=2)
        f.push("https://example.com/ok", 2)
        f.pop()  # seed
        assert f.pop() is not None


class TestFrontierMaxPages:
    def test_stop_at_max_pages(self):
        f = _make_frontier("https://example.com", max_pages=2, max_depth=5)
        f.push("https://example.com/a", 1)
        # visited = {seed, /a} = 2, which is max_pages
        f.push("https://example.com/b", 1)  # should be rejected
        f.pop()  # seed
        f.pop()  # /a
        assert f.pop() is None


class TestFrontierDuplicates:
    def test_reject_duplicate_url(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/a", 1)
        f.push("https://example.com/a", 1)  # duplicate
        f.pop()  # seed
        f.pop()  # /a
        assert f.pop() is None


class TestFrontierNormalization:
    def test_strip_fragment(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page#section", 1)
        f.pop()  # seed
        url, _ = f.pop()
        assert "#" not in url

    def test_trailing_slash_dedup(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/page/", 1)
        f.push("https://example.com/page", 1)  # same after normalization
        f.pop()  # seed
        f.pop()  # /page
        assert f.pop() is None

    def test_skip_extensions(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.push("https://example.com/image.jpg", 1)
        f.push("https://example.com/style.css", 1)
        f.push("https://example.com/file.pdf", 1)
        f.pop()  # seed
        assert f.pop() is None


class TestFrontierVisitedCount:
    def test_visited_count(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        assert f.visited_count == 1  # seed
        f.push("https://example.com/a", 1)
        assert f.visited_count == 2


class TestFrontierIsDone:
    def test_done_when_empty(self):
        f = _make_frontier("https://example.com", max_pages=100, max_depth=3)
        f.pop()
        assert f.is_done()

    def test_done_when_max_pages_and_drained(self):
        f = _make_frontier("https://example.com", max_pages=1, max_depth=3)
        f.pop()  # drain the seed
        # queue empty, no more URLs can be pushed (max_pages reached)
        f.push("https://example.com/a", 1)  # rejected by max_pages
        assert f.is_done()


class TestFrontierThreadSafety:
    """Unit 3: concurrent push/pop must not lose or duplicate URLs."""

    def test_concurrent_pushes_deduplicate(self):
        """8 threads pushing 100 unique URLs each → 800 pushes total, but
        dedup + shared namespace means visited_count reflects union, not sum."""
        import threading
        f = _make_frontier("https://example.com", max_pages=2000, max_depth=5)
        f.pop()  # drain the seed so we count just the concurrent pushes

        barrier = threading.Barrier(8)

        def worker(worker_id: int):
            barrier.wait()
            for i in range(100):
                # Each worker pushes a unique namespace of URLs.
                f.push(f"https://example.com/w{worker_id}/p{i}", 1)

        threads = [threading.Thread(target=worker, args=(wid,)) for wid in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Seed was popped; 8*100 = 800 unique URLs were pushed.
        assert f.visited_count == 801  # 800 new + 1 seed still in _visited

    def test_concurrent_pops_no_duplicates(self):
        """Concurrent poppers from a pre-seeded frontier each get distinct items."""
        import threading
        f = _make_frontier("https://example.com", max_pages=200, max_depth=5)
        f.pop()  # drop seed
        for i in range(50):
            f.push(f"https://example.com/p{i}", 1)

        popped: list[tuple[str, int]] = []
        popped_lock = threading.Lock()
        barrier = threading.Barrier(8)

        def worker():
            barrier.wait()
            while True:
                item = f.pop()
                if item is None:
                    return
                with popped_lock:
                    popped.append(item)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        urls = [url for url, _ in popped]
        assert len(urls) == 50, f"expected 50 pops, got {len(urls)}"
        assert len(set(urls)) == 50, "duplicate URL returned to multiple workers"

    def test_push_pop_interleaved_no_corruption(self):
        """4 threads interleaving push and pop — no RuntimeError, no data loss."""
        import threading
        import time

        f = _make_frontier("https://example.com", max_pages=1000, max_depth=5)
        f.pop()

        stop = threading.Event()
        errors: list[Exception] = []

        def pusher(worker_id: int):
            try:
                i = 0
                while not stop.is_set():
                    f.push(f"https://example.com/w{worker_id}/p{i}", 1)
                    i += 1
            except Exception as exc:
                errors.append(exc)

        def popper():
            try:
                while not stop.is_set():
                    f.pop()
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=pusher, args=(0,)),
            threading.Thread(target=pusher, args=(1,)),
            threading.Thread(target=popper),
            threading.Thread(target=popper),
        ]
        for t in threads:
            t.start()
        time.sleep(0.5)  # let them race for 500ms
        stop.set()
        for t in threads:
            t.join()

        assert errors == [], f"thread-safety errors: {errors}"


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


@pytest.fixture
def fast_engine_patches():
    """Bundle the patches needed for engine tests: skip preflight, max throughput."""
    with patch("crawler.core.engine.preflight", return_value=(True, "")):
        yield


class TestEngine:
    def _make_html(self, content: str, link: str = "") -> str:
        body = content * 300  # ensure long enough to pass JS rendering check (>1024 chars)
        if link:
            return f'<html><body><p>{body}</p><a href="{link}">Next</a></body></html>'
        return f"<html><body><p>{body}</p></body></html>"

    @patch("crawler.core.engine.fetch_page")
    def test_basic_crawl(self, mock_fetch, fast_engine_patches):
        html_seed = self._make_html("seed page", "https://example.com/page2")
        html_page2 = self._make_html("page two")
        # Order-agnostic: return the right html for whichever URL the worker
        # picked up first. Concurrent workers don't guarantee call order.
        responses = {
            "https://example.com/": html_seed,
            "https://example.com/page2": html_page2,
        }
        mock_fetch.side_effect = lambda url, *a, **kw: responses.get(url)

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl(
                "https://example.com", db_path,
                max_pages=5, max_depth=2, req_per_sec=20.0,
            )
            assert job_id is not None
            assert mock_fetch.call_count == 2

    @patch("crawler.core.engine.fetch_page")
    def test_progress_queue(self, mock_fetch, fast_engine_patches):
        mock_fetch.return_value = self._make_html("content only")

        pq = queue.Queue()
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl("https://example.com", db_path, max_pages=1,
                      req_per_sec=20.0, progress_queue=pq)

        messages = []
        while not pq.empty():
            messages.append(pq.get())

        assert len(messages) >= 1
        assert messages[-1]["status"] == "completed"

    @patch("crawler.core.engine.fetch_page")
    def test_respects_max_pages(self, mock_fetch, fast_engine_patches):
        """Engine stops after max_pages."""
        mock_fetch.return_value = self._make_html("page", "https://example.com/next")

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl("https://example.com", db_path,
                      max_pages=2, req_per_sec=20.0)
            assert mock_fetch.call_count <= 2

    @patch("crawler.core.engine.fetch_page")
    def test_handles_fetch_failure(self, mock_fetch, fast_engine_patches):
        mock_fetch.return_value = None

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl("https://example.com", db_path,
                               max_pages=1, req_per_sec=20.0)
            assert job_id is not None

    @patch("crawler.core.engine._check_robots", return_value=True)
    @patch("crawler.core.engine.fetch_page")
    def test_scan_job_completed(self, mock_fetch, mock_robots, fast_engine_patches):
        mock_fetch.return_value = self._make_html("done")

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            job_id = run_crawl("https://example.com", db_path,
                               max_pages=5, req_per_sec=20.0)

            from crawler.storage import get_scan_job
            job = get_scan_job(db_path, job_id)
            assert job.status == "completed"
            assert job.pages_scanned >= 1

    @patch("crawler.core.engine._check_robots", return_value=True)
    @patch("crawler.core.engine.fetch_page")
    def test_resources_persisted_after_crawl(self, mock_fetch, mock_robots, fast_engine_patches):
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
            job_id = run_crawl("https://example.com/post/123", db_path,
                               max_pages=1, req_per_sec=20.0)

            from crawler.storage import get_scan_job, get_resources
            job = get_scan_job(db_path, job_id)
            assert job.resources_found >= 1

            resources = get_resources(db_path, job_id)
            assert len(resources) >= 1
            assert resources[0].title == "Test Article"
            assert "python" in resources[0].tags


class TestEngineConcurrent:
    """Unit 7 acceptance: parallelism, R6a fallback, force_playwright,
    preflight failure, terminal scan_job state, failed-page persistence."""

    def _make_html(self, content: str = "x", links: list[str] | None = None) -> str:
        body = "content " * 200
        link_html = "".join(
            f'<a href="{link}">link</a>' for link in (links or [])
        )
        return f"<html><body><p>{body}</p>{link_html}</body></html>"

    @patch("crawler.core.engine.fetch_page")
    def test_fifty_pages_via_concurrent_workers(self, mock_fetch, fast_engine_patches):
        """50 mocked URLs → all written via writer; terminal completed event."""
        # Build a graph of 50 interlinked pages: page0 links to page1..page49.
        urls = [f"https://example.com/p{i}" for i in range(50)]
        responses = {"https://example.com/": self._make_html("seed", urls)}
        for url in urls:
            responses[url] = self._make_html(url)
        mock_fetch.side_effect = lambda u, *a, **kw: responses.get(u)

        progress_q = queue.Queue()
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl(
                "https://example.com", db_path,
                max_pages=51, workers=8, req_per_sec=20.0,
                progress_queue=progress_q,
            )

            from crawler.storage import get_scan_job
            import sqlite3
            with sqlite3.connect(db_path) as conn:
                fetched = conn.execute(
                    "SELECT COUNT(*) FROM pages WHERE status = 'fetched'"
                ).fetchone()[0]
            assert fetched == 51

        events: list[dict] = []
        while not progress_q.empty():
            events.append(progress_q.get())
        assert events[-1]["status"] == "completed"
        assert events[-1]["pages_done"] == 51

    @patch("crawler.core.engine.fetch_page")
    def test_failed_page_persists_failure_reason(self, mock_fetch, fast_engine_patches):
        # First call returns None (failure), engine should write failure_reason
        mock_fetch.return_value = None
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            run_crawl("https://example.com", db_path, max_pages=1, req_per_sec=20.0)
            import sqlite3
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    "SELECT status, failure_reason FROM pages LIMIT 1"
                ).fetchone()
        assert row["status"] == "failed"
        assert row["failure_reason"] == "http_error"

    def test_preflight_failure_raises_with_remediation(self):
        with patch("crawler.core.engine.preflight",
                   return_value=(False, "playwright install chromium")):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                with pytest.raises(RuntimeError, match="playwright install chromium"):
                    run_crawl("https://example.com", db_path,
                              max_pages=1, req_per_sec=20.0)

    @patch("crawler.core.engine.fetch_page")
    def test_r6a_zero_resource_retry_via_render(self, mock_fetch, fast_engine_patches):
        """B6/R16: list page with zero resources from HTTP → render retry yields
        resources. Asserts unconditionally — no `if resources:` escape hatch.

        The HTTP body is a list-classified page (many same-domain links, no
        article markers, no og:title) that the parser extracts zero
        resources from. This triggers R6a, which routes the URL through
        render thread; the rendered HTML carries a real article and a tag.
        """
        from crawler.parser import parse_page
        from concurrent.futures import Future

        # HTTP path: 5 bare `<article>` elements satisfy the parser's
        # "list" classification (>3 articles), but each lacks the inner
        # `<a href>` that the resource extractor requires, so resources
        # comes back empty. This is the exact gap R6a is designed to close.
        http_html = (
            '<html><body>'
            + ''.join(
                f'<article><h2>article {i}</h2><p>summary {i}</p></article>'
                for i in range(5)
            )
            + '</body></html>'
        )
        # Sanity: confirm the test fixture actually exercises R6a's
        # precondition (list page + zero resources). If parsing rules drift,
        # this assertion catches it BEFORE the test silently no-ops.
        precheck = parse_page(http_html, "https://example.com/list")
        assert precheck.page_type == "list", (
            f"R6a test fixture must produce a 'list'-classified page; "
            f"parser returned page_type={precheck.page_type!r}"
        )
        assert len(precheck.resources) == 0, (
            f"R6a test fixture must produce ZERO resources; "
            f"parser found {len(precheck.resources)}"
        )

        # Render path: same URL but with a real article + tag.
        rendered_html = (
            '<html><head><meta property="og:title" content="From Render"></head>'
            '<body><article><h1>From Render</h1>'
            '<p>' + 'content ' * 200 + '</p>'
            '<a rel="tag">retry-tag</a>'
            '</article></body></html>'
        )
        mock_fetch.return_value = http_html

        # Spy on RenderThread.submit so we can assert the R6a branch fired.
        rendered_future: Future = Future()
        rendered_future.set_result(rendered_html)
        submit_calls: list[str] = []

        def spy_submit(self, url):
            submit_calls.append(url)
            return rendered_future

        with patch("crawler.core.render.RenderThread.submit", spy_submit):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                job_id = run_crawl(
                    "https://example.com/list", db_path,
                    max_pages=1, req_per_sec=20.0,
                )
                from crawler.storage import get_resources
                resources = get_resources(db_path, job_id)

        # R16 acceptance: R6a fired exactly once and rendered HTML was parsed.
        assert submit_calls == ["https://example.com/list"], (
            f"R6a render fallback should have fired exactly once; "
            f"submit calls: {submit_calls}"
        )
        assert len(resources) >= 1, (
            "R6a should have produced at least one resource from rendered HTML"
        )
        assert any("retry-tag" in r.tags for r in resources), (
            f"Rendered HTML's tag should be present; got tags: "
            f"{[r.tags for r in resources]}"
        )

    @patch("crawler.core.engine.fetch_page")
    def test_force_playwright_bypasses_http(self, mock_fetch, fast_engine_patches):
        """force_playwright=True → fetch_page is not called for the URL."""
        rendered_html = (
            '<html><head><meta property="og:title" content="Forced"></head>'
            '<body><article><h1>Forced</h1>'
            '<p>' + 'content ' * 200 + '</p>'
            '</article></body></html>'
        )

        from concurrent.futures import Future
        def make_future(*_a, **_kw):
            f = Future()
            f.set_result(rendered_html)
            return f

        mock_fetch.return_value = "<html>SHOULD NOT BE USED</html>"
        with patch("crawler.core.render.RenderThread.submit",
                   side_effect=make_future) as mock_render:
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                run_crawl(
                    "https://example.com/x", db_path,
                    max_pages=1, force_playwright=True, req_per_sec=20.0,
                )

        assert mock_fetch.call_count == 0
        assert mock_render.call_count == 1


class TestResume:
    """Unit 8: idempotent re-run via insert-at-push-time."""

    def _make_html(self, links: list[str] | None = None) -> str:
        body = "content " * 200
        link_html = "".join(
            f'<a href="{link}">link</a>' for link in (links or [])
        )
        return f"<html><body><p>{body}</p>{link_html}</body></html>"

    def test_resume_after_partial_scan_picks_up_pending(self, fast_engine_patches):
        """Simulate a partial scan: insert pending pages, then re-run engine →
        only the pending URLs get fetched, not the already-fetched ones."""
        from crawler.storage import (
            create_scan_job, init_db, insert_page, update_page,
            get_scan_job_by_entry_url, get_pending_pages,
        )
        from crawler.core.fetcher import fetch_page  # noqa
        import sqlite3

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            init_db(db_path)

            # Pre-create scan_job + 5 pages: 2 fetched, 3 pending.
            entry = "https://example.com"
            sj_id = create_scan_job(db_path, entry, "example.com", 100, 3)
            update_page(db_path, insert_page(db_path, sj_id, entry, depth=0),
                        status="fetched")
            update_page(db_path, insert_page(db_path, sj_id, "https://example.com/done1", depth=1),
                        status="fetched")
            insert_page(db_path, sj_id, "https://example.com/pending1", depth=1)
            insert_page(db_path, sj_id, "https://example.com/pending2", depth=1)
            insert_page(db_path, sj_id, "https://example.com/pending3", depth=1)

            # Track which URLs the engine fetches.
            fetched_urls: list[str] = []
            def track_fetch(url, *a, **kw):
                fetched_urls.append(url)
                return self._make_html()

            with patch("crawler.core.engine.fetch_page", side_effect=track_fetch):
                returned_id = run_crawl(
                    entry, db_path, max_pages=100, req_per_sec=20.0,
                )

            # Resume preserves the original scan_job_id.
            assert returned_id == sj_id

            # Only the 3 pending URLs were fetched — not the 2 already-fetched.
            assert sorted(fetched_urls) == [
                "https://example.com/pending1",
                "https://example.com/pending2",
                "https://example.com/pending3",
            ]

            # No pending rows remain.
            assert get_pending_pages(db_path, sj_id) == []

            # Final job state reflects accumulated counts (only this run's
            # pages_done), not the prior fetched count.
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                fetched_count = conn.execute(
                    "SELECT COUNT(*) FROM pages "
                    "WHERE scan_job_id = ? AND status = 'fetched'",
                    (sj_id,),
                ).fetchone()[0]
            assert fetched_count == 5  # 2 from prior + 3 from this run

    def test_completed_scan_is_no_op(self, fast_engine_patches):
        """Re-clicking Start on a completed scan: no new fetches, same id."""
        from crawler.storage import (
            create_scan_job, init_db, insert_page, update_page, update_scan_job,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            init_db(db_path)
            entry = "https://example.com"
            sj_id = create_scan_job(db_path, entry, "example.com", 100, 3)
            update_page(db_path, insert_page(db_path, sj_id, entry, depth=0),
                        status="fetched")
            update_scan_job(db_path, sj_id, status="completed")

            with patch("crawler.core.engine.fetch_page") as mock_fetch:
                returned_id = run_crawl(entry, db_path,
                                        max_pages=100, req_per_sec=20.0)

            assert returned_id == sj_id
            assert mock_fetch.call_count == 0

    def test_fresh_scan_creates_pages_at_push_time(self, fast_engine_patches):
        """Insert-at-push-time: every discovered URL has a pages row before
        the worker pops it, so a process kill mid-crawl leaves a recoverable
        frontier."""
        seed_html = self._make_html(links=[
            "https://example.com/a",
            "https://example.com/b",
            "https://example.com/c",
        ])
        leaf_html = self._make_html()

        responses = {
            "https://example.com/": seed_html,
            "https://example.com/a": leaf_html,
            "https://example.com/b": leaf_html,
            "https://example.com/c": leaf_html,
        }
        with patch("crawler.core.engine.fetch_page",
                   side_effect=lambda u, *a, **kw: responses.get(u)):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                sj_id = run_crawl("https://example.com", db_path,
                                  max_pages=10, req_per_sec=20.0)

                import sqlite3
                with sqlite3.connect(db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    rows = conn.execute(
                        "SELECT url FROM pages WHERE scan_job_id = ? "
                        "ORDER BY url", (sj_id,),
                    ).fetchall()

        # All 4 URLs (entry + 3 discovered) have rows.
        urls = sorted(r["url"] for r in rows)
        assert urls == [
            "https://example.com/",
            "https://example.com/a",
            "https://example.com/b",
            "https://example.com/c",
        ]

    def test_max_pages_limit_leaves_remainder_pending(self, fast_engine_patches):
        """max_pages=2 in a 4-URL frontier → 2 fetched, others stay pending."""
        seed_html = self._make_html(links=[
            "https://example.com/a", "https://example.com/b", "https://example.com/c",
        ])
        responses = {"https://example.com/": seed_html}
        for u in ["https://example.com/a", "https://example.com/b", "https://example.com/c"]:
            responses[u] = self._make_html()

        with patch("crawler.core.engine.fetch_page",
                   side_effect=lambda u, *a, **kw: responses.get(u)):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                sj_id = run_crawl("https://example.com", db_path,
                                  max_pages=2, req_per_sec=20.0,
                                  workers=1)  # serialize so result is deterministic

                import sqlite3
                with sqlite3.connect(db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    counts = {
                        row["status"]: row["c"]
                        for row in conn.execute(
                            "SELECT status, COUNT(*) AS c FROM pages "
                            "WHERE scan_job_id = ? GROUP BY status", (sj_id,),
                        )
                    }
        # 2 fetched, 2 pending (entry + 1 link, then 2 more discovered but
        # never popped before max_pages cap).
        assert counts.get("fetched", 0) == 2
        assert counts.get("pending", 0) >= 1


class TestFrontierWriterMode:
    """Frontier with writer integration — used by the engine in production."""

    def test_push_inserts_via_writer_and_returns_3tuple(self):
        from crawler.core.frontier import Frontier
        from crawler.core.writer import WriterThread
        from crawler.storage import create_scan_job, init_db
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            init_db(db_path)
            sj_id = create_scan_job(db_path, "https://example.com",
                                    "example.com", 100, 3)
            writer = WriterThread(db_path)
            writer.start()
            try:
                frontier = Frontier(
                    "https://example.com", 100, 3,
                    writer=writer, scan_job_id=sj_id,
                )
                # Auto-seeded entry URL
                item = frontier.pop()
                assert item is not None and len(item) == 3
                url, depth, page_id = item
                assert url == "https://example.com/"
                assert depth == 0
                assert isinstance(page_id, int) and page_id > 0

                # Push more — A5 makes push() stage, then flush_batch
                # persists via one writer round-trip and enqueues with
                # page_ids.
                frontier.push("https://example.com/a", 1)
                frontier.push("https://example.com/b", 1)
                # Before flush, the queue is still empty.
                assert frontier.pop() is None
                flushed = frontier.flush_batch()
                assert flushed == 2
                a_url, a_depth, a_pid = frontier.pop()
                b_url, b_depth, b_pid = frontier.pop()
                assert {a_url, b_url} == {
                    "https://example.com/a", "https://example.com/b",
                }
                assert a_pid != b_pid != page_id
            finally:
                writer.shutdown(timeout=2.0)

    def test_flush_batch_uses_one_writer_round_trip_for_many_links(self):
        """A5: 100 link pushes + 1 flush_batch → exactly 2 writer calls
        (one for the seed at construction, one for the batch). The whole
        point of A5 is that high-fanout pages don't trigger N writer
        round-trips."""
        from crawler.core.frontier import Frontier
        from unittest.mock import MagicMock
        from itertools import count

        writer = MagicMock()
        # Generate fresh page_ids for each batch call.
        id_counter = count(start=1)
        def fake_batch(scan_job_id, items):
            return [next(id_counter) for _ in items]
        writer.insert_pages_batch.side_effect = fake_batch

        frontier = Frontier(
            "https://example.com", 200, 3,
            writer=writer, scan_job_id=42,
        )
        # The constructor flushed the seed; record that call count.
        seed_calls = writer.insert_pages_batch.call_count
        assert seed_calls == 1

        for i in range(100):
            frontier.push(f"https://example.com/p{i}", 1)
        # Pushes do NOT call the writer.
        assert writer.insert_pages_batch.call_count == seed_calls

        flushed = frontier.flush_batch()
        assert flushed == 100
        # One additional writer call regardless of how many pushes.
        assert writer.insert_pages_batch.call_count == seed_calls + 1

        # All 100 ended up in the queue with page_ids.
        items = []
        while True:
            item = frontier.pop()
            if item is None:
                break
            items.append(item)
        # 1 (seed) + 100 (batch) = 101.
        assert len(items) == 101

    def test_flush_batch_empty_is_noop(self):
        from crawler.core.frontier import Frontier
        from unittest.mock import MagicMock
        writer = MagicMock()
        writer.insert_pages_batch.return_value = [1]  # for seed flush
        frontier = Frontier(
            "https://example.com", 100, 3,
            writer=writer, scan_job_id=1,
        )
        seed_calls = writer.insert_pages_batch.call_count
        # Nothing staged.
        assert frontier.flush_batch() == 0
        # No new writer calls.
        assert writer.insert_pages_batch.call_count == seed_calls

    def test_flush_batch_failure_keeps_visited_to_prevent_double_process(self):
        """B2 corrected (post-review): when flush_batch fails, staged URLs
        stay in _visited so concurrent re-discovery cannot double-stage
        them. They go back into _pending_batch for retry via the next
        flush — re-discovery is intentionally blocked because a successful
        retry + a re-pushed duplicate would put the same page_id in the
        queue twice and cause the page to be processed twice (counter
        inflation)."""
        from crawler.core.frontier import Frontier
        from unittest.mock import MagicMock

        writer = MagicMock()
        writer.insert_pages_batch.side_effect = [[1], RuntimeError("transient")]

        frontier = Frontier(
            "https://example.com", 100, 3,
            writer=writer, scan_job_id=1,
        )
        frontier.push("https://example.com/a", 1)
        frontier.push("https://example.com/b", 1)

        with pytest.raises(RuntimeError, match="transient"):
            frontier.flush_batch()

        # Visited entries persist — re-discovery cannot re-stage them.
        with frontier._lock:
            assert "https://example.com/a" in frontier._visited
            assert "https://example.com/b" in frontier._visited
            # They're back in pending_batch for the next flush attempt.
            assert ("https://example.com/a", 1) in frontier._pending_batch
            assert ("https://example.com/b", 1) in frontier._pending_batch

        # Re-pushing the same URL after the failure is a no-op (visited).
        frontier.push("https://example.com/a", 1)
        with frontier._lock:
            stages = [u for u, _ in frontier._pending_batch]
        # Still exactly one entry for `a` (no duplicate from re-push).
        assert stages.count("https://example.com/a") == 1

    def test_flush_batch_failure_keeps_pending_for_retry(self):
        from crawler.core.frontier import Frontier
        from unittest.mock import MagicMock

        writer = MagicMock()
        # Seed flush succeeds; subsequent flushes fail twice then succeed.
        results = [[1], RuntimeError("writer down"), [2, 3]]
        def side(scan_job_id, items):
            r = results.pop(0)
            if isinstance(r, BaseException):
                raise r
            return r
        writer.insert_pages_batch.side_effect = side

        frontier = Frontier(
            "https://example.com", 100, 3,
            writer=writer, scan_job_id=1,
        )
        frontier.push("https://example.com/a", 1)
        frontier.push("https://example.com/b", 1)
        with pytest.raises(RuntimeError):
            frontier.flush_batch()
        # Failed batch is rolled back into pending; retry succeeds.
        flushed = frontier.flush_batch()
        assert flushed == 2

    def test_seed_existing_skips_writer_insert(self):
        from crawler.core.frontier import Frontier
        from unittest.mock import MagicMock

        writer = MagicMock()
        writer.insert_page.side_effect = AssertionError(
            "seed_existing must NOT call insert_page"
        )
        frontier = Frontier(
            "https://example.com", 100, 3,
            writer=writer, scan_job_id=1, auto_seed=False,
        )
        frontier.seed_existing([
            ("https://example.com/x", 1, 100),
            ("https://example.com/y", 1, 101),
        ])
        items = []
        while True:
            item = frontier.pop()
            if item is None:
                break
            items.append(item)
        assert len(items) == 2
        page_ids = sorted(i[2] for i in items)
        assert page_ids == [100, 101]
        writer.insert_page.assert_not_called()


class TestEngineShutdownBound:
    """A3: critical Plan Unit 7 acceptance — shutdown bounded by 10s
    even when render is hung."""

    @patch("crawler.core.engine.fetch_page")
    def test_shutdown_path_bounded_when_render_hangs(
        self, mock_fetch, fast_engine_patches,
    ):
        """Workers blocked on hung render → engine returns within RENDER_TIMEOUT
        + bounded shutdown overhead. With RENDER_TIMEOUT mocked to 2s, total
        wall-clock for a 1-page scan must be < 12s.

        Verifies the inverted shutdown actually bounds teardown rather than
        adding executor-first 60s straggler drain on top of worker waits.
        """
        import time as _time
        from concurrent.futures import Future as _Future

        # Short body forces needs_js_rendering, so worker routes through render.
        short_body = "<html><body>x</body></html>"
        mock_fetch.return_value = short_body

        def make_hung_future(*_a, **_kw):
            return _Future()  # never resolves

        # Lower RENDER_TIMEOUT to 2s so the worker's Future.result returns
        # quickly. The interesting measurement is engine teardown overhead
        # AFTER the worker gives up, which is what A3 fixed.
        with patch("crawler.core.engine.RENDER_TIMEOUT", 2):
            with patch("crawler.core.render.RenderThread.submit",
                       side_effect=make_hung_future):
                with tempfile.TemporaryDirectory() as tmpdir:
                    db_path = os.path.join(tmpdir, "test.db")
                    start = _time.monotonic()
                    run_crawl(
                        "https://example.com", db_path,
                        max_pages=1, workers=8, req_per_sec=20.0,
                        force_playwright=True,
                    )
                    elapsed = _time.monotonic() - start

        # Worker waits ~1s (RENDER_TIMEOUT - 1 in _try_render's clamp), then
        # engine teardown: render shutdown 5s + executor cancel ~0 + drain 0
        # + writer ops 0 + coalescer 0 = ~6s. Bound at 12s for CI headroom.
        # Crucially: pre-A3 this would have been worker_wait + 60s straggler
        # drain timeout = 61s+.
        assert elapsed < 12.0, f"shutdown overhead exceeded: {elapsed:.1f}s"

    @patch("crawler.core.engine.fetch_page")
    def test_executor_uses_explicit_construction_not_with_block(
        self, mock_fetch, fast_engine_patches,
    ):
        """A3: ensure the engine is wired in the new structure (no `with`
        ThreadPoolExecutor that would re-introduce executor-first shutdown)."""
        import inspect
        from crawler.core import engine as engine_module
        source = inspect.getsource(engine_module.run_crawl)
        # The fix is to NOT use `with ThreadPoolExecutor` as a context manager
        # in the body of run_crawl.
        assert "with ThreadPoolExecutor" not in source, (
            "engine.run_crawl regressed to `with ThreadPoolExecutor` — "
            "this re-introduces the executor-first shutdown bug. Use explicit "
            "construction + try/finally."
        )
        assert "executor.shutdown(wait=False, cancel_futures=True)" in source, (
            "engine.run_crawl missing the cancel_futures shutdown call"
        )


class TestHighFanoutAndWriterDeathRegressions:
    """Behavioral regression tests for the P1 findings prior reviews surfaced.
    Plan trace: B6/R17a (high-fanout) + B6/R17b (writer-death abort).
    Each test exercises a real failure mode end-to-end."""

    def test_high_fanout_page_does_not_lock_workers(self, fast_engine_patches):
        """R17a: a 5K-link seed page must complete discovery in well under
        the pre-A5 lock-contention regime (where 5K pushes meant 5K
        synchronous writer round-trips). The functional assertion here is
        binary: does the crawl complete at all? Combined with the
        chunking from autofix F10, this also exercises the SQLite
        IN-clause boundary fix indirectly."""
        import time as _time

        link_count = 5000
        urls = [f"https://example.com/p{i}" for i in range(link_count)]
        seed_html = (
            "<html><body>"
            + "".join(f'<a href="{u}">l</a>' for u in urls)
            + "</body></html>"
        )
        leaf_html = "<html><body>" + ("content " * 200) + "</body></html>"
        responses = {"https://example.com/": seed_html}
        for u in urls:
            responses[u] = leaf_html

        with patch("crawler.core.engine.fetch_page",
                   side_effect=lambda u, *a, **kw: responses.get(u, leaf_html)):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                start = _time.monotonic()
                # Cap pages_submitted so the test focuses on discovery cost,
                # not network simulation. With max_pages=10, the engine pops
                # 10 leaf URLs after the seed is processed.
                run_crawl(
                    "https://example.com", db_path,
                    max_pages=10, workers=8, req_per_sec=20.0,
                )
                elapsed = _time.monotonic() - start

                import sqlite3
                with sqlite3.connect(db_path) as c:
                    pending = c.execute(
                        "SELECT COUNT(*) FROM pages WHERE status='pending'"
                    ).fetchone()[0]

        # Discovery cost (single 5K-link batch flush) was previously
        # bottlenecked by per-link writer round-trips; with A5 batching it
        # should comfortably complete in seconds.
        assert elapsed < 15.0, f"high-fanout discovery too slow: {elapsed:.1f}s"
        # Discovery actually persisted the links — most of the 5K links
        # should remain pending in the pages table for resume.
        assert pending >= 4000, (
            f"expected >=4000 pending discovered links; got {pending}"
        )

    def test_writer_persistent_failure_aborts_scan_within_bound(
        self, fast_engine_patches,
    ):
        """R17b: a persistent writer-side failure must trigger the engine's
        writer-health check (A6), abort the scan, and finalize via the
        direct-conn fallback. Bound: completes in <15s (multiple wait-loop
        ticks of 0.5s each, plus shutdown overhead)."""
        import time as _time

        # Force every PageWriteRequest to fail by raising in the writer's
        # save_resource_with_tags. Per-message exceptions don't kill the
        # writer (per design), so the engine relies on B1's reply-Future
        # propagation + repeated worker-side `WriterUnavailableError`
        # variants. For this test, we want a truly fatal scenario, so we
        # patch the writer's _open_connection to raise — that DOES set
        # last_exception and the wait-loop health check fires.
        from crawler.core import writer as writer_mod
        original_open = writer_mod.WriterThread._open_connection

        call_count = {"n": 0}
        def failing_open(self):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Let the very first connection succeed so the engine starts.
                # Subsequent reconnects (if any) fail.
                return original_open(self)
            raise RuntimeError("simulated persistent DB error")

        # Easier: patch is_alive to return False starting on the first call.
        # The wait-loop's health check at engine.py fires immediately on the
        # first wait-iteration tick and aborts the scan with final_status='failed'.
        def always_dead_is_alive(self):
            return False

        body = "<html><body>" + ("content " * 200) + "</body></html>"
        with patch("crawler.core.engine.fetch_page", return_value=body):
            with patch.object(writer_mod.WriterThread, "is_alive",
                              always_dead_is_alive):
                with tempfile.TemporaryDirectory() as tmpdir:
                    db_path = os.path.join(tmpdir, "test.db")
                    start = _time.monotonic()
                    job_id = run_crawl(
                        "https://example.com", db_path,
                        max_pages=20, workers=4, req_per_sec=20.0,
                    )
                    elapsed = _time.monotonic() - start

                    from crawler.storage import get_scan_job
                    job = get_scan_job(db_path, job_id)

        assert elapsed < 15.0, (
            f"writer-death abort exceeded bound: {elapsed:.1f}s"
        )
        assert job.status == "failed", (
            f"expected scan_jobs.status='failed' after writer death; got {job.status!r}"
        )


class TestEngineWriterHealth:
    """A6: writer-death detection in the wait loop + direct-conn finalize."""

    def test_engine_wires_writer_health_check_in_wait_loop(self):
        """A6: verify the wait-loop checks writer.is_alive() and breaks on
        unhealthy writer. Source-level assertion since reproducing the race
        deterministically is fragile."""
        import inspect
        from crawler.core import engine as engine_module
        source = inspect.getsource(engine_module.run_crawl)
        # The check uses both is_alive() AND last_exception so a writer
        # that crashed but hasn't yet exited still triggers abort.
        assert "writer.is_alive()" in source, (
            "engine.run_crawl missing writer health check"
        )
        assert "writer.last_exception" in source, (
            "engine.run_crawl missing writer exception check"
        )
        assert "_direct_finalize_scan_job" in source, (
            "engine.run_crawl missing direct-finalize fallback"
        )

    def test_direct_finalize_helper_writes_status_correctly(self, tmp_path):
        from crawler.core.engine import _direct_finalize_scan_job
        from crawler.storage import (
            create_scan_job, get_scan_job, init_db, update_scan_job,
        )

        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        sj_id = create_scan_job(db_path, "https://x.com", "x.com", 100, 3)
        update_scan_job(db_path, sj_id, status="running")

        _direct_finalize_scan_job(
            db_path, sj_id, status="failed",
            pages_scanned=42, resources_found=99,
        )

        job = get_scan_job(db_path, sj_id)
        assert job.status == "failed"
        assert job.pages_scanned == 42
        assert job.resources_found == 99
        assert job.completed_at is not None


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
