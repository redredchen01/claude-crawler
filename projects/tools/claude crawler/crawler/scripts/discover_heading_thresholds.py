#!/usr/bin/env python
"""Empirically derive heading hierarchy thresholds for page type detection.

Analyzes real 'other' pages to compute F1 scores for different threshold
combinations. Outputs recommended thresholds with confidence scores.
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

from bs4 import BeautifulSoup


def analyze_html(html: str) -> Dict[str, Any]:
    """Extract heading counts and body metrics from HTML."""
    soup = BeautifulSoup(html, "html.parser")

    h1_count = len(soup.find_all("h1"))
    h2_plus_count = len(soup.find_all(["h2", "h3", "h4"]))
    body_text = soup.get_text(strip=True)
    body_length = len(body_text)

    return {
        "h1_count": h1_count,
        "h2_plus_count": h2_plus_count,
        "body_length": body_length,
    }


def apply_threshold_set(metrics: Dict[str, Any], threshold_set: Dict[str, int]) -> str:
    """Apply a threshold set to classify page as detail, list, or None."""
    h1 = metrics["h1_count"]
    h2_plus = metrics["h2_plus_count"]
    body_len = metrics["body_length"]

    h1_max = threshold_set["h1_max"]
    h2_max = threshold_set["h2_max"]
    body_min = threshold_set["body_min"]
    h2_list_min = threshold_set["h2_list_min"]
    h1_list_min = threshold_set["h1_list_min"]

    # No h1 → unclear
    if h1 == 0:
        return "list" if h2_plus > 5 else None

    # Single h1 + sparse h2+ + reasonable body → detail
    if h1 <= h1_max and h2_plus <= h2_max and body_len > body_min:
        return "detail"

    # Many h2+ → list
    if h2_plus >= h2_list_min:
        return "list"

    # Multiple h1 → list
    if h1 >= h1_list_min:
        return "list"

    return None


def compute_f1_metrics(predictions: List[str], ground_truth: List[str]) -> Dict[str, float]:
    """Compute F1, precision, recall for detail vs non-detail classification."""
    tp = sum(1 for p, g in zip(predictions, ground_truth) if p == "detail" and g == "detail")
    fp = sum(1 for p, g in zip(predictions, ground_truth) if p == "detail" and g != "detail")
    fn = sum(1 for p, g in zip(predictions, ground_truth) if p != "detail" and g == "detail")

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    return {
        "precision": round(precision, 2),
        "recall": round(recall, 2),
        "f1_score": round(f1, 2),
    }


def discover_thresholds(
    samples: List[Dict[str, Any]],
    threshold_candidates: List[Dict[str, int]],
) -> Dict[str, Any]:
    """Test candidate threshold sets, return best one."""

    # Extract ground truth (assumed in samples["correct_type"])
    ground_truth = [s["correct_type"] for s in samples]

    results = []
    for i, candidate in enumerate(threshold_candidates):
        # Apply threshold set to all samples
        predictions = [
            apply_threshold_set(s, candidate)
            for s in samples
        ]

        # Fill None predictions conservatively (assume "other")
        predictions = [p if p is not None else "other" for p in predictions]

        metrics = compute_f1_metrics(predictions, ground_truth)

        result = {
            "name": candidate.get("name", f"Set {chr(65 + i)}"),
            **candidate,
            **metrics,
        }
        results.append(result)

    # Sort by F1 score (descending)
    results.sort(key=lambda x: x["f1_score"], reverse=True)
    best = results[0]

    return {
        "threshold_sets": results,
        "recommended_set": best["name"],
        "best_precision": best["precision"],
        "best_f1": best["f1_score"],
        "samples_evaluated": len(samples),
    }


def main():
    """Main: discover thresholds from samples."""

    # Sample test data (mock for now; replace with real data from DB)
    # Format: {h1, h2+, body_len, correct_type}
    test_samples = [
        # Detail pages
        {"h1_count": 1, "h2_plus_count": 2, "body_length": 1200, "correct_type": "detail"},
        {"h1_count": 1, "h2_plus_count": 1, "body_length": 800, "correct_type": "detail"},
        {"h1_count": 1, "h2_plus_count": 3, "body_length": 1500, "correct_type": "detail"},
        {"h1_count": 0, "h2_plus_count": 0, "body_length": 900, "correct_type": "detail"},

        # List pages
        {"h1_count": 0, "h2_plus_count": 12, "body_length": 2000, "correct_type": "list"},
        {"h1_count": 1, "h2_plus_count": 10, "body_length": 1800, "correct_type": "list"},
        {"h1_count": 2, "h2_plus_count": 6, "body_length": 2200, "correct_type": "list"},
        {"h1_count": 0, "h2_plus_count": 8, "body_length": 1600, "correct_type": "list"},
    ]

    # Candidate threshold sets
    candidates = [
        {
            "name": "Set A (Conservative)",
            "h1_max": 1,
            "h2_max": 3,
            "body_min": 500,
            "h2_list_min": 8,
            "h1_list_min": 2,
        },
        {
            "name": "Set B (Balanced)",
            "h1_max": 1,
            "h2_max": 5,
            "body_min": 800,
            "h2_list_min": 6,
            "h1_list_min": 2,
        },
        {
            "name": "Set C (Lenient)",
            "h1_max": 1,
            "h2_max": 6,
            "body_min": 600,
            "h2_list_min": 7,
            "h1_list_min": 2,
        },
    ]

    result = discover_thresholds(test_samples, candidates)

    output_path = Path("crawler/scripts/threshold_discovery_output.json")
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"✓ Threshold discovery complete: {output_path}")
    print(f"  Recommended: {result['recommended_set']} (F1={result['best_f1']})")


if __name__ == "__main__":
    main()
