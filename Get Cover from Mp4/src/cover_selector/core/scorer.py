"""Rule-based scoring of candidate frames."""

from cover_selector.config import ScorerConfig
from cover_selector.schemas.frame_features import FrameFeatures


class Scorer:
    """Computes final score from frame features using rule-based weights."""

    def __init__(self, config: ScorerConfig):
        """
        Initialize scorer.

        Args:
            config: Scorer configuration with weights and thresholds
        """
        self.config = config

    def score(self, features: FrameFeatures) -> dict:
        """
        Compute final score from frame features.

        Args:
            features: Extracted frame features

        Returns:
            Dictionary with:
            - clarity_score: 0-25 (clarity component)
            - cleanliness_score: 0-25 (text/watermark absence)
            - subject_presence_score: 0-20 (face presence)
            - composition_score: 0-20 (composition quality)
            - cover_suitability_score: 0-10 (overall suitability)
            - penalty_score: Accumulated penalties
            - final_score: Weighted sum - penalty (0-100)
            - score_breakdown: Detailed breakdown
        """
        # Component 1: Clarity (0-25)
        clarity_score = self._score_clarity(features)

        # Component 2: Cleanliness (0-25)
        cleanliness_score = self._score_cleanliness(features)

        # Component 3: Subject Presence (0-20)
        subject_presence_score = self._score_subject_presence(features)

        # Component 4: Composition (0-20)
        composition_score = self._score_composition(features)

        # Component 5: Cover Suitability (0-10)
        cover_suitability_score = self._score_cover_suitability(features)

        # Calculate penalties
        penalty_score = self._calculate_penalties(features)

        # Weighted sum
        weights = self.config.weights
        weighted_sum = (
            clarity_score * weights[0]
            + cleanliness_score * weights[1]
            + subject_presence_score * weights[2]
            + composition_score * weights[3]
            + cover_suitability_score * weights[4]
        )

        # Final score
        final_score = max(0.0, min(100.0, weighted_sum - penalty_score))

        return {
            "clarity_score": float(clarity_score),
            "cleanliness_score": float(cleanliness_score),
            "subject_presence_score": float(subject_presence_score),
            "composition_score": float(composition_score),
            "cover_suitability_score": float(cover_suitability_score),
            "penalty_score": float(penalty_score),
            "final_score": float(final_score),
            "score_breakdown": {
                "clarity": clarity_score,
                "cleanliness": cleanliness_score,
                "subject_presence": subject_presence_score,
                "composition": composition_score,
                "cover_suitability": cover_suitability_score,
                "penalty": penalty_score,
            },
        }

    def _score_clarity(self, features: FrameFeatures) -> float:
        """Score clarity based on blur_score."""
        return features.blur_score * 0.25  # Max 25

    def _score_cleanliness(self, features: FrameFeatures) -> float:
        """Score cleanliness based on OCR text areas."""
        # Penalty for various text regions
        text_penalty = (
            features.bottom_subtitle_ratio * 10
            + features.corner_text_ratio * 5
            + features.center_text_ratio * 10
        )
        score = max(0.0, 25.0 - text_penalty)
        return min(25.0, score)

    def _score_subject_presence(self, features: FrameFeatures) -> float:
        """Score subject presence based on face detection."""
        if features.face_count == 0:
            return 0.0

        # Prefer single face
        if features.face_count > 1:
            return 10.0  # Lower score for multiple faces

        # Score based on face size
        face_ratio = features.largest_face_ratio
        if face_ratio < 0.05:
            return 5.0  # Too small
        elif face_ratio > 0.4:
            return 15.0  # Good but may be closeup
        else:
            return 20.0  # Ideal

    def _score_composition(self, features: FrameFeatures) -> float:
        """Score composition based on subject position and balance."""
        base_score = 20.0

        # Reduce for closeup
        if features.is_closeup:
            base_score -= 5.0

        # Reduce for small subject
        if features.is_subject_too_small:
            base_score -= 5.0

        # Reduce for cutoff
        if features.is_subject_cutoff:
            base_score -= 5.0

        # Bonus for good centering
        if features.composition_balance_score > 0.7:
            base_score += 2.0

        return max(0.0, min(20.0, base_score))

    def _score_cover_suitability(self, features: FrameFeatures) -> float:
        """Score overall cover suitability."""
        score = 10.0

        # Reduce for high clarity but low subject
        if features.blur_score > 70 and features.face_count == 0:
            score -= 3.0

        # Reduce for duplicate
        if features.duplicate_similarity_score > 0.5:
            score -= 2.0

        # Reduce for extreme brightness
        if features.overexposure_score > 40 or features.underexposure_score > 30:
            score -= 2.0

        return max(0.0, min(10.0, score))

    def _calculate_penalties(self, features: FrameFeatures) -> float:
        """Calculate penalty score from violations."""
        penalty = 0.0

        # Dark/overexposed penalty
        if features.underexposure_score > 40:
            penalty += features.underexposure_score * 0.3
        if features.overexposure_score > 40:
            penalty += features.overexposure_score * 0.2

        # Text interference penalty
        penalty += features.bottom_subtitle_ratio * 15
        penalty += features.center_text_ratio * 10

        # Face-related penalties
        if features.is_closeup:
            penalty += 5.0
        if features.is_subject_too_small:
            penalty += 5.0
        if features.is_subject_cutoff:
            penalty += 3.0

        # Duplicate penalty
        if features.duplicate_similarity_score > 0.5:
            penalty += 5.0

        return min(50.0, penalty)  # Cap penalty at 50
