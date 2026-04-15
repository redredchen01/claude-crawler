"""Builds composition reports."""

import json
import logging
from pathlib import Path
from typing import Dict, Optional

from cover_selector.core.composer_analyzer import CompositionAnalysisResult

logger = logging.getLogger(__name__)


class CompositionReportBuilder:
    """Builds and saves composition reports."""

    def build_report(
        self,
        composition_result: CompositionAnalysisResult,
        output_filename: str,
    ) -> Dict:
        """
        Build a composition report from analysis results.

        Args:
            composition_result: CompositionAnalysisResult from composer analyzer
            output_filename: Name of the output file

        Returns:
            Report dictionary
        """
        report = {
            "mode": "degraded" if composition_result.is_degraded else "triple",
            "degradation_reason": composition_result.degradation_reason,
            "output_file": output_filename,
        }

        # Add bottom image info
        if composition_result.bottom_image:
            report["bottom_image"] = {
                "frame_id": composition_result.bottom_image.frame_id,
                "timestamp_sec": composition_result.bottom_image.timestamp_sec,
                "blur_score": composition_result.bottom_image.blur_score,
            }

        # Add zoom images info
        if composition_result.zoom_images:
            report["zoom_images"] = [
                {
                    "frame_id": z.frame_id,
                    "timestamp_sec": z.timestamp_sec,
                    "blur_score": z.blur_score,
                }
                for z in composition_result.zoom_images
            ]

        # Summary statistics
        report["summary"] = {
            "total_candidates": 0,  # Will be populated by caller if needed
            "valid_candidates": 0,  # Will be populated by caller if needed
            "selected_frames": 1 + len(composition_result.zoom_images),
        }

        logger.info(f"Built composition report: {report['mode']} mode")
        return report

    def save_report(self, report: Dict, output_path: str) -> None:
        """
        Save report to JSON file.

        Args:
            report: Report dictionary
            output_path: Path to save report to
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)

        logger.info(f"Saved composition report to {output_path}")
