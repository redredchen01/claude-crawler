"""Popularity scoring and tag analysis."""

import math
from datetime import datetime, timezone

from crawler import config
from crawler.models import Resource, Tag
from crawler import storage


def compute_scores(db_path: str, scan_job_id: int):
    """Compute popularity scores for all resources in a scan job.

    Runs ONCE after crawl completes. Uses min-max normalization within the scan.
    """
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources:
        return

    max_views = max((r.views for r in resources), default=0)
    max_likes = max((r.likes for r in resources), default=0)
    max_hearts = max((r.hearts for r in resources), default=0)

    scores: dict[int, float] = {}
    for r in resources:
        norm_views = _normalize(r.views, max_views)
        norm_likes = _normalize(r.likes, max_likes)
        norm_hearts = _normalize(r.hearts, max_hearts)
        recency = _recency_factor(r.published_at)

        score = (
            config.W_VIEWS * norm_views
            + config.W_LIKES * norm_likes
            + config.W_HEARTS * norm_hearts
            + config.W_RECENCY * recency
        )
        scores[r.id] = round(score, 2)

    storage.update_resource_scores(db_path, scores)
    storage.update_tag_counts(db_path, scan_job_id)
    storage.update_scan_job(
        db_path, scan_job_id,
        resources_found=len(resources),
    )


def _normalize(value: int, max_value: int) -> float:
    """Min-max normalize to 0-100 range."""
    if max_value <= 0:
        return 0.0
    return (value / max_value) * 100.0


def _recency_factor(published_at: str) -> float:
    """Compute recency factor: 1/(1+log(1+days_since)). Returns 0-100 scaled."""
    if not published_at:
        return 50.0  # default middle value for unknown dates

    try:
        # Try common date formats
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(published_at, fmt)
                break
            except ValueError:
                continue
        else:
            return 50.0

        now = datetime.now()
        days = max((now - dt).days, 0)
        factor = 1.0 / (1.0 + math.log1p(days))
        return factor * 100.0
    except Exception:
        return 50.0


def get_tag_stats(db_path: str, scan_job_id: int) -> list[Tag]:
    """Get tags sorted by frequency (resource_count DESC)."""
    return storage.get_tags(db_path, scan_job_id)


def get_tag_resources(db_path: str, tag_id: int, limit: int = 10) -> list[Resource]:
    """Get top resources for a specific tag by popularity score."""
    return storage.get_resources_by_tag(db_path, tag_id, limit)


def get_tag_overview(db_path: str, scan_job_id: int) -> dict:
    """Summary stats: total tags, total resources, avg tags per resource."""
    tags = storage.get_tags(db_path, scan_job_id)
    resources = storage.get_resources(db_path, scan_job_id)

    total_tags = len(tags)
    total_resources = len(resources)
    total_tag_links = sum(t.resource_count for t in tags)
    avg_tags = total_tag_links / total_resources if total_resources > 0 else 0

    return {
        "total_tags": total_tags,
        "total_resources": total_resources,
        "avg_tags_per_resource": round(avg_tags, 1),
    }
