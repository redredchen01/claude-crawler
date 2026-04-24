from __future__ import annotations

"""Popularity scoring and tag analysis."""

import math
from datetime import datetime

from crawler import config, storage
from crawler.models import Resource, Tag
from crawler.classifier import predict_category


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

    # Phase 4: Automated Classification for resources without category
    updated_resources = storage.get_resources(db_path, scan_job_id)
    class_updates = []
    for r in updated_resources:
        if not r.category or r.category.lower() in ("other", "unknown", ""):
            predicted = predict_category(r.title, r.tags)
            if predicted != "Other":
                class_updates.append((predicted, r.id))

    if class_updates:
        with storage.get_connection(db_path) as conn:
            conn.executemany("UPDATE resources SET category = ? WHERE id = ?", class_updates)

    storage.update_tag_counts(db_path, scan_job_id)
    storage.update_scan_job(
        db_path,
        scan_job_id,
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


def get_tag_cooccurrence(db_path: str, scan_job_id: int, top_n: int = 20) -> list[dict]:
    """Calculate tag co-occurrence matrix to find related topics."""
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources:
        return []

    from collections import Counter
    from itertools import combinations
    
    pairs = Counter()
    for res in resources:
        if len(res.tags) >= 2:
            # Sort tags to ensure (A, B) is same as (B, A)
            for pair in combinations(sorted(res.tags), 2):
                pairs[pair] += 1
                
    return [
        {"pair": list(pair), "count": count}
        for pair, count in pairs.most_common(top_n)
    ]


def hamming_distance(h1_hex: str, h2_hex: str) -> int:
    """Compute Hamming distance between two hex fingerprints."""
    try:
        n1 = int(h1_hex, 16)
        n2 = int(h2_hex, 16)
        x = n1 ^ n2
        dist = 0
        while x:
            dist += 1
            x &= x - 1
        return dist
    except (ValueError, TypeError):
        return 64


def cluster_resources(db_path: str, scan_job_id: int, threshold: int = 15) -> list[list[Resource]]:
    """Group resources in a scan job by content similarity (SimHash distance).
    
    Returns a list of clusters, where each cluster is a list of Resources.
    """
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources:
        return []

    clusters: list[list[Resource]] = []
    
    for res in resources:
        if not res.content_fingerprint or res.content_fingerprint == "0" * 16:
            # Skip resources without valid fingerprint
            clusters.append([res])
            continue
            
        found_cluster = False
        for cluster in clusters:
            # Compare with the first member of each cluster
            rep = cluster[0]
            if not rep.content_fingerprint:
                continue
                
            dist = hamming_distance(res.content_fingerprint, rep.content_fingerprint)
            if dist <= threshold:
                cluster.append(res)
                found_cluster = True
                break
        
        if not found_cluster:
            clusters.append([res])
            
    return clusters


def get_cluster_report(db_path: str, scan_job_id: int, threshold: int = 15) -> list[dict]:
    """Generate a high-level similarity report for the UI.
    
    Identifies groups of resources with highly similar content fingerprints.
    """
    clusters = cluster_resources(db_path, scan_job_id, threshold)
    report = []
    
    for cluster in clusters:
        if len(cluster) <= 1:
            continue
            
        # Group traits
        titles = [r.title for r in cluster]
        urls = [r.url for r in cluster]
        common_tags = set(cluster[0].tags)
        for r in cluster[1:]:
            common_tags &= set(r.tags)
            
        report.append({
            "size": len(cluster),
            "representative_title": cluster[0].title,
            "similar_titles": titles[1:],
            "urls": urls,
            "common_tags": list(common_tags),
            "avg_popularity": round(sum(r.popularity_score for r in cluster) / len(cluster), 1)
        })
        
    # Sort by cluster size
    report.sort(key=lambda x: x["size"], reverse=True)
    return report


def get_similar_items(db_path: str, resource_id: int, limit: int = 5) -> list[Resource]:
    """Find resources with similar content fingerprints to the given resource."""
    with storage.get_connection(db_path) as conn:
        target = conn.execute(
            "SELECT content_fingerprint, scan_job_id FROM resources WHERE id = ?",
            (resource_id,),
        ).fetchone()
        
        if not target or not target["content_fingerprint"]:
            return []
            
        others = storage.get_resources(db_path, target["scan_job_id"])
        
    recommendations = []
    for res in others:
        if res.id == resource_id:
            continue
        if not res.content_fingerprint:
            continue
            
        dist = hamming_distance(target["content_fingerprint"], res.content_fingerprint)
        if dist <= 15:
            recommendations.append((dist, res))
            
    recommendations.sort(key=lambda x: x[0])
    return [r[1] for r in recommendations[:limit]]


def get_keyword_frequency(db_path: str, scan_job_id: int, top_n: int = 20) -> list[dict]:
    """Analyze keyword frequency in resource titles to discover dominant themes."""
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources: return []
    
    from collections import Counter
    import re
    
    # Simple stop words for English and generic terms
    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "with", "to", "for", "of", "at", "by", "is", "this", "that"}
    
    words = Counter()
    for res in resources:
        if res.title:
            # Tokenize and clean
            tokens = re.findall(r'\b\w+\b', res.title.lower())
            for t in tokens:
                if len(t) > 2 and t not in stop_words and not t.isdigit():
                    words[t] += 1
                    
    return [{"keyword": k, "count": v} for k, v in words.most_common(top_n)]


def get_trend_analysis(db_path: str, scan_job_id: int) -> dict:
    """Detect trends by analyzing resource discovery over time (simulated GA integration)."""
    resources = storage.get_resources(db_path, scan_job_id)
    if not resources: return {}
    
    from collections import defaultdict
    import datetime
    
    # Group by day (using fetched_at or just simulating a timeline for demonstration)
    # In a real scenario with historical data, we use the actual published_at date.
    trends = defaultdict(int)
    for res in resources:
        # Fallback to category as a trend dimension if dates are sparse
        cat = res.category or "Uncategorized"
        trends[cat] += 1
        
    # Format for charting
    chart_data = [{"Dimension": k, "Volume": v} for k, v in trends.items()]
    return {"trends": chart_data}

