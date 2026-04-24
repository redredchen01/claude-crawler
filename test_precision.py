#!/usr/bin/env python3
"""Auto-test metric/cover/date precision on real websites."""

import sqlite3
import tempfile

from crawler import storage
from crawler.core.engine import run_crawl


def test_site_with_render(
    url: str, db_path: str, max_pages: int = 20, force_playwright: bool = False
) -> dict:
    """Crawl a site and check metric/cover/date precision."""
    try:
        job_id = run_crawl(
            url,
            db_path,
            max_pages=max_pages,
            max_depth=1,
            req_per_sec=5.0,
            workers=2,
            force_playwright=force_playwright,
        )
        print(f"   ✓ Crawl completed: job_id={job_id}")

        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row

            # Summary
            job = conn.execute(
                "SELECT * FROM scan_jobs WHERE id = ?", (job_id,)
            ).fetchone()
            print(
                f"   Pages: {job['pages_scanned']} scanned, "
                f"{job['resources_found']} resources"
            )

            # Check metric/cover/date
            resources = conn.execute(
                "SELECT id, title, views, likes, hearts, "
                "cover_url, published_at FROM resources "
                "WHERE scan_job_id = ? LIMIT 10",
                (job_id,),
            ).fetchall()

            if not resources:
                print("   ⚠️  No resources extracted")
                return {
                    "url": url,
                    "job_id": job_id,
                    "pages_scanned": job["pages_scanned"],
                    "resources_found": 0,
                    "metric_samples": [],
                    "cover_samples": [],
                    "date_samples": [],
                }

            metric_samples = []
            cover_samples = []
            date_samples = []

            for r in resources:
                # Metric check
                has_metric = any(
                    r[col] is not None for col in ["views", "likes", "hearts"]
                )
                if has_metric:
                    metric_samples.append(
                        {
                            "title": r["title"],
                            "views": r["views"],
                            "likes": r["likes"],
                            "hearts": r["hearts"],
                        }
                    )

                # Cover check
                if r["cover_url"]:
                    cover_samples.append(
                        {
                            "title": r["title"],
                            "cover": r["cover_url"][:60] + "...",
                        }
                    )

                # Date check
                if r["published_at"]:
                    date_samples.append(
                        {
                            "title": r["title"],
                            "published_at": r["published_at"],
                        }
                    )

            print(f"   Metrics: {len(metric_samples)}/{len(resources)} ✓")
            print(f"   Covers: {len(cover_samples)}/{len(resources)} ✓")
            print(f"   Dates: {len(date_samples)}/{len(resources)} ✓")

            return {
                "url": url,
                "job_id": job_id,
                "pages_scanned": job["pages_scanned"],
                "resources_found": job["resources_found"],
                "metric_samples": metric_samples,
                "cover_samples": cover_samples,
                "date_samples": date_samples,
            }

    except Exception as e:
        print(f"   ✗ Error: {e}")
        return {
            "url": url,
            "job_id": None,
            "error": str(e),
        }


def main():
    # Use temp DB for test isolation
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = f"{tmpdir}/test.db"
        storage.init_db(db_path)

        # Test URLs — content-rich blogs with clear article structure
        test_urls = [
            ("https://techcrunch.com", False),
            ("https://techcrunch.com", True),  # With Playwright
        ]

        results = []
        for url, force_playwright in test_urls:
            print(f"\n{'=' * 70}")
            print(f"Testing {url} (playwright={'YES' if force_playwright else 'NO'})")
            print("=" * 70)
            result = test_site_with_render(
                url, db_path, max_pages=5, force_playwright=force_playwright
            )
            results.append(result)

        # Summary report
        print("\n" + "=" * 70)
        print("PRECISION TEST SUMMARY")
        print("=" * 70)

        for r in results:
            status = "✓" if r.get("resources_found", 0) > 0 else "✗"
            print(f"{status} {r['url']}: {r.get('resources_found', '?')} resources")

            if r.get("error"):
                print(f"  Error: {r['error']}")
                continue

            m_count = len(r.get("metric_samples", []))
            c_count = len(r.get("cover_samples", []))
            d_count = len(r.get("date_samples", []))
            total = r.get("resources_found", 1) or 1

            print(
                f"  Metrics: {m_count}/{total} ({100 * m_count // total}%) "
                f"Covers: {c_count}/{total} ({100 * c_count // total}%) "
                f"Dates: {d_count}/{total} ({100 * d_count // total}%)"
            )

            # Show first sample of each
            if r.get("metric_samples"):
                s = r["metric_samples"][0]
                print(
                    f"    Sample metric: views={s['views']}, "
                    f"likes={s['likes']}, hearts={s['hearts']}"
                )

        print("\n✓ Precision test complete.")


if __name__ == "__main__":
    main()
