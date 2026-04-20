#!/usr/bin/env python
"""Stratified extraction validation sampling.

Sample reclassified pages with stratification by page_type + detection_signal,
run extraction logic, verify ≥80% extraction success.
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict


# Mock extraction functions (replace with real extraction from parser.py)
def mock_extract_detail(html: str) -> Dict[str, Any]:
    """Mock detail extraction."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    title = h1.get_text(strip=True) if h1 else None
    return {
        "title": title,
        "url": "https://mock.example.com/item/123",  # Mock URL
    }


def mock_extract_list(html: str) -> List[Dict[str, Any]]:
    """Mock list extraction."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.card, .card")
    resources = []
    for card in cards[:5]:
        resources.append({
            "title": card.get_text(strip=True)[:50],
            "url": "https://mock.example.com/item/123",
        })
    return resources


def validate_resource(resource: Dict[str, Any]) -> bool:
    """Check if resource has required fields."""
    return bool(resource.get("title") and resource.get("url"))


def stratified_sample(
    reclassifications: List[Dict[str, Any]],
    sample_size: int = 50,
) -> Dict[str, List[Dict[str, Any]]]:
    """Perform stratified sampling by page_type + detection_signal."""

    # Group by stratum
    strata = defaultdict(list)
    for item in reclassifications:
        stratum = f"{item['new_type']}_{item['reason']}"
        strata[stratum].append(item)

    # Sample from each stratum
    sampled = defaultdict(list)
    items_per_stratum = max(1, sample_size // len(strata))

    for stratum, items in strata.items():
        sampled[stratum] = items[:items_per_stratum]

    return dict(sampled)


def validate_extraction(
    reclassifications: List[Dict[str, Any]],
    sample_size: int = 50,
    output_path: str = "validate_extraction_output.json",
) -> Dict[str, Any]:
    """Validate extraction on stratified sample."""

    # Stratified sampling
    stratified = stratified_sample(reclassifications, sample_size)

    results = {
        "stratified_sample": {},
        "sample_size": 0,
        "successful": 0,
        "failed": 0,
        "failures": [],
    }

    for stratum, items in stratified.items():
        stratum_results = {
            "total": len(items),
            "successful": 0,
        }

        for item in items:
            results["sample_size"] += 1
            success = False

            try:
                # Mock extraction based on page type
                if item["new_type"] == "detail":
                    resource = mock_extract_detail("")
                    if validate_resource(resource):
                        success = True
                        stratum_results["successful"] += 1
                        results["successful"] += 1
                elif item["new_type"] == "list":
                    resources = mock_extract_list("")
                    if any(validate_resource(r) for r in resources):
                        success = True
                        stratum_results["successful"] += 1
                        results["successful"] += 1
            except Exception as e:
                results["failures"].append({
                    "url": item["url"],
                    "new_type": item["new_type"],
                    "detection_signal": item["reason"],
                    "extraction_error": str(e),
                })

            if not success:
                results["failed"] += 1
                if not results["failures"] or results["failures"][-1]["url"] != item["url"]:
                    results["failures"].append({
                        "url": item["url"],
                        "new_type": item["new_type"],
                        "detection_signal": item["reason"],
                        "extraction_error": "no_resource_extracted",
                    })

        results["stratified_sample"][stratum] = stratum_results

    # Calculate metrics
    if results["sample_size"] > 0:
        results["success_rate"] = round(results["successful"] / results["sample_size"], 2)
    else:
        results["success_rate"] = 0.0

    # False positive rate: count detail→list reclassifications where extraction failed
    false_positives = sum(
        1 for f in results["failures"]
        if f["new_type"] == "list"  # Reclassified to list
    )
    results["false_positive_rate"] = (
        round(false_positives / results["sample_size"], 2)
        if results["sample_size"] > 0
        else 0.0
    )

    # Determine pass/fail
    results["pass"] = (
        results["success_rate"] >= 0.80 and results["false_positive_rate"] < 0.05
    )

    # Write output
    output_file = Path(output_path)
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)

    return results


def main():
    parser = argparse.ArgumentParser(description="Extraction validation sampling")
    parser.add_argument("--sample-size", type=int, default=50, help="Sample size (default 50)")
    parser.add_argument(
        "--input",
        type=str,
        default="offline_reclassify_output.json",
        help="Input JSON from offline_reclassify",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="validate_extraction_output.json",
        help="Output JSON file",
    )
    args = parser.parse_args()

    # Load reclassification results
    input_file = Path(args.input)
    if not input_file.exists():
        print(f"✗ Input file not found: {args.input}")
        return

    with open(input_file) as f:
        data = json.load(f)

    # Run validation
    result = validate_extraction(
        data["results"],
        sample_size=args.sample_size,
        output_path=args.output,
    )

    print(f"✓ Extraction validation complete")
    print(f"  Sample size: {result['sample_size']}")
    print(f"  Success rate: {result['success_rate']}")
    print(f"  False positive rate: {result['false_positive_rate']}")
    print(f"  PASS: {result['pass']}")
    print(f"  Output: {args.output}")


if __name__ == "__main__":
    main()
