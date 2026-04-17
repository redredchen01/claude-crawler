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
