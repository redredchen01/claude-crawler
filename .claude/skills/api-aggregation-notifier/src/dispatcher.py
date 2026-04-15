"""Slack Block Kit dispatcher for transformed data."""

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import requests

from .config import DispatchConfig
from .transformer import TransformResult

logger = logging.getLogger(__name__)


@dataclass
class DispatchResult:
    """Result of dispatch operation."""

    success: bool
    ts: Optional[str] = None  # Slack message timestamp (for threading)
    channel: Optional[str] = None
    error: Optional[str] = None


class SlackDispatcher:
    """Dispatch transformed data to Slack via Block Kit."""

    def __init__(self, timeout: int = 30):
        """Initialize SlackDispatcher.

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self.session = requests.Session()
        self._last_send_time = 0

    def dispatch(self, result: TransformResult, config: DispatchConfig) -> DispatchResult:
        """Dispatch transformed data to Slack.

        Args:
            result: Transformation result
            config: DispatchConfig with destination, auth, etc.

        Returns:
            DispatchResult with success status and message ts
        """
        # Rate limiting: enforce minimum 1s between sends
        elapsed = time.time() - self._last_send_time
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)

        # Build blocks
        blocks = self.build_blocks(result, config)

        # Prepare payload
        payload = {"blocks": blocks}

        # Add optional fields
        if config.thread_ts:
            payload["thread_ts"] = config.thread_ts
        if config.unfurl_links:
            payload["unfurl_links"] = config.unfurl_links

        # Determine transport mode
        webhook_url = None
        if config.webhook_url:
            webhook_url = config.webhook_url
        elif isinstance(config.destination, str) and config.destination.startswith("https://"):
            webhook_url = config.destination

        self._last_send_time = time.time()

        if webhook_url:
            return self._send_webhook(payload, webhook_url)
        else:
            token = None
            if config.token_env:
                token = os.getenv(config.token_env)
            if not token:
                return DispatchResult(
                    success=False, error="No Slack token provided (token_env not set or env var missing)"
                )
            return self._send_api(payload, config.destination, token)

    def build_blocks(self, result: TransformResult, config: DispatchConfig) -> List[Dict]:
        """Build Slack Block Kit blocks from transformed data.

        Args:
            result: Transformation result
            config: DispatchConfig

        Returns:
            List of block dicts for Block Kit
        """
        blocks = []

        # Header block (if title set)
        if config.title:
            blocks.append(self._header_block(config.title))

        # Mention + summary section
        summary_text = ""
        if config.mention:
            summary_text = f"{config.mention}\n"
        summary_text += f"Showing {result.total_output} of {result.total_input} rows"

        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": summary_text}}
        )

        # Divider
        blocks.append({"type": "divider"})

        # Table section (or warning if too large)
        if result.total_output > 50:
            # Too many rows, show truncated
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"⚠️ *Too many rows ({result.total_output}) to display*\nShowing first 10 rows:",
                    },
                }
            )
            # Show first 10 rows
            limited_rows = result.rows[:10]
            table_md = self._render_table(
                [{h: r.get(h) for h in result.headers} for r in limited_rows],
                result.headers,
            )
        else:
            table_md = self._render_table(result.rows, result.headers)

        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": f"```\n{table_md}\n```"}}
        )

        # Footer context block
        blocks.append(self._footer_block(result))

        return blocks

    def _header_block(self, title: str) -> Dict:
        """Create header block.

        Args:
            title: Header text

        Returns:
            Block dict
        """
        return {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"🔔 *{title}*"},
        }

    def _footer_block(self, result: TransformResult) -> Dict:
        """Create footer context block.

        Args:
            result: Transformation result

        Returns:
            Block dict
        """
        from datetime import datetime

        timestamp = datetime.now().strftime("%H:%M:%S")
        text = f"Generated at {timestamp}"

        return {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": text}],
        }

    def _render_table(self, rows: List[Dict], headers: List[str]) -> str:
        """Render rows as markdown table.

        Args:
            rows: Data rows
            headers: Column headers

        Returns:
            Markdown table string
        """
        if not rows or not headers:
            return "No data"

        lines = []
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("|" + "|".join(["---"] * len(headers)) + "|")

        for row in rows:
            values = [str(row.get(h, "")).replace("|", "\\|") for h in headers]
            lines.append("| " + " | ".join(values) + " |")

        return "\n".join(lines)

    def _send_webhook(self, payload: Dict, webhook_url: str) -> DispatchResult:
        """Send via Incoming Webhook.

        Args:
            payload: Block Kit payload
            webhook_url: Webhook URL

        Returns:
            DispatchResult
        """
        try:
            response = self.session.post(
                webhook_url, json=payload, timeout=self.timeout
            )

            if response.status_code == 429:
                # Rate limited, retry with backoff
                retry_after = int(response.headers.get("Retry-After", 1))
                logger.warning(f"Rate limited, retrying in {retry_after}s")
                time.sleep(retry_after)
                return self._send_webhook(payload, webhook_url)

            if response.status_code != 200:
                logger.error(f"Webhook error {response.status_code}: {response.text[:200]}")
                return DispatchResult(success=False, error=f"HTTP {response.status_code}")

            logger.info("Message sent via webhook")
            return DispatchResult(success=True, ts="webhook")

        except requests.RequestException as e:
            logger.error(f"Webhook request failed: {str(e)}")
            return DispatchResult(success=False, error=f"Request failed: {str(e)}")

    def _send_api(self, payload: Dict, channel: str, token: str) -> DispatchResult:
        """Send via Slack API (chat.postMessage).

        Args:
            payload: Block Kit payload
            channel: Channel ID or name
            token: Bot token

        Returns:
            DispatchResult
        """
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        api_payload = dict(payload)
        api_payload["channel"] = channel

        try:
            response = self.session.post(
                "https://slack.com/api/chat.postMessage",
                json=api_payload,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 1))
                logger.warning(f"Rate limited, retrying in {retry_after}s")
                time.sleep(retry_after)
                return self._send_api(payload, channel, token)

            data = response.json()

            if not data.get("ok"):
                error = data.get("error", "Unknown error")
                logger.error(f"Slack API error: {error}")
                return DispatchResult(success=False, error=error)

            ts = data.get("ts")
            logger.info(f"Message sent to {channel} (ts={ts})")
            return DispatchResult(success=True, ts=ts, channel=channel)

        except requests.RequestException as e:
            logger.error(f"API request failed: {str(e)}")
            return DispatchResult(success=False, error=f"Request failed: {str(e)}")
