from __future__ import annotations

import os
import queue
import tempfile
from concurrent.futures import Future
from unittest.mock import MagicMock, patch

import pytest
from crawler.core.engine import run_crawl
from crawler.core.writer import PageWriteRequest

class TestPhase2PhaseB:
    """Regression tests for Phase 2 Phase B remediation."""

    @patch("crawler.core.engine.fetch_page_with_cache_tracking")
    def test_counter_coherence_on_write_failure(self, mock_fetch):
        """Unit B1: counters should NOT increment if the writer confirmation fails."""
        mock_fetch.return_value = ("<html><body>Detail</body></html>", False)
        
        # Mock a failing write: reply Future throws an exception
        def failing_write_page(req: PageWriteRequest):
            if req.reply:
                req.reply.set_exception(RuntimeError("DB Write Failed"))
        
        with patch("crawler.core.writer.WriterThread.write_page", side_effect=failing_write_page):
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "test.db")
                progress_q = queue.Queue()
                
                # We expect the crawl to finish (ignoring the failing page)
                run_crawl(
                    "https://example.com/fail",
                    db_path,
                    max_pages=1,
                    progress_queue=progress_q,
                    req_per_sec=100.0
                )
                
                from crawler.storage import get_scan_job
                job = get_scan_job(db_path, 1)
                
                # pages_scanned in ScanJob object should be 0 because confirmation failed
                # Note: our engine wait loop might still update completed status
                assert job.pages_scanned == 0
                assert job.resources_found == 0

    @patch("crawler.core.engine.fetch_page_with_cache_tracking")
    def test_render_disabled_visibility(self, mock_fetch):
        """Unit B3: engine should stop rendering and emit warning when RenderThread is disabled."""
        mock_fetch.return_value = ("<html><div id='__next'>SPA</div></html>", False)
        
        with patch("crawler.core.render.RenderThread.is_disabled", return_value=True):
            with patch("crawler.core.render.RenderThread.submit") as mock_submit:
                with tempfile.TemporaryDirectory() as tmpdir:
                    db_path = os.path.join(tmpdir, "test.db")
                    progress_q = queue.Queue()
                    
                    run_crawl(
                        "https://example.com/spa",
                        db_path,
                        max_pages=1,
                        progress_queue=progress_q,
                        req_per_sec=100.0
                    )
                    
                    # 1. Should NOT call submit because is_disabled() is True
                    assert mock_submit.call_count == 0
                    
                    # 2. Should have emitted a warning in the progress queue
                    warnings = []
                    while not progress_q.empty():
                        msg = progress_q.get()
                        if "warning" in msg:
                            warnings.append(msg["warning"])
                    
                    assert len(warnings) >= 1
                    assert "JS rendering disabled" in warnings[0]

    def test_browser_dead_typed_detection(self):
        """Unit B4: typed Playwright errors should be recognized as browser death."""
        from crawler.core.render import _is_browser_dead_error
        
        # Create a dummy exception class to simulate Playwright Error
        class PlaywrightError(Exception): pass
        
        # Test 1: Substring match (legacy)
        assert _is_browser_dead_error(RuntimeError("Target closed")) is True
        
        # Test 2: Typed match (simulated)
        # We need to mock the import in the function context
        with patch("playwright.sync_api.Error", PlaywrightError, create=True):
            exc = PlaywrightError("Browser has been closed")
            assert _is_browser_dead_error(exc) is True
            
            # Non-fatal error
            exc2 = PlaywrightError("Navigation timeout")
            assert _is_browser_dead_error(exc2) is False
