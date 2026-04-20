"""CSV and JSON export using stdlib only."""

import csv
import json
import io
from crawler import storage
from crawler.raw_data import parse_raw_data


# `sources` holds the field-level provenance map as compact JSON so
# external data analysis can tell which fields came from JSON-LD / OG
# / Twitter / microdata / DOM / missing. Added to end of RESOURCE_FIELDS
# rather than inserted mid-row so existing CSV consumers see the new
# column without their column-by-index logic breaking.
RESOURCE_FIELDS = [
    "id", "title", "url", "cover_url", "views", "likes", "hearts",
    "category", "published_at", "popularity_score", "tags",
    "sources",
]

TAG_FIELDS = ["id", "name", "resource_count"]


def _sources_compact_json(raw_data: str) -> str:
    """Render a resource's provenance map as compact JSON for CSV. Empty
    raw_data or malformed content returns '{}' rather than raising."""
    parsed = parse_raw_data(raw_data)
    return json.dumps(parsed["provenance"], ensure_ascii=False, sort_keys=True)


def export_resources_csv(db_path: str, scan_job_id: int) -> str:
    """Export resources as CSV string."""
    resources = storage.get_resources(db_path, scan_job_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(RESOURCE_FIELDS)
    for r in resources:
        writer.writerow([
            r.id, r.title, r.url, r.cover_url, r.views, r.likes, r.hearts,
            r.category, r.published_at, r.popularity_score,
            "; ".join(r.tags),
            _sources_compact_json(r.raw_data),
        ])
    return output.getvalue()


def export_resources_json(db_path: str, scan_job_id: int) -> str:
    """Export resources as JSON string."""
    resources = storage.get_resources(db_path, scan_job_id)
    data = []
    for r in resources:
        parsed_raw = parse_raw_data(r.raw_data)
        data.append({
            "id": r.id, "title": r.title, "url": r.url,
            "cover_url": r.cover_url, "views": r.views,
            "likes": r.likes, "hearts": r.hearts,
            "category": r.category, "published_at": r.published_at,
            "popularity_score": r.popularity_score, "tags": r.tags,
            "provenance": parsed_raw["provenance"],
            "description": parsed_raw["description"],
        })
    return json.dumps(data, ensure_ascii=False, indent=2)


def export_tags_csv(db_path: str, scan_job_id: int) -> str:
    """Export tags as CSV string."""
    tags = storage.get_tags(db_path, scan_job_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(TAG_FIELDS)
    for t in tags:
        writer.writerow([t.id, t.name, t.resource_count])
    return output.getvalue()


def export_tags_json(db_path: str, scan_job_id: int) -> str:
    """Export tags as JSON string."""
    tags = storage.get_tags(db_path, scan_job_id)
    data = [{"id": t.id, "name": t.name, "resource_count": t.resource_count} for t in tags]
    return json.dumps(data, ensure_ascii=False, indent=2)


# --- Enhanced export formats ---

def export_stats_summary(db_path: str, scan_job_id: int) -> dict:
    """Generate statistics summary for a scan."""
    import sqlite3
    
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        
        # Get job info
        job = conn.execute(
            "SELECT * FROM scan_jobs WHERE id = ?", (scan_job_id,)
        ).fetchone()
        
        # Get resource stats
        resources = conn.execute(
            "SELECT COUNT(*) as count, "
            "AVG(views) as avg_views, MAX(views) as max_views, "
            "AVG(likes) as avg_likes, MAX(likes) as max_likes, "
            "AVG(hearts) as avg_hearts, MAX(hearts) as max_hearts "
            "FROM resources WHERE scan_job_id = ?",
            (scan_job_id,)
        ).fetchone()
        
        # Coverage stats
        coverage = conn.execute(
            "SELECT "
            "SUM(CASE WHEN title != '' THEN 1 ELSE 0 END) as with_title, "
            "SUM(CASE WHEN cover_url != '' THEN 1 ELSE 0 END) as with_cover, "
            "SUM(CASE WHEN category != '' THEN 1 ELSE 0 END) as with_category, "
            "SUM(CASE WHEN views > 0 OR likes > 0 OR hearts > 0 THEN 1 ELSE 0 END) as with_metrics "
            "FROM resources WHERE scan_job_id = ?",
            (scan_job_id,)
        ).fetchone()
        
        # Page type distribution
        pages = conn.execute(
            "SELECT page_type, COUNT(*) as count FROM pages "
            "WHERE scan_job_id = ? GROUP BY page_type",
            (scan_job_id,)
        ).fetchall()
        
        # Tag stats
        tags = conn.execute(
            "SELECT COUNT(DISTINCT name) as unique_tags, COUNT(*) as tag_occurrences "
            "FROM tags WHERE scan_job_id = ?",
            (scan_job_id,)
        ).fetchone()
        
        return {
            "job_id": job["id"],
            "domain": job["domain"],
            "status": job["status"],
            "pages_scanned": job["pages_scanned"],
            "resources_count": resources["count"] or 0,
            "avg_metrics": {
                "views": round(resources["avg_views"] or 0, 1),
                "likes": round(resources["avg_likes"] or 0, 1),
                "hearts": round(resources["avg_hearts"] or 0, 1),
            },
            "max_metrics": {
                "views": resources["max_views"] or 0,
                "likes": resources["max_likes"] or 0,
                "hearts": resources["max_hearts"] or 0,
            },
            "coverage": {
                "title_pct": round(100.0 * (coverage["with_title"] or 0) / max(resources["count"] or 1, 1), 1),
                "cover_pct": round(100.0 * (coverage["with_cover"] or 0) / max(resources["count"] or 1, 1), 1),
                "category_pct": round(100.0 * (coverage["with_category"] or 0) / max(resources["count"] or 1, 1), 1),
                "metrics_pct": round(100.0 * (coverage["with_metrics"] or 0) / max(resources["count"] or 1, 1), 1),
            },
            "page_types": {row["page_type"]: row["count"] for row in pages},
            "tags": {
                "unique": tags["unique_tags"] or 0,
                "total_occurrences": tags["tag_occurrences"] or 0,
            }
        }


def export_markdown_report(db_path: str, scan_job_id: int) -> str:
    """Generate a markdown report of the scan."""
    stats = export_stats_summary(db_path, scan_job_id)
    
    md = f"""# Crawl Report: {stats['domain']}

## Summary
- **Job ID**: {stats['job_id']}
- **Status**: {stats['status']}
- **Pages Scanned**: {stats['pages_scanned']}
- **Resources Found**: {stats['resources_count']}

## Metrics (Average)
- Views: {stats['avg_metrics']['views']:.0f} (max: {stats['max_metrics']['views']})
- Likes: {stats['avg_metrics']['likes']:.0f} (max: {stats['max_metrics']['likes']})
- Hearts: {stats['avg_metrics']['hearts']:.0f} (max: {stats['max_metrics']['hearts']})

## Data Coverage
- Title: {stats['coverage']['title_pct']:.1f}%
- Cover Image: {stats['coverage']['cover_pct']:.1f}%
- Category: {stats['coverage']['category_pct']:.1f}%
- Metrics: {stats['coverage']['metrics_pct']:.1f}%

## Page Types
"""
    for page_type, count in sorted(stats['page_types'].items(), key=lambda x: -x[1]):
        md += f"- {page_type}: {count}\n"
    
    md += f"""
## Tags
- Unique Tags: {stats['tags']['unique']}
- Total Occurrences: {stats['tags']['total_occurrences']}
"""
    return md
