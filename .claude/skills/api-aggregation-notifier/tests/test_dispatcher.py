"""Tests for Slack dispatcher."""

import json
from unittest.mock import MagicMock, patch

import pytest
from requests import Response

from src.config import DispatchConfig
from src.dispatcher import DispatchResult, SlackDispatcher
from src.transformer import TransformResult


@pytest.fixture
def dispatcher():
    """Create a SlackDispatcher instance."""
    return SlackDispatcher(timeout=10)


@pytest.fixture
def sample_result():
    """Create a sample TransformResult."""
    return TransformResult(
        rows=[
            {"id": 1, "name": "Alice", "status": "active"},
            {"id": 2, "name": "Bob", "status": "pending"},
            {"id": 3, "name": "Carol", "status": "active"},
        ],
        headers=["id", "name", "status"],
        total_input=10,
        total_output=3,
        format="table",
    )


@pytest.fixture
def sample_config():
    """Create a sample DispatchConfig."""
    return DispatchConfig(
        type="slack",
        destination="C12345",
        token_env="SLACK_BOT_TOKEN",
    )


def test_build_blocks_with_title_and_mention(dispatcher, sample_result, sample_config):
    """Test block building with title and mention."""
    sample_config.title = "Users Report"
    sample_config.mention = "@channel"

    blocks = dispatcher.build_blocks(sample_result, sample_config)

    # Should have header, mention section, divider, table, footer = 5 blocks
    assert len(blocks) == 5

    # Check header
    assert blocks[0]["type"] == "section"
    assert "🔔 *Users Report*" in blocks[0]["text"]["text"]

    # Check mention section
    assert blocks[1]["type"] == "section"
    assert "@channel" in blocks[1]["text"]["text"]
    assert "Showing 3 of 10 rows" in blocks[1]["text"]["text"]

    # Check divider
    assert blocks[2]["type"] == "divider"

    # Check table
    assert blocks[3]["type"] == "section"
    assert "```" in blocks[3]["text"]["text"]

    # Check footer
    assert blocks[4]["type"] == "context"


def test_build_blocks_no_title_no_mention(dispatcher, sample_result, sample_config):
    """Test block building without title and mention."""
    sample_config.title = None
    sample_config.mention = None

    blocks = dispatcher.build_blocks(sample_result, sample_config)

    # Should have mention section (no title), divider, table, footer = 4 blocks
    assert len(blocks) == 4

    # Check first block is mention section (no header)
    assert blocks[0]["type"] == "section"
    assert "Showing 3 of 10 rows" in blocks[0]["text"]["text"]


def test_header_block_format(dispatcher):
    """Test header block formatting."""
    header = dispatcher._header_block("Test Title")

    assert header["type"] == "section"
    assert header["text"]["type"] == "mrkdwn"
    assert "🔔 *Test Title*" in header["text"]["text"]


def test_table_renders_markdown(dispatcher, sample_result):
    """Test table markdown rendering."""
    table_md = dispatcher._render_table(sample_result.rows, sample_result.headers)

    assert "| id | name | status |" in table_md
    assert "| 1 | Alice | active |" in table_md
    assert "| 2 | Bob | pending |" in table_md
    assert "| 3 | Carol | active |" in table_md
    assert "---" in table_md


def test_table_pipe_escaping(dispatcher):
    """Test that pipes in data are escaped."""
    rows = [{"field": "value|with|pipes"}]
    table = dispatcher._render_table(rows, ["field"])

    assert "value\\|with\\|pipes" in table


def test_footer_block_has_timestamp(dispatcher, sample_result):
    """Test footer block contains timestamp."""
    footer = dispatcher._footer_block(sample_result)

    assert footer["type"] == "context"
    assert "Generated at" in footer["elements"][0]["text"]


