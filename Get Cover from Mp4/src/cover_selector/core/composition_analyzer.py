"""Composition analysis based on face detection results."""

from cover_selector.config import CompositionAnalysisConfig


class CompositionAnalyzer:
    """Analyzes image composition using face detection results."""

    def __init__(self, config: CompositionAnalysisConfig):
        """
        Initialize composition analyzer.

        Args:
            config: Composition analysis configuration
        """
        self.config = config

    def analyze(self, face_features: dict) -> dict:
        """
        Analyze image composition based on face detection.

        Args:
            face_features: Output from FaceAnalyzer.analyze()

        Returns:
            Dictionary with composition metrics:
            - is_closeup: Face is too large (closeup)
            - is_subject_too_small: Subject is too small
            - is_subject_cutoff: Subject cut off at edges
            - subject_center_offset: Subject offset from center
            - composition_balance_score: Composition balance (0-1)
        """
        largest_face_ratio = face_features.get("largest_face_ratio", 0.0)
        face_edge_cutoff_ratio = face_features.get("face_edge_cutoff_ratio", 0.0)
        primary_face_center_offset = face_features.get("primary_face_center_offset", 0.0)
        face_count = face_features.get("face_count", 0)

        # is_closeup: face ratio > threshold
        is_closeup = largest_face_ratio > self.config.closeup_threshold

        # is_subject_too_small: face ratio < threshold
        is_subject_too_small = largest_face_ratio < self.config.subject_too_small_threshold

        # is_subject_cutoff: face edge cutoff > threshold
        is_subject_cutoff = face_edge_cutoff_ratio > self.config.cutoff_threshold

        # subject_center_offset: normalized offset of primary face
        subject_center_offset = primary_face_center_offset if face_count > 0 else 1.0

        # composition_balance_score: 1 - abs(offset - 0.5) / 0.5
        # Higher score when subject is closer to center
        composition_balance = 1.0 - (subject_center_offset / 0.5)
        composition_balance_score = max(0.0, min(1.0, composition_balance))

        return {
            "is_closeup": bool(is_closeup),
            "is_subject_too_small": bool(is_subject_too_small),
            "is_subject_cutoff": bool(is_subject_cutoff),
            "subject_center_offset": float(subject_center_offset),
            "composition_balance_score": float(composition_balance_score),
        }
