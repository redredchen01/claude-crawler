"""Tests for ranking and filtering."""

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.ranker import Ranker
from cover_selector.schemas.frame_features import FrameFeatures


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture
def ranker(config):
    """Ranker instance."""
    return Ranker(config)


def create_frame(frame_id: int, blur_score: float = 80.0, face_count: int = 1) -> FrameFeatures:
    """Create a frame with specified properties."""
    return FrameFeatures(
        frame_id=frame_id,
        blur_score=blur_score,
        brightness_score=65.0,
        contrast_score=70.0,
        overexposure_score=5.0,
        underexposure_score=3.0,
        ocr_text_count=0,
        ocr_text_area_ratio=0.0,
        bottom_subtitle_ratio=0.0,
        corner_text_ratio=0.0,
        center_text_ratio=0.0,
        face_count=face_count,
        largest_face_ratio=0.25,
        face_edge_cutoff_ratio=0.0,
        primary_face_center_offset=0.1,
        is_closeup=False,
        is_subject_too_small=False,
        is_subject_cutoff=False,
        subject_center_offset=0.1,
        composition_balance_score=0.9,
        duplicate_group_id=None,
        duplicate_similarity_score=0.0,
        final_score=0.0,
    )


def test_ranker_init(config):
    """Test Ranker initialization."""
    ranker = Ranker(config)
    assert ranker.config == config


def test_hard_filter_low_clarity(ranker):
    """Test hard filtering of low clarity frames."""
    frame = create_frame(0, blur_score=20.0)

    violations = ranker._check_violations(frame)

    assert "clarity_too_low" in violations


def test_hard_filter_no_face(ranker):
    """Test hard filtering of frames with no faces."""
    frame = create_frame(0, face_count=0)

    violations = ranker._check_violations(frame)

    assert "no_face_detected" in violations


def test_hard_filter_small_subject(ranker):
    """Test hard filtering of small subjects."""
    frame = create_frame(0)
    frame.largest_face_ratio = 0.02

    violations = ranker._check_violations(frame)

    assert "subject_too_small" in violations


def test_no_violations_high_quality_frame(ranker):
    """Test that high quality frames pass all checks."""
    frame = create_frame(0)

    violations = ranker._check_violations(frame)

    assert len(violations) == 0


def test_calculate_confidence_consistent_scores(ranker):
    """Test confidence calculation for consistent scores."""
    score_data = {
        "blur_score": 80.0,
        "score_breakdown": {
            "clarity": 20,
            "cleanliness": 20,
            "subject_presence": 16,
            "composition": 16,
            "cover_suitability": 8,
        },
    }

    confidence = ranker._calculate_confidence(score_data)

    assert confidence > 80  # Should be high for consistent scores


def test_calculate_confidence_inconsistent_scores(ranker):
    """Test confidence calculation for inconsistent scores."""
    score_data = {
        "blur_score": 50.0,
        "score_breakdown": {
            "clarity": 25,
            "cleanliness": 5,
            "subject_presence": 20,
            "composition": 2,
            "cover_suitability": 10,
        },
    }

    confidence = ranker._calculate_confidence(score_data)

    # Should be a valid confidence score
    assert 0 <= confidence <= 100
    # High variance should result in moderate confidence
    assert confidence < 90


def test_violation_severity_no_face_critical(ranker):
    """Test that no-face violation is critical."""
    frame = create_frame(0, face_count=0)

    severity = ranker._calculate_violation_severity(frame, ["no_face_detected"])

    assert severity > 15  # Should be significant


def test_violation_severity_low_clarity(ranker):
    """Test clarity violation severity."""
    frame = create_frame(0, blur_score=10.0)

    severity = ranker._calculate_violation_severity(frame, ["clarity_too_low"])

    assert severity > 10
