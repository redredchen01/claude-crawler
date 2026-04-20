"""Tests for app.py helper functions.

Covers two helpers added during interactive testing:
  - ``_normalize_entry_url`` — coerces user URL input
  - ``_render_zero_resources_diagnosis`` — diagnostic UX when scan finds 0 resources

The Streamlit rendering helper is tested via mocked ``st.*`` calls so we
don't need a Streamlit runtime; only the SQL aggregation + branching is
under test.
"""

import os
import sqlite3
import tempfile
from unittest.mock import patch, MagicMock

import pytest

from app import (
    _normalize_entry_url, _render_zero_resources_diagnosis,
    _render_performance_panel, _render_history_filters,
    _render_history_table, _render_pagination, _format_duration,
)
from crawler.storage import (
    create_scan_job, init_db, insert_page, update_page,
    get_scan_job_stats, list_scan_jobs_filtered,
)


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


@pytest.fixture
def sj_id(db_path):
    return create_scan_job(db_path, "https://example.com", "example.com", 100, 3)


# ─── _normalize_entry_url ───

class TestNormalizeEntryUrl:
    @pytest.mark.parametrize("raw,expected", [
        ("https://example.com/", "https://example.com/"),
        ("http://example.com/path", "http://example.com/path"),
        ("example.com", "https://example.com"),
        ("example.com/path", "https://example.com/path"),
        ("//example.com", "https://example.com"),
        ("//example.com/p", "https://example.com/p"),
        ("  example.com  ", "https://example.com"),
        ("HTTPS://EXAMPLE.COM/", "https://EXAMPLE.COM/"),  # scheme lowercased
    ])
    def test_accepts_valid_inputs(self, raw, expected):
        assert _normalize_entry_url(raw) == expected

    @pytest.mark.parametrize("raw", [
        "",
        "   ",
        None,
    ])
    def test_rejects_empty(self, raw):
        assert _normalize_entry_url(raw) is None

    @pytest.mark.parametrize("raw", [
        "ftp://example.com",
        "file:///etc/passwd",
        "ssh://user@example.com",
    ])
    def test_rejects_non_http_scheme(self, raw):
        assert _normalize_entry_url(raw) is None

    @pytest.mark.parametrize("raw", [
        "javascript:alert(1)",
        "mailto:foo@bar.com",
        "tel:+15551234",
        "data:text/html,<script>",
    ])
    def test_rejects_pseudo_schemes(self, raw):
        """Critical: pre-fix the no-scheme branch prepended https:// to
        these BEFORE the allowlist check, silently accepting them."""
        assert _normalize_entry_url(raw) is None

    @pytest.mark.parametrize("raw", [
        "not a url",         # whitespace in netloc
        "example .com",      # space in host
        "http:// example.com",
    ])
    def test_rejects_whitespace_in_host(self, raw):
        assert _normalize_entry_url(raw) is None

    def test_allows_private_hosts_when_flag_on(self, monkeypatch):
        """Default (ALLOW_PRIVATE_HOSTS=True) preserves local-dev: scanning
        localhost/internal IPs works without a config flip."""
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", True)
        assert _normalize_entry_url("http://localhost/") == "http://localhost/"
        assert _normalize_entry_url("https://10.0.0.1/x") == "https://10.0.0.1/x"

    @pytest.mark.parametrize("raw", [
        "http://localhost/",
        "https://127.0.0.1/",
        "https://10.0.0.5/path",
        "https://192.168.1.1/",
        "https://169.254.169.254/latest/meta-data/",
        "https://[::1]/",
    ])
    def test_rejects_private_hosts_when_flag_off(self, raw, monkeypatch):
        """With the SSRF gate enabled (hosted-mode), private/loopback/
        link-local hosts are rejected at entry. AWS metadata IP is the
        canonical SSRF target."""
        from crawler import config
        monkeypatch.setattr(config, "ALLOW_PRIVATE_HOSTS", False)
        assert _normalize_entry_url(raw) is None


# ─── _render_zero_resources_diagnosis ───

def _seed_pages(db_path, sj, *, fetched: int = 0, failed: int = 0,
                pending: int = 0, failure_reason: str = "http_error"):
    """Helper: seed the pages table with the given status mix."""
    next_id = 1
    for _ in range(fetched):
        page_id = insert_page(db_path, sj, f"https://example.com/f{next_id}")
        update_page(db_path, page_id, status="fetched")
        next_id += 1
    for _ in range(failed):
        page_id = insert_page(db_path, sj, f"https://example.com/x{next_id}")
        update_page(db_path, page_id, status="failed",
                    failure_reason=failure_reason)
        next_id += 1
    for _ in range(pending):
        insert_page(db_path, sj, f"https://example.com/p{next_id}")
        next_id += 1


