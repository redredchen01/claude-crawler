"""Ranking, filtering, and deduplication of scored frames."""

import statistics
from typing import List, Tuple

from cover_selector.config import CoverSelectorConfig
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult


class Ranker:
    """Ranks and filters frames based on scores and hard rules."""

    def __init__(self, config: CoverSelectorConfig):
        """
        Initialize ranker.

        Args:
            config: Complete configuration
        """
        self.config = config
        self.hard_filter_rules = self._get_hard_filter_rules()

    def rank(
        self, features_list: List[FrameFeatures], scores_dict: dict
    ) -> Tuple[List[RankingResult], dict]:
        """
        Rank frames with hard filtering and deduplication.

        Args:
            features_list: List of FrameFeatures objects
            scores_dict: Dict of frame_id -> score results

        Returns:
            Tuple of (ranked_results, report_metadata)
        """
        # Apply hard filters
        rejected, accepted = self._apply_hard_filters(features_list, scores_dict)

        # Handle deduplication
        accepted = self._handle_deduplication(accepted, scores_dict)

        # Sort by score
        accepted_sorted = sorted(
            accepted, key=lambda f: scores_dict[f.frame_id]["final_score"], reverse=True
        )

        # Create results
        results = []

        if accepted_sorted:
            # Normal case: some frames passed
            for rank, frame_features in enumerate(accepted_sorted[: self.config.scorer.top_k], 1):
                frame_id = frame_features.frame_id
                score_data = scores_dict[frame_id]

                result = RankingResult(
                    rank=rank,
                    frame_id=frame_id,
                    final_score=score_data["final_score"],
                    confidence_score=self._calculate_confidence(score_data),
                    status="normal",
                    violation_reasons=[],
                    score_breakdown=score_data.get("score_breakdown", {}),
                )
                results.append(result)

            report_status = "normal"
            report_warning = None

        else:
            # All rejected: apply degradation strategy
            borderline = self._calculate_borderline(rejected, scores_dict)
            results = borderline
            report_status = "ALL_REJECTED"
            report_warning = (
                "⚠️ No frames passed primary filters. "
                "Top 3 borderline candidates shown. Recommend manual review."
            )

        return results, {
            "status": report_status,
            "warning": report_warning,
            "total_frames": len(features_list),
            "accepted_frames": len(accepted_sorted),
            "rejected_frames": len(rejected),
        }

    def _apply_hard_filters(
        self, features_list: List[FrameFeatures], scores_dict: dict
    ) -> Tuple[List[FrameFeatures], List[FrameFeatures]]:
        """
        Apply hard filter rules.

        Returns:
            Tuple of (rejected, accepted) frame lists
        """
        rejected = []
        accepted = []

        for features in features_list:
            violations = self._check_violations(features)

            if violations:
                scores_dict[features.frame_id]["violations"] = violations
                rejected.append(features)
            else:
                accepted.append(features)

        return rejected, accepted

    def _check_violations(self, features: FrameFeatures) -> List[str]:
        """Check which hard filter rules are violated."""
        violations = []

        # Rule 1: Blur
        if features.blur_score < 30:
            violations.append("clarity_too_low")

        # Rule 2: Overexposure/underexposure
        if features.overexposure_score > 60 or features.underexposure_score > 50:
            violations.append("exposure_issue")

        # Rule 3: Bottom subtitle
        if features.bottom_subtitle_ratio > 0.3:
            violations.append("subtitle_interference")

        # Rule 4: Center text
        if features.center_text_ratio > 0.2:
            violations.append("center_text_interference")

        # Rule 5a: No face
        if features.face_count == 0:
            violations.append("no_face_detected")

        # Rule 5b: Face too small
        if features.face_count > 0 and features.largest_face_ratio < 0.05:
            violations.append("subject_too_small")

        # Rule 6: Closeup
        if features.is_closeup and features.largest_face_ratio > 0.6:
            violations.append("extreme_closeup")

        # Rule 7: Face cutoff
        if features.is_subject_cutoff and features.face_edge_cutoff_ratio > 0.1:
            violations.append("face_cutoff")

        # Rule 8: Duplicate (handled separately in _handle_deduplication)

        return violations

    def _handle_deduplication(
        self, frames: List[FrameFeatures], scores_dict: dict
    ) -> List[FrameFeatures]:
        """Remove duplicate frames, keeping only the highest-scoring one per group."""
        if not frames:
            return frames

        # Group frames by duplicate_group_id
        groups = {}
        for frame in frames:
            if frame.duplicate_group_id is not None:
                gid = frame.duplicate_group_id
                if gid not in groups:
                    groups[gid] = []
                groups[gid].append(frame)

        # Keep only highest-scoring frame per group
        result = []
        processed_groups = set()

        for frame in frames:
            if frame.duplicate_group_id is None:
                # Not a duplicate
                result.append(frame)
            elif frame.duplicate_group_id not in processed_groups:
                # First in group, keep it
                result.append(frame)
                processed_groups.add(frame.duplicate_group_id)

        return result

    def _calculate_confidence(self, score_data: dict) -> float:
        """Calculate confidence score based on sub-score variance."""
        score_breakdown = score_data.get("score_breakdown", {})
        scores = [
            score_breakdown.get("clarity", 0),
            score_breakdown.get("cleanliness", 0),
            score_breakdown.get("subject_presence", 0),
            score_breakdown.get("composition", 0),
            score_breakdown.get("cover_suitability", 0),
        ]

        if len(scores) < 2:
            return 80.0

        # Calculate standard deviation
        mean = statistics.mean(scores)
        if len(scores) == 1:
            std_dev = 0.0
        else:
            variance = sum((x - mean) ** 2 for x in scores) / (len(scores) - 1)
            std_dev = variance ** 0.5

        # Confidence based on consistency
        # std_dev < 10: high confidence (80-100)
        # std_dev 10-30: medium confidence (60-80)
        # std_dev > 30: low confidence (0-60)
        if std_dev < 10:
            confidence = 100.0 - (std_dev / 10) * 20
        elif std_dev < 30:
            confidence = 80.0 - ((std_dev - 10) / 20) * 20
        else:
            confidence = max(0.0, 60.0 - ((std_dev - 30) / 10) * 10)

        return min(100.0, max(0.0, confidence))

    def _calculate_borderline(
        self, rejected: List[FrameFeatures], scores_dict: dict
    ) -> List[RankingResult]:
        """
        Calculate borderline candidates from rejected frames.

        Returns top 3 least-violated frames.
        """
        # Calculate violation severity for each rejected frame
        borderline_frames = []

        for frame in rejected:
            violations = scores_dict[frame.frame_id].get("violations", [])
            severity = self._calculate_violation_severity(frame, violations)

            borderline_frames.append((frame, severity, violations))

        # Sort by severity (ascending) and score (descending)
        borderline_frames.sort(
            key=lambda x: (x[1], -scores_dict[x[0].frame_id]["final_score"])
        )

        # Create results for top 3
        results = []
        for rank, (frame, severity, violations) in enumerate(
            borderline_frames[:3], 1
        ):
            score_data = scores_dict[frame.frame_id]
            original_confidence = self._calculate_confidence(score_data)

            result = RankingResult(
                rank=rank,
                frame_id=frame.frame_id,
                final_score=score_data["final_score"],
                confidence_score=original_confidence * 0.5,  # Reduced confidence
                status="borderline",
                violation_reasons=violations,
                violation_severity_score=severity,
                score_breakdown=score_data.get("score_breakdown", {}),
            )
            results.append(result)

        return results

    def _calculate_violation_severity(
        self, frame: FrameFeatures, violations: List[str]
    ) -> float:
        """
        Calculate severity score for violations.

        Scale: 0-100, higher = more severe
        """
        # Rule weights (from plan)
        weights = {
            "clarity_too_low": 25,
            "exposure_issue": 20,
            "subtitle_interference": 18,
            "center_text_interference": 15,
            "no_face_detected": 30,
            "subject_too_small": 12,
            "extreme_closeup": 10,
            "face_cutoff": 16,
        }

        total_weight = sum(weights.values())  # 166
        severity = 0.0

        for violation in violations:
            if violation in weights:
                weight = weights[violation]
                deviation = self._calculate_deviation(frame, violation)
                severity += (weight / total_weight) * deviation * 100

        return min(100.0, severity)

    def _calculate_deviation(self, frame: FrameFeatures, violation: str) -> float:
        """Calculate deviation magnitude for a violation (0-1)."""
        if violation == "clarity_too_low":
            return (30 - frame.blur_score) / 30
        elif violation == "exposure_issue":
            expo = max(
                frame.overexposure_score - 60,
                frame.underexposure_score - 50,
                0,
            )
            return min(expo / 100, 1.0)
        elif violation == "subtitle_interference":
            return min(frame.bottom_subtitle_ratio / 0.7, 1.0)
        elif violation == "center_text_interference":
            return min(frame.center_text_ratio / 0.8, 1.0)
        elif violation == "no_face_detected":
            return 1.0
        elif violation == "subject_too_small":
            return (0.05 - frame.largest_face_ratio) / 0.05
        elif violation == "extreme_closeup":
            return (frame.largest_face_ratio - 0.6) / 0.4
        elif violation == "face_cutoff":
            return min(frame.face_edge_cutoff_ratio / 0.9, 1.0)
        return 0.0

    def _get_hard_filter_rules(self):
        """Get hard filter rules configuration."""
        return {
            "clarity": self.config.blur_analysis.blur_threshold,
            "overexposure": 60,
            "underexposure": 50,
            "bottom_subtitle": self.config.ocr_detection.bottom_subtitle_ratio_threshold,
            "center_text": self.config.ocr_detection.center_text_ratio_threshold,
        }
