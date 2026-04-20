#!/usr/bin/env python
"""Offline page type reclassification — re-detect on stored raw_html.

For each page in the database with raw_html, re-run _detect_page_type()
to identify classification changes and reason codes.

Includes CSV export with confidence-based filtering (Unit 7).
"""

import json
import csv
import argparse
from pathlib import Path
from typing import List, Dict, Any

from bs4 import BeautifulSoup


# Mock database lookup (replace with real DB query)
def mock_get_pages(limit: int = 100) -> List[Dict[str, Any]]:
    """Mock: return sample pages from database."""
    return [
        {
            "id": 1,
            "url": "https://example.com/article/123",
            "page_type": "other",
            "raw_html": """
                <html>
                <head><meta property="og:title" content="Article 1"></head>
                <body>
                <h1>Article Title</h1>
                <p>Long content here with substantial text.</p>
                </body>
                </html>
            """,
        },
        {
            "id": 2,
            "url": "https://example.com/browse/all",
            "page_type": "other",
            "raw_html": """
                <html>
                <head><title>Browse All</title></head>
                <body>
                <h1>All Items</h1>
                <h2>Item 1</h2><div class="card">Card content</div>
                <h2>Item 2</h2><div class="card">Card content</div>
                <h2>Item 3</h2><div class="card">Card content</div>
                <h2>Item 4</h2><div class="card">Card content</div>
                <h2>Item 5</h2><div class="card">Card content</div>
                <h2>Item 6</h2><div class="card">Card content</div>
                <h2>Item 7</h2><div class="card">Card content</div>
                <h2>Item 8</h2><div class="card">Card content</div>
                <h2>Item 9</h2><div class="card">Card content</div>
                </body>
                </html>
            """,
        },
        {
            "id": 3,
            "url": "https://example.com/video/456",
            "page_type": "other",
            "raw_html": """
                <html>
                <head><meta property="og:type" content="video.other"></head>
                <body>
                <article>
                <h1>Video Title</h1>
                <time datetime="2025-01-01">Jan 1, 2025</time>
                <p>Video description with substantial content here.</p>
                </article>
                </body>
                </html>
            """,
        },
    ]


def validate_html(raw_html: str) -> bool:
    """Check if raw_html is valid and not truncated."""
    if not raw_html or len(raw_html) < 500:
        return False
    return any(marker in raw_html for marker in ["<!DOCTYPE", "<html", "<head", "<body"])


def detect_page_type_from_html(html: str, url: str) -> str:
    """Simplified page type detection (mocked for offline reclassification)."""
    soup = BeautifulSoup(html, "html.parser")

    # Check for detail patterns
    if any(p in url for p in ["/article/", "/video/", "/detail/", "/item/"]):
        return "detail"

    # Check for listing patterns
    cards = soup.select("div.card, .card")
    if "/browse/" in url and len(cards) >= 6:
        return "list"

    # Check for headings (heading hierarchy heuristic)
    h1_count = len(soup.find_all("h1"))
    h2_plus_count = len(soup.find_all(["h2", "h3", "h4"]))

    if h1_count <= 1 and h2_plus_count <= 3:
        body_text = soup.get_text(strip=True)
        if len(body_text) > 500:
            return "detail"

    if h2_plus_count >= 8:
        return "list"

    return "other"


def export_to_csv(results: List[Dict[str, Any]], base_path: str = "reclassifications") -> None:
    """Export reclassification results as confidence-tiered CSV files.

    Generates 3 files: tier_high (≥0.90), tier_medium (0.70-0.90), tier_low (<0.70).
    """
    tiers = {
        "tier_high": [r for r in results if r["confidence"] >= 0.90],
        "tier_medium": [r for r in results if 0.70 <= r["confidence"] < 0.90],
        "tier_low": [r for r in results if r["confidence"] < 0.70],
    }

    for tier_name, tier_results in tiers.items():
        csv_path = Path(f"{base_path}_{tier_name}.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["url", "old_type", "new_type", "reason", "confidence"],
            )
            writer.writeheader()
            writer.writerows(tier_results)
        print(f"  {csv_path}: {len(tier_results)} rows")


def offline_reclassify(
    limit: int = 100,
    output_path: str = "offline_reclassify_output.json",
    export_csv: str = None,
) -> Dict[str, Any]:
    """Reclassify pages offline using stored raw_html."""

    pages = mock_get_pages(limit)

    results = []
    reclassified_count = 0
    skipped_count = 0

    for page in pages:
        # Validate HTML integrity
        if not validate_html(page["raw_html"]):
            skipped_count += 1
            continue

        # Run detection
        new_type = detect_page_type_from_html(page["raw_html"], page["url"])
        old_type = page["page_type"]

        # Determine reason code
        reason = "heading_hierarchy"  # Simplified for mock
        if any(p in page["url"] for p in ["/article/", "/video/", "/detail/"]):
            reason = "url_pattern"
        elif "/browse/" in page["url"]:
            reason = "listing_path"

        # Check if reclassified
        if new_type != old_type:
            reclassified_count += 1

        results.append({
            "url": page["url"],
            "old_type": old_type,
            "new_type": new_type,
            "reason": reason,
            "confidence": 0.85 if reason == "url_pattern" else 0.75,
        })

    # Write output
    output = {
        "total": len(pages),
        "processed": len(pages) - skipped_count,
        "skipped": skipped_count,
        "reclassified": reclassified_count,
        "unchanged": len(pages) - skipped_count - reclassified_count,
        "results": results,
    }

    output_file = Path(output_path)
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    # Export to CSV if requested (Unit 7)
    if export_csv:
        export_to_csv(results, export_csv)

    return output


def main():
    parser = argparse.ArgumentParser(description="Offline page type reclassification")
    parser.add_argument("--sample-size", type=int, default=100, help="Limit to N pages")
    parser.add_argument(
        "--output",
        type=str,
        default="offline_reclassify_output.json",
        help="Output JSON file",
    )
    parser.add_argument(
        "--export-csv",
        type=str,
        default=None,
        help="Export to CSV with given base path (e.g., 'reclassifications')",
    )
    args = parser.parse_args()

    result = offline_reclassify(
        limit=args.sample_size,
        output_path=args.output,
        export_csv=args.export_csv,
    )

    print(f"✓ Offline reclassification complete")
    print(f"  Total: {result['total']} | Processed: {result['processed']} | Reclassified: {result['reclassified']}")
    print(f"  Output: {args.output}")
    if args.export_csv:
        print(f"  CSV exports: {args.export_csv}_tier_*.csv")


if __name__ == "__main__":
    main()