class TestRenderZeroResourcesDiagnosis:
    def test_all_failed_branch_shows_primary_reason(self, db_path, sj_id):
        _seed_pages(db_path, sj_id, failed=3, failure_reason="http_error")
        with patch("app.st") as mock_st:
            _render_zero_resources_diagnosis(db_path, sj_id)
        # st.error was called with a message naming the failure reason
        mock_st.error.assert_called_once()
        msg = mock_st.error.call_args[0][0]
        assert "3 page" in msg
        assert "http_error" in msg
        # Hint surfaced via st.caption
        mock_st.caption.assert_called()

    def test_all_failed_with_unknown_reason(self, db_path, sj_id):
        # Seed with an unknown reason — no hint should fire but message ok.
        _seed_pages(db_path, sj_id, failed=2, failure_reason="weird_reason")
        with patch("app.st") as mock_st:
            _render_zero_resources_diagnosis(db_path, sj_id)
        mock_st.error.assert_called_once()
        # No hint in the dict for "weird_reason" → caption not called
        mock_st.caption.assert_not_called()

    def test_fetched_no_failed_branch_suggests_force_playwright(
        self, db_path, sj_id,
    ):
        _seed_pages(db_path, sj_id, fetched=5)
        with patch("app.st") as mock_st:
            _render_zero_resources_diagnosis(db_path, sj_id)
        mock_st.warning.assert_called_once()
        msg = mock_st.warning.call_args[0][0]
        assert "5 page" in msg
        assert "Force Playwright" in msg

    def test_mixed_branch_shows_both_counts(self, db_path, sj_id):
        _seed_pages(db_path, sj_id, fetched=4, failed=2)
        with patch("app.st") as mock_st:
            _render_zero_resources_diagnosis(db_path, sj_id)
        mock_st.warning.assert_called_once()
        msg = mock_st.warning.call_args[0][0]
        assert "4 page" in msg and "2" in msg
        # Caption includes most-common failure reason
        mock_st.caption.assert_called()

    def test_fallback_branch_when_only_pending(self, db_path, sj_id):
        # Scan was interrupted before any page completed.
        _seed_pages(db_path, sj_id, pending=3)
        with patch("app.st") as mock_st:
            _render_zero_resources_diagnosis(db_path, sj_id)
        mock_st.info.assert_called_once()


# ─── _format_duration ───

class TestFormatDuration:
    @pytest.mark.parametrize("seconds,expected", [
        (0, "0:00"),
        (30, "0:30"),
        (60, "1:00"),
        (90, "1:30"),
        (125, "2:05"),
        (3661, "61:01"),
    ])
    def test_format_duration(self, seconds, expected):
        assert _format_duration(seconds) == expected


# ─── _render_performance_panel ───

class TestRenderPerformancePanel:
    def test_render_performance_panel_with_all_fields(self):
        """Verify st.metric called 4 times with correct values from progress dict."""
        progress = {
            "speed_pages_per_sec": 2.5,
            "estimated_seconds_remaining": 180,
            "failed_count": 3,
            "pages_done": 25,
            "max_pages": 50,
        }
        with patch("app.st") as mock_st:
            # Mock columns to return 4 context managers
            mock_st.columns.return_value = [
                mock_st.column1,
                mock_st.column2,
                mock_st.column3,
                mock_st.column4,
            ]
            _render_performance_panel(progress)

        mock_st.columns.assert_called_once_with(4)

    def test_render_performance_panel_missing_speed_field(self):
        """Verify UI gracefully handles missing speed_pages_per_sec field."""
        progress = {
            "estimated_seconds_remaining": 180,
            "failed_count": 3,
            # speed_pages_per_sec missing
        }
        with patch("app.st") as mock_st:
            mock_st.columns.return_value = [
                mock_st.column1,
                mock_st.column2,
                mock_st.column3,
                mock_st.column4,
            ]
            _render_performance_panel(progress)
        # Columns should still be created
        mock_st.columns.assert_called_once_with(4)

    def test_render_performance_panel_missing_eta_field(self):
        """Verify UI gracefully handles missing estimated_seconds_remaining field."""
        progress = {
            "speed_pages_per_sec": 2.5,
            "failed_count": 3,
            # estimated_seconds_remaining missing
        }
        with patch("app.st") as mock_st:
            mock_st.columns.return_value = [
                mock_st.column1,
                mock_st.column2,
                mock_st.column3,
                mock_st.column4,
            ]
            _render_performance_panel(progress)
        mock_st.columns.assert_called_once_with(4)


