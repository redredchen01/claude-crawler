"""Tests for scoring."""

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.scorer import Scorer
from cover_selector.schemas.frame_features import FrameFeatures


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture
def scorer(config):
    """Scorer instance."""
    return Scorer(config.scorer)


def create_high_quality_frame() -> FrameFeatures:
    """Create a high-quality frame."""
    return FrameFeatures(
        frame_id=0,
        blur_score=85.0,
        brightness_score=65.0,
        contrast_score=70.0,
        overexposure_score=5.0,
        underexposure_score=3.0,
        ocr_text_count=0,
        ocr_text_area_ratio=0.0,
        bottom_subtitle_ratio=0.0,
        corner_text_ratio=0.0,
        center_text_ratio=0.0,
        face_count=1,
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


def test_scorer_init(config):
    """Test Scorer initialization."""
    scorer = Scorer(config)
    assert scorer.config == config


def test_score_high_quality_frame(scorer):
    """Test scoring a high-quality frame."""
    frame = create_high_quality_frame()
    result = scorer.score(frame)

    # Final score should be positive for high-quality frame
    assert result["final_score"] > 15
    assert result["clarity_score"] > 20
    assert result["cleanliness_score"] > 20


def test_score_blurry_frame(scorer):
    """Test scoring a blurry frame."""
    frame = create_high_quality_frame()
    frame.blur_score = 15.0

    result = scorer.score(frame)

    assert result["clarity_score"] < 10
    assert result["final_score"] < 50


def test_score_with_text_interference(scorer):
    """Test scoring with OCR text interference."""
    frame = create_high_quality_frame()
    frame.center_text_ratio = 0.3

    result = scorer.score(frame)

    # Text interference should reduce cleanliness score
    assert result["cleanliness_score"] < 25


def test_score_no_face(scorer):
    """Test scoring frame with no face."""
    frame = create_high_quality_frame()
    frame.face_count = 0

    result = scorer.score(frame)

    assert result["subject_presence_score"] == 0.0
    assert result["final_score"] < 50


def test_score_components_sum_correctly(scorer):
    """Test that score components are calculated correctly."""
    frame = create_high_quality_frame()
    result = scorer.score(frame)

    # Verify weights sum to 1.0
    weights = scorer.config.weights
    assert sum(weights) == pytest.approx(1.0, abs=0.01)

    # Verify final_score includes all components
    assert "score_breakdown" in result
    assert all(k in result["score_breakdown"] for k in
               ["clarity", "cleanliness", "subject_presence", "composition", "cover_suitability"])
