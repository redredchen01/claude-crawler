#!/usr/bin/env python
"""Backfill raw_html column for existing pages.

Fetches URL content and stores in raw_html column.
Supports resume mode: only processes pages WHERE raw_html=''.
"""

import sqlite3
import argparse
import time
from pathlib import Path
from typing import Dict, Any
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    requests = None


def validate_html(html: str) -> bool:
    """Check if HTML is valid and not truncated."""
    if not html or len(html) < 500:
        return False
    return any(marker in html for marker in ["<!DOCTYPE", "<html", "<head", "<body"])


def fetch_url(url: str, timeout: int = 10) -> str:
    """Fetch URL content via requests.

    Args:
        url: URL to fetch
        timeout: Request timeout in seconds

    Returns:
        HTML content or empty string on failure
    """
    if not requests:
        return ""

    try:
        response = requests.get(url, timeout=timeout, allow_redirects=True)
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return ""


def backfill_raw_html(
    db_path: str,
    limit: int = None,
    output_csv: str = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Backfill raw_html for pages where column is empty.

    Args:
        db_path: Path to SQLite database
        limit: Max pages to process (None = all)
        output_csv: Optional CSV output path
        dry_run: If True, don't write to database

    Returns:
        Statistics dict with success/failure counts
    """

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Query pages with empty raw_html
    query = "SELECT id, url FROM pages WHERE raw_html = '' ORDER BY id"
    if limit:
        query += f" LIMIT {limit}"

    cursor = conn.execute(query)
    pages = cursor.fetchall()

    stats = {
        "total": len(pages),
        "successful": 0,
        "failed": 0,
        "invalid_html": 0,
        "avg_size": 0,
        "results": [],
    }

    total_size = 0
    start_time = time.time()

    for i, page in enumerate(pages, 1):
        page_id = page["id"]
        url = page["url"]

        # Fetch HTML
        html = fetch_url(url)

        if not html:
            stats["failed"] += 1
            reason = "network_error"
        elif not validate_html(html):
            stats["invalid_html"] += 1
            reason = "truncated_html"
        else:
            stats["successful"] += 1
            reason = "success"
            total_size += len(html)

        # Log result
        stats["results"].append({
            "id": page_id,
            "url": url,
            "status": reason,
            "size": len(html) if html else 0,
        })

        # Update database (unless dry run)
        if not dry_run and html and validate_html(html):
            conn.execute(
                "UPDATE pages SET raw_html = ? WHERE id = ?",
                (html, page_id)
            )

        # Progress indicator
        if i % 10 == 0:
            print(f"  Processed {i}/{len(pages)} pages...", flush=True)

    # Commit changes
    if not dry_run:
        conn.commit()

    conn.close()

    # Calculate metrics
    elapsed = time.time() - start_time
    if stats["successful"] > 0:
        stats["avg_size"] = total_size // stats["successful"]

    stats["elapsed_seconds"] = elapsed
    stats["success_rate"] = (
        round(stats["successful"] / stats["total"], 2)
        if stats["total"] > 0
        else 0.0
    )

    return stats


def main():
    parser = argparse.ArgumentParser(description="Backfill raw_html column")
    parser.add_argument(
        "--db",
        type=str,
        default="crawler.db",
        help="Database path (default: crawler.db)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max pages to process (default: all)",
    )
    parser.add_argument(
        "--output-csv",
        type=str,
        default=None,
        help="CSV output path for results",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't write to database",
    )
    args = parser.parse_args()

    # Check requests availability
    if not requests:
        print("✗ requests library not installed. Install with: pip install requests")
        return

    # Run backfill
    print(f"Starting backfill: limit={args.limit}, dry_run={args.dry_run}")
    stats = backfill_raw_html(
        args.db,
        limit=args.limit,
        output_csv=args.output_csv,
        dry_run=args.dry_run,
    )

    # Report results
    print(f"\n✓ Backfill complete")
    print(f"  Total: {stats['total']}")
    print(f"  Successful: {stats['successful']} ({stats['success_rate']*100:.0f}%)")
    print(f"  Failed: {stats['failed']}")
    print(f"  Invalid HTML: {stats['invalid_html']}")
    if stats["successful"] > 0:
        print(f"  Avg HTML size: {stats['avg_size']} bytes")
    print(f"  Elapsed: {stats['elapsed_seconds']:.1f}s")

    # Write CSV if requested
    if args.output_csv:
        import csv
        csv_path = Path(args.output_csv)
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["id", "url", "status", "size"])
            writer.writeheader()
            writer.writerows(stats["results"])
        print(f"  CSV: {csv_path}")

    # Success gate: >=80% valid HTML
    if stats["success_rate"] >= 0.80:
        print(f"\n✓ Gate passed: >=80% valid HTML ({stats['success_rate']*100:.0f}%)")
    else:
        print(f"\n✗ Gate failed: <80% valid HTML ({stats['success_rate']*100:.0f}%)")


if __name__ == "__main__":
    main()