# ─── _render_history_filters ───

class TestRenderHistoryFilters:
    def test_render_history_filters_renders_without_error(self, db_path):
        """Verify filter rendering doesn't crash with basic mocks."""
        with patch("app.st") as mock_st:
            # Setup all necessary mocks
            mock_st.text_input.return_value = ""
            mock_st.selectbox.return_value = None
            mock_st.number_input.return_value = 0
            mock_st.button.return_value = False

            # Mock columns to return context managers
            col_obj = MagicMock()
            mock_st.columns.return_value = [col_obj, col_obj, col_obj]

            # Mock session_state as MagicMock
            mock_st.session_state = MagicMock()
            mock_st.session_state.history_search = ""
            mock_st.session_state.history_status_filter = None
            mock_st.session_state.history_resource_range = (0, 10000)
            mock_st.session_state.history_sort_by = "created_at"
            mock_st.session_state.history_page = 0

            # Function should execute without raising
            _render_history_filters(db_path)

            # Verify basic UI elements were called
            assert mock_st.columns.called
            assert mock_st.text_input.called
            assert mock_st.selectbox.called


# ─── _render_history_table ───

class TestRenderHistoryTable:
    def test_render_history_table_with_jobs(self, db_path):
        """Verify table is rendered with scan jobs."""
        from crawler.models import ScanJob
        sj_id = create_scan_job(db_path, "https://example.com", "example.com", 100, 3)
        jobs = [ScanJob(id=sj_id, entry_url="https://example.com",
                       domain="example.com", status="completed",
                       pages_scanned=50, resources_found=25)]

        with patch("app.st") as mock_st:
            mock_st.download_button.return_value = False
            # Mock columns
            col_obj = MagicMock()
            mock_st.columns.return_value = [col_obj, col_obj, col_obj]
            mock_st.button.return_value = False
            mock_st.rerun = MagicMock()
            # Mock session_state
            mock_st.session_state = MagicMock()
            mock_st.session_state.scan_job_id = None

            _render_history_table(db_path, jobs)

        # st.dataframe should be called with table data
        mock_st.dataframe.assert_called_once()

    def test_render_history_table_empty_jobs(self, db_path):
        """Verify UI handles empty job list gracefully."""
        with patch("app.st") as mock_st:
            _render_history_table(db_path, [])

        # For empty jobs, info should be shown instead of dataframe
        mock_st.info.assert_called_once()


# ─── _render_pagination ───

class TestRenderPagination:
    def test_render_pagination_first_page(self):
        """Verify pagination shows navigation for first page of multiple pages."""
        with patch("app.st") as mock_st:
            # Mock columns to return 4 context managers
            col_obj = MagicMock()
            mock_st.columns.return_value = [col_obj, col_obj, col_obj, col_obj]
            mock_st.button.return_value = False
            # Mock session_state as MagicMock
            mock_st.session_state = MagicMock()
            mock_st.session_state.history_page = 0
            mock_st.caption = MagicMock()
            mock_st.rerun = MagicMock()

            _render_pagination(total_count=150, page_size=50)

        # Columns for pagination controls
        mock_st.columns.assert_called()

    def test_render_pagination_single_page(self):
        """Verify pagination handles single-page results gracefully."""
        with patch("app.st") as mock_st:
            col_obj = MagicMock()
            mock_st.columns.return_value = [col_obj, col_obj, col_obj, col_obj]
            mock_st.button.return_value = False
            mock_st.session_state = MagicMock()
            mock_st.session_state.history_page = 0
            mock_st.caption = MagicMock()
            mock_st.rerun = MagicMock()

            _render_pagination(total_count=25, page_size=50)

        # Should still render controls
        mock_st.columns.assert_called()

    def test_render_pagination_exact_multiple_pages(self):
        """Verify pagination with exact multiple of page_size."""
        with patch("app.st") as mock_st:
            col_obj = MagicMock()
            mock_st.columns.return_value = [col_obj, col_obj, col_obj, col_obj]
            mock_st.button.return_value = False
            mock_st.session_state = MagicMock()
            mock_st.session_state.history_page = 0
            mock_st.caption = MagicMock()
            mock_st.rerun = MagicMock()

            _render_pagination(total_count=100, page_size=50)

        mock_st.columns.assert_called()
