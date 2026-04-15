"""Report generation and output file creation."""

import json
from pathlib import Path
from shutil import copy2
from typing import Dict, List

from cover_selector.schemas.ranking_result import RankingResult
from cover_selector.schemas.candidate_frame import CandidateFrame
from cover_selector.schemas.frame_features import FrameFeatures


class ReportBuilder:
    """Generates JSON reports and organizes output files."""

    def __init__(self, output_dir: Path):
        """
        Initialize report builder.

        Args:
            output_dir: Directory for output files
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_reports(
        self,
        ranking_results: List[RankingResult],
        candidate_frames: Dict[int, CandidateFrame],
        all_features: Dict[int, FrameFeatures],
        top_k: int = 5,
    ) -> Dict[str, Path]:
        """
        Generate all output files and reports.

        Args:
            ranking_results: Sorted ranking results
            candidate_frames: All candidate frames
            all_features: All extracted features
            top_k: Number of top candidates to save

        Returns:
            Dictionary mapping output file names to their paths
        """
        output_files = {}

        # Get top candidates and find final cover
        normal_results = [r for r in ranking_results if r.status == "normal"]
        degraded_results = [r for r in ranking_results if r.status == "degraded"]

        if normal_results:
            final_result = normal_results[0]
        elif degraded_results:
            final_result = degraded_results[0]
        else:
            final_result = ranking_results[0] if ranking_results else None

        # Copy final cover
        if final_result is not None and final_result.frame_id in candidate_frames:
            final_cover_path = self._copy_final_cover(
                candidate_frames[final_result.frame_id].image_path
            )
            output_files["final_cover.jpg"] = final_cover_path

        # Copy candidate frames
        frames_dir = self._copy_candidate_frames(
            candidate_frames, ranking_results[:top_k]
        )
        output_files["candidate_frames"] = frames_dir

        # Generate JSON reports
        top_candidates_path = self._build_top_candidates_json(
            ranking_results, candidate_frames, all_features, top_k
        )
        output_files["top_candidates.json"] = top_candidates_path

        scoring_report_path = self._build_scoring_report_json(
            ranking_results, all_features
        )
        output_files["scoring_report.json"] = scoring_report_path

        reject_log_path = self._build_reject_log_json(ranking_results)
        output_files["reject_log.json"] = reject_log_path

        return output_files

    def _copy_final_cover(self, source_path: Path) -> Path:
        """Copy final cover to output directory."""
        output_path = self.output_dir / "final_cover.jpg"
        if Path(source_path).exists():
            copy2(str(source_path), str(output_path))
        return output_path

    def _copy_candidate_frames(
        self,
        candidate_frames: Dict[int, CandidateFrame],
        top_results: List[RankingResult],
    ) -> Path:
        """Copy top candidate frames to output directory."""
        frames_dir = self.output_dir / "candidate_frames"
        frames_dir.mkdir(exist_ok=True)

        for result in top_results:
            if result.frame_id in candidate_frames:
                src = candidate_frames[result.frame_id].image_path
                dst = frames_dir / f"rank_{result.rank:02d}_frame_{result.frame_id}.jpg"
                if Path(src).exists():
                    copy2(str(src), str(dst))

        return frames_dir

    def _build_top_candidates_json(
        self,
        ranking_results: List[RankingResult],
        candidate_frames: Dict[int, CandidateFrame],
        all_features: Dict[int, FrameFeatures],
        top_k: int,
    ) -> Path:
        """Build top_candidates.json report."""
        output_path = self.output_dir / "top_candidates.json"

        candidates = []
        for result in ranking_results[:top_k]:
            if result.status == "rejected":
                continue

            fid = result.frame_id
            frame = candidate_frames.get(fid)
            features = all_features.get(fid)

            candidates.append({
                "rank": result.rank,
                "frame_id": fid,
                "timestamp": frame.timestamp_sec if frame else 0.0,
                "final_score": result.final_score,
                "confidence": result.confidence_score,
                "status": result.status,
                "score_breakdown": result.score_breakdown,
            })

        with open(output_path, "w") as f:
            json.dump(
                {
                    "total_candidates": len(candidates),
                    "candidates": candidates,
                },
                f,
                indent=2,
            )

        return output_path

    def _build_scoring_report_json(
        self,
        ranking_results: List[RankingResult],
        all_features: Dict[int, FrameFeatures],
    ) -> Path:
        """Build scoring_report.json with detailed analysis."""
        output_path = self.output_dir / "scoring_report.json"

        results = []
        for result in ranking_results:
            fid = result.frame_id
            features = all_features.get(fid)

            if features:
                results.append({
                    "frame_id": fid,
                    "rank": result.rank,
                    "final_score": result.final_score,
                    "status": result.status,
                    "features": {
                        "blur_score": features.blur_score,
                        "brightness_score": features.brightness_score,
                        "contrast_score": features.contrast_score,
                        "face_count": features.face_count,
                        "composition_balance": features.composition_balance_score,
                        "ocr_text_area_ratio": features.ocr_text_area_ratio,
                    },
                    "score_breakdown": result.score_breakdown,
                })

        with open(output_path, "w") as f:
            json.dump(
                {
                    "total_frames": len(results),
                    "frames": results,
                },
                f,
                indent=2,
            )

        return output_path

    def _build_reject_log_json(
        self,
        ranking_results: List[RankingResult],
    ) -> Path:
        """Build reject_log.json with rejection reasons."""
        output_path = self.output_dir / "reject_log.json"

        rejected = []
        for result in ranking_results:
            if result.status == "rejected":
                rejected.append({
                    "frame_id": result.frame_id,
                    "violation_severity": result.violation_severity_score,
                    "violation_reasons": result.violation_reasons,
                    "final_score": result.final_score,
                })

        with open(output_path, "w") as f:
            json.dump(
                {
                    "total_rejected": len(rejected),
                    "rejected_frames": rejected,
                },
                f,
                indent=2,
            )

        return output_path
