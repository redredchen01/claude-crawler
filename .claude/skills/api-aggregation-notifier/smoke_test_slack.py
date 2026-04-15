#!/usr/bin/env python3
"""Smoke test: fetch GitHub issues, transform, and send to Slack."""

import os

from src.config import load_config
from src.dispatcher import SlackDispatcher
from src.fetcher import RestFetcher
from src.transformer import DataTransformer

if __name__ == "__main__":
    print("=== API Aggregation Notifier Phase 3 Slack Smoke Test ===\n")

    # Check for webhook URL
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        print("❌ SLACK_WEBHOOK_URL env var not set")
        print("Get a webhook URL from https://api.slack.com/apps and set:")
        print("  export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...")
        exit(1)

    # Load config
    config = load_config(
        {
            "sources": [
                {
                    "type": "rest",
                    "url": "https://api.github.com/repos/anthropics/claude-code/issues",
                    "params": {"state": "open", "per_page": 10},
                }
            ],
            "transform": {
                "type": "table",
                "columns": ["number", "title", "state"],
                "sort_by": "number",
                "sort_order": "desc",
                "limit": 5,
            },
            "dispatch": {
                "type": "slack",
                "destination": webhook_url,
                "title": "🔔 Open GitHub Issues (Claude Code)",
                "mention": "@channel",
            },
        }
    )

    print("✓ Config loaded")

    # Fetch
    fetcher = RestFetcher()
    results = fetcher.fetch_all(config.sources)

    if results[0].error:
        print(f"❌ Fetch error: {results[0].error}")
        exit(1)

    print(f"✓ Fetched {len(results[0].data)} issues")

    # Transform
    transformer = DataTransformer()
    result = transformer.transform(results[0].data, config.transform)

    print(f"✓ Transformed to {result.total_output} rows")

    # Dispatch
    dispatcher = SlackDispatcher()
    dispatch_result = dispatcher.dispatch(result, config.dispatch)

    if not dispatch_result.success:
        print(f"❌ Dispatch error: {dispatch_result.error}")
        exit(1)

    print(f"✓ Sent to Slack (ts={dispatch_result.ts})")
    print(f"\n✅ Smoke test passed!")
    print(f"   Message posted successfully with {result.total_output} issues")
