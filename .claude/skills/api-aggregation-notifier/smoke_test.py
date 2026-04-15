#!/usr/bin/env python3
"""Smoke test: fetch real GitHub releases and display as Markdown table."""

from src.config import load_config
from src.fetcher import RestFetcher
from src.transformer import DataTransformer

if __name__ == "__main__":
    print("=== API Aggregation Notifier Smoke Test ===\n")

    # Load config
    config = load_config(
        {
            "sources": [
                {
                    "type": "rest",
                    "url": "https://api.github.com/repos/anthropics/claude-code/releases",
                    "method": "GET",
                }
            ],
            "transform": {
                "type": "table",
                "columns": ["tag_name", "published_at", "draft"],
                "sort_by": "published_at",
                "sort_order": "desc",
                "limit": 5,
            },
        }
    )

    print("Config loaded ✓")

    # Fetch
    fetcher = RestFetcher()
    results = fetcher.fetch_all(config.sources)

    print(f"Fetched {len(results[0].data)} releases ✓")

    if results[0].error:
        print(f"Error: {results[0].error}")
        exit(1)

    # Transform
    transformer = DataTransformer()
    result = transformer.transform(results[0].data, config.transform)

    print(f"Transformed to {result.total_output} rows ✓\n")

    # Display
    print(transformer.to_markdown(result))
    print(f"\n✅ Smoke test passed! ({result.total_output} releases)")