def test_send_webhook_success(dispatcher, sample_config):
    """Test successful webhook send."""
    with patch.object(dispatcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        payload = {"blocks": []}
        result = dispatcher._send_webhook(payload, "https://hooks.slack.com/services/test")

        assert result.success is True
        assert result.ts == "webhook"
        assert result.error is None
        mock_post.assert_called_once()


def test_send_webhook_failure(dispatcher, sample_config):
    """Test failed webhook send."""
    with patch.object(dispatcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Invalid payload"
        mock_post.return_value = mock_response

        payload = {"blocks": []}
        result = dispatcher._send_webhook(payload, "https://hooks.slack.com/services/test")

        assert result.success is False
        assert "HTTP 400" in result.error


def test_send_webhook_rate_limit(dispatcher, sample_config):
    """Test webhook rate limiting with 429."""
    with patch.object(dispatcher.session, "post") as mock_post:
        # First call: 429, Second call: 200
        response_429 = MagicMock()
        response_429.status_code = 429
        response_429.headers = {"Retry-After": "1"}

        response_200 = MagicMock()
        response_200.status_code = 200

        mock_post.side_effect = [response_429, response_200]

        with patch("time.sleep"):
            payload = {"blocks": []}
            result = dispatcher._send_webhook(payload, "https://hooks.slack.com/services/test")

        assert result.success is True
        assert mock_post.call_count == 2


def test_send_api_success(dispatcher, sample_config):
    """Test successful API send."""
    with patch.object(dispatcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True, "ts": "1234567890.123456"}
        mock_post.return_value = mock_response

        payload = {"blocks": []}
        result = dispatcher._send_api(payload, "C12345", "xoxb-token")

        assert result.success is True
        assert result.ts == "1234567890.123456"
        assert result.channel == "C12345"
        mock_post.assert_called_once()

        # Check authorization header
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer xoxb-token"


def test_send_api_failure(dispatcher, sample_config):
    """Test failed API send."""
    with patch.object(dispatcher.session, "post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": False, "error": "channel_not_found"}
        mock_post.return_value = mock_response

        payload = {"blocks": []}
        result = dispatcher._send_api(payload, "C12345", "xoxb-token")

        assert result.success is False
        assert result.error == "channel_not_found"


def test_send_api_rate_limit(dispatcher, sample_config):
    """Test API rate limiting with 429."""
    with patch.object(dispatcher.session, "post") as mock_post:
        response_429 = MagicMock()
        response_429.status_code = 429
        response_429.headers = {"Retry-After": "1"}

        response_200 = MagicMock()
        response_200.status_code = 200
        response_200.json.return_value = {"ok": True, "ts": "123"}

        mock_post.side_effect = [response_429, response_200]

        with patch("time.sleep"):
            payload = {"blocks": []}
            result = dispatcher._send_api(payload, "C12345", "xoxb-token")

        assert result.success is True
        assert mock_post.call_count == 2


def test_dispatch_via_webhook(dispatcher, sample_result, sample_config):
    """Test full dispatch workflow via webhook."""
    sample_config.webhook_url = "https://hooks.slack.com/services/test"
    sample_config.title = "Test"

    with patch.object(dispatcher, "_send_webhook") as mock_send:
        mock_send.return_value = DispatchResult(success=True, ts="webhook")

        result = dispatcher.dispatch(sample_result, sample_config)

        assert result.success is True
        mock_send.assert_called_once()


def test_dispatch_via_api(dispatcher, sample_result, sample_config):
    """Test full dispatch workflow via API."""
    with patch.dict("os.environ", {"SLACK_BOT_TOKEN": "xoxb-test"}):
        with patch.object(dispatcher, "_send_api") as mock_send:
            mock_send.return_value = DispatchResult(
                success=True, ts="123", channel="C12345"
            )

            result = dispatcher.dispatch(sample_result, sample_config)

            assert result.success is True
            mock_send.assert_called_once()


def test_dispatch_large_table_truncated(dispatcher, sample_config):
    """Test that large tables are truncated in dispatch."""
    # Create result with 100 rows
    large_result = TransformResult(
        rows=[{"id": i, "name": f"User{i}"} for i in range(100)],
        headers=["id", "name"],
        total_input=1000,
        total_output=100,
        format="table",
    )

    blocks = dispatcher.build_blocks(large_result, sample_config)

    # Should have warning about too many rows at blocks[2]
    warning_block_text = blocks[2]["text"]["text"]
    assert "Too many rows (100) to display" in warning_block_text
    assert "Showing first 10 rows" in warning_block_text

    # Table is at blocks[3]
    table_block_text = blocks[3]["text"]["text"]
    # Count rows in table (inside code block)
    table_lines = [l for l in table_block_text.split("\n") if l.startswith("|")]
    # Should have header + 10 data rows
    assert len(table_lines) == 12  # 1 header + 1 divider + 10 rows


def test_dispatch_empty_result(dispatcher, sample_config):
    """Test dispatch with empty result."""
    empty_result = TransformResult(
        rows=[],
        headers=[],
        total_input=0,
        total_output=0,
        format="table",
    )

    blocks = dispatcher.build_blocks(empty_result, sample_config)

    # Should still build blocks, table will show "No data"
    assert len(blocks) >= 4
    # Table block (without title: blocks[2], with title: blocks[3])
    table_block = blocks[2] if not sample_config.title else blocks[3]
    assert "No data" in table_block["text"]["text"]


def test_dispatch_result_has_timestamp(dispatcher, sample_result, sample_config):
    """Test that dispatch result includes message timestamp."""
    with patch.dict("os.environ", {"SLACK_BOT_TOKEN": "xoxb-test"}):
        with patch.object(dispatcher.session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"ok": True, "ts": "1609459200.000100"}
            mock_post.return_value = mock_response

            result = dispatcher.dispatch(sample_result, sample_config)

            assert result.success is True
            assert result.ts == "1609459200.000100"


def test_dispatch_thread_reply(dispatcher, sample_result, sample_config):
    """Test dispatch with thread_ts for thread replies."""
    sample_config.thread_ts = "1609459200.000100"

    with patch.object(dispatcher, "_send_api") as mock_send:
        mock_send.return_value = DispatchResult(success=True, ts="123", channel="C12345")

        with patch.dict("os.environ", {"SLACK_BOT_TOKEN": "xoxb-test"}):
            result = dispatcher.dispatch(sample_result, sample_config)

        # Check that thread_ts was passed in payload
        call_args = mock_send.call_args
        payload = call_args[0][0]
        assert payload.get("thread_ts") == "1609459200.000100"


def test_dispatch_missing_token(dispatcher, sample_result, sample_config):
    """Test dispatch fails when token env var not set."""
    sample_config.token_env = "SLACK_BOT_TOKEN"

    with patch.dict("os.environ", {}, clear=True):
        result = dispatcher.dispatch(sample_result, sample_config)

        assert result.success is False
        assert "No Slack token provided" in result.error


def test_dispatch_webhook_url_auto_detect(dispatcher, sample_result):
    """Test webhook URL auto-detection from destination."""
    config = DispatchConfig(
        type="slack",
        destination="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX"
    )

    with patch.object(dispatcher, "_send_webhook") as mock_send:
        mock_send.return_value = DispatchResult(success=True, ts="webhook")

        result = dispatcher.dispatch(sample_result, config)

        assert result.success is True
        mock_send.assert_called_once()
