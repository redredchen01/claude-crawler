"""CSV and JSON export using stdlib only."""

import csv
import json
import io
from crawler import storage


RESOURCE_FIELDS = [
    "id", "title", "url", "cover_url", "views", "likes", "hearts",
    "category", "published_at", "popularity_score", "tags",
]

TAG_FIELDS = ["id", "name", "resource_count"]


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
        ])
    return output.getvalue()


def export_resources_json(db_path: str, scan_job_id: int) -> str:
    """Export resources as JSON string."""
    resources = storage.get_resources(db_path, scan_job_id)
    data = []
    for r in resources:
        data.append({
            "id": r.id, "title": r.title, "url": r.url,
            "cover_url": r.cover_url, "views": r.views,
            "likes": r.likes, "hearts": r.hearts,
            "category": r.category, "published_at": r.published_at,
            "popularity_score": r.popularity_score, "tags": r.tags,
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
