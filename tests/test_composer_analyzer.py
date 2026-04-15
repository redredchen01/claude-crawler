"""Tests for composer analyzer frame selection logic."""

import pytest

from cover_selector.config import CompositionAnalysisConfig
from cover_selector.core.composer_analyzer import ComposerAnalyzer, CompositionAnalysisResult
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult


@pytest.fixture
def config():
    """Default composition analysis config."""
    return CompositionAnalysisConfig()


@pytest.fixture
def analyzer(config):
    """Composer analyzer instance."""
    return ComposerAnalyzer(config)


def test_composer_analyzer_init(config):
    """Test ComposerAnalyzer initialization."""
    analyzer = ComposerAnalyzer(config)
    assert analyzer.config == config


def test_compose_degraded_mode_insufficient_frames(analyzer):
    """Test degraded mode when fewer than 3 valid frames."""
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.8, final_score_breakdown={}),
        RankingResult(frame_id=1, status="accepted", final_score=0.6, final_score_breakdown={}),
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0,
            timestamp_sec=1.0,
            blur_score=80.0,
            laplacian_variance=100.0,
            edge_density=0.3,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.15,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.7,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.8,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1,
            timestamp_sec=2.0,
            blur_score=70.0,
            laplacian_variance=80.0,
            edge_density=0.25,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=15.0,
            underexposure_score=15.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.1,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.6,
            is_closeup=False,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.6,
            composition_balance_score=0.5,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.6,
            final_score_breakdown={},
        ),
    }

    result = analyzer.compose(ranking_results, frame_features)

    assert result.is_degraded is True
    assert "Insufficient frames" in result.degradation_reason
    assert result.bottom_image is not None
    assert len(result.zoom_images) == 0


def test_compose_selects_complete_bottom_frame(analyzer):
    """Test that bottom frame prefers complete (non-closeup) images."""
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.9, final_score_breakdown={}),  # Closeup
        RankingResult(frame_id=1, status="accepted", final_score=0.8, final_score_breakdown={}),  # Complete
        RankingResult(frame_id=2, status="accepted", final_score=0.7, final_score_breakdown={}),  # Closeup
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0,
            timestamp_sec=1.0,
            blur_score=85.0,
            laplacian_variance=100.0,
            edge_density=0.3,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.6,  # Closeup
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,  # Closeup preference penalty
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.6,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.9,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1,
            timestamp_sec=2.0,
            blur_score=80.0,
            laplacian_variance=95.0,
            edge_density=0.28,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.2,  # Complete frame
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,  # Complete frame gets bonus
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.8,  # Good composition balance
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.8,
            final_score_breakdown={},
        ),
        2: FrameFeatures(
            frame_id=2,
            timestamp_sec=3.0,
            blur_score=75.0,
            laplacian_variance=90.0,
            edge_density=0.25,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=15.0,
            underexposure_score=15.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.5,  # Closeup
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,  # Closeup penalty
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.5,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.7,
            final_score_breakdown={},
        ),
    }

    result = analyzer.compose(ranking_results, frame_features)

    assert result.is_degraded is False
    # Frame 1 should be selected as bottom (best complete frame despite lower base score)
    assert result.bottom_image.frame_id == 1
    assert len(result.zoom_images) == 2


def test_compose_selects_closeup_zoom_frames(analyzer):
    """Test that zoom frames prefer closeup/detailed images."""
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.9, final_score_breakdown={}),  # Complete
        RankingResult(frame_id=1, status="accepted", final_score=0.7, final_score_breakdown={}),  # Closeup
        RankingResult(frame_id=2, status="accepted", final_score=0.6, final_score_breakdown={}),  # Closeup
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0,
            timestamp_sec=1.0,
            blur_score=85.0,
            laplacian_variance=100.0,
            edge_density=0.3,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.2,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,  # Complete frame
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.8,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.9,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1,
            timestamp_sec=2.0,
            blur_score=80.0,
            laplacian_variance=95.0,
            edge_density=0.28,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.5,  # Closeup
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,  # Closeup gets bonus for zoom
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.7,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.7,
            final_score_breakdown={},
        ),
        2: FrameFeatures(
            frame_id=2,
            timestamp_sec=3.0,
            blur_score=78.0,
            laplacian_variance=92.0,
            edge_density=0.26,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=12.0,
            underexposure_score=12.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.55,  # Closeup
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,  # Closeup gets bonus for zoom
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.6,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.6,
            final_score_breakdown={},
        ),
    }

    result = analyzer.compose(ranking_results, frame_features)

    assert result.is_degraded is False
    # Frame 0 selected as bottom (complete frame)
    assert result.bottom_image.frame_id == 0
    # Frames 1 and 2 should be selected as zoom (closeups)
    assert len(result.zoom_images) == 2
    zoom_ids = {z.frame_id for z in result.zoom_images}
    assert 1 in zoom_ids
    assert 2 in zoom_ids


def test_compose_rejects_rejected_frames(analyzer):
    """Test that rejected frames are not selected."""
    ranking_results = [
        RankingResult(frame_id=0, status="rejected", final_score=0.9, final_score_breakdown={}),
        RankingResult(frame_id=1, status="accepted", final_score=0.8, final_score_breakdown={}),
        RankingResult(frame_id=2, status="accepted", final_score=0.7, final_score_breakdown={}),
        RankingResult(frame_id=3, status="accepted", final_score=0.6, final_score_breakdown={}),
    ]

    frame_features = {
        i: FrameFeatures(
            frame_id=i,
            timestamp_sec=float(i),
            blur_score=80.0 - i * 5,
            laplacian_variance=100.0 - i * 5,
            edge_density=0.3,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.2,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.7,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.9 - i * 0.1,
            final_score_breakdown={},
        )
        for i in range(4)
    }

    result = analyzer.compose(ranking_results, frame_features)

    assert result.is_degraded is False
    # Rejected frame should not be selected
    assert result.bottom_image.frame_id != 0
    for z in result.zoom_images:
        assert z.frame_id != 0


def test_compose_zoom_time_diversity(analyzer):
    """Test that zoom frames are selected with time diversity (#3 optimization).

    Setup:
    - Bottom at t=2.0
    - Zoom candidates: t=2.1 (too close, 0.1s), t=5.0 (good, 3.0s), t=8.0 (good, 6.0s)
    - video_duration=10.0, min_gap=2.0s
    - Expect: t=2.1 rejected, t=8.0 and t=5.0 selected
    """
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.9, final_score_breakdown={}),  # Bottom
        RankingResult(frame_id=1, status="accepted", final_score=0.8, final_score_breakdown={}),  # Too close
        RankingResult(frame_id=2, status="accepted", final_score=0.7, final_score_breakdown={}),  # Good distance
        RankingResult(frame_id=3, status="accepted", final_score=0.6, final_score_breakdown={}),  # Good distance
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0,
            timestamp_sec=2.0,  # Bottom
            blur_score=85.0,
            laplacian_variance=100.0,
            edge_density=0.3,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.2,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.8,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.9,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1,
            timestamp_sec=2.1,  # Too close to bottom (0.1s < 2.0s minimum)
            blur_score=80.0,
            laplacian_variance=95.0,
            edge_density=0.28,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.5,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.7,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.8,
            final_score_breakdown={},
        ),
        2: FrameFeatures(
            frame_id=2,
            timestamp_sec=5.0,  # Good distance (3.0s)
            blur_score=78.0,
            laplacian_variance=92.0,
            edge_density=0.26,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=12.0,
            underexposure_score=12.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.55,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.6,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.7,
            final_score_breakdown={},
        ),
        3: FrameFeatures(
            frame_id=3,
            timestamp_sec=8.0,  # Excellent distance (6.0s)
            blur_score=76.0,
            laplacian_variance=90.0,
            edge_density=0.25,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=14.0,
            underexposure_score=14.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.45,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.65,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.6,
            final_score_breakdown={},
        ),
    }

    # Pass video_duration to enable time diversity
    metadata = {'duration': 10.0}
    result = analyzer.compose(ranking_results, frame_features, metadata=metadata)

    assert result.is_degraded is False
    assert result.bottom_image.frame_id == 0
    # Should select frames with time diversity: NOT frame 1 (too close)
    # Should prefer frames 3 and 2 for their time distance
    zoom_ids = {z.frame_id for z in result.zoom_images}
    assert 1 not in zoom_ids, "Frame 1 (too close at t=2.1) should be filtered by time diversity"
    assert len(result.zoom_images) == 2


def test_compose_zoom_brightness_harmony(analyzer):
    """Test that brightness harmony affects zoom frame selection (#2 optimization).

    Setup:
    - Bottom brightness_score=70
    - Zoom A: brightness=72 (diff 2), base_score=80 → with harmony +6 = 86
    - Zoom B: brightness=10 (diff 60), base_score=85 → with harmony -8 = 77
    - Expect: Zoom A selected despite lower base score due to harmony bonus
    """
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.9, final_score_breakdown={}),  # Bottom
        RankingResult(frame_id=1, status="accepted", final_score=0.8, final_score_breakdown={}),  # Zoom A (harmony match)
        RankingResult(frame_id=2, status="accepted", final_score=0.85, final_score_breakdown={}),  # Zoom B (high base, bad harmony)
        RankingResult(frame_id=3, status="accepted", final_score=0.75, final_score_breakdown={}),  # Zoom C (filler)
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0,
            timestamp_sec=1.0,
            blur_score=85.0,
            laplacian_variance=100.0,
            edge_density=0.3,
            brightness_score=70.0,  # Reference brightness
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.2,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=False,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.8,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.9,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1,
            timestamp_sec=2.0,
            blur_score=80.0,
            laplacian_variance=95.0,
            edge_density=0.28,
            brightness_score=72.0,  # Similar to bottom (diff 2) → +6 harmony bonus
            contrast_score=50.0,
            overexposure_score=10.0,
            underexposure_score=10.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.3,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.7,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.8,
            final_score_breakdown={},
        ),
        2: FrameFeatures(
            frame_id=2,
            timestamp_sec=3.0,
            blur_score=82.0,
            laplacian_variance=93.0,
            edge_density=0.27,
            brightness_score=10.0,  # Very different from bottom (diff 60) → -8 harmony penalty
            contrast_score=50.0,
            overexposure_score=12.0,
            underexposure_score=12.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.35,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.75,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.85,  # Higher base score but poor harmony
            final_score_breakdown={},
        ),
        3: FrameFeatures(
            frame_id=3,
            timestamp_sec=4.0,
            blur_score=78.0,
            laplacian_variance=88.0,
            edge_density=0.24,
            brightness_score=50.0,
            contrast_score=50.0,
            overexposure_score=15.0,
            underexposure_score=15.0,
            ocr_text_count=0,
            ocr_text_area_ratio=0.0,
            bottom_subtitle_ratio=0.0,
            corner_text_ratio=0.0,
            center_text_ratio=0.0,
            face_count=1,
            largest_face_ratio=0.25,
            face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5,
            is_closeup=True,
            is_subject_too_small=False,
            is_subject_cutoff=False,
            subject_center_offset=0.5,
            composition_balance_score=0.65,
            duplicate_group_id=None,
            duplicate_similarity_score=0.0,
            final_score=0.75,
            final_score_breakdown={},
        ),
    }

    metadata = {'duration': 5.0}  # Enable time diversity
    result = analyzer.compose(ranking_results, frame_features, metadata=metadata)

    assert result.is_degraded is False
    assert result.bottom_image.frame_id == 0
    # Frame 1 (brightness harmony match) should be preferred over Frame 2
    zoom_ids = {z.frame_id for z in result.zoom_images}
    assert 1 in zoom_ids, "Frame 1 (brightness harmony match) should be selected"


def test_compose_zoom_content_diversity_face_vs_body(analyzer):
    """Test that zoom frames prefer different content types (face vs body).

    Setup (内容多样性优化):
    - Bottom: frame 0 (t=1.0, face_ratio=0.1, wide scene)
    - Zoom candidates:
      - frame 1: face_ratio=0.5 (脸部特写, face close-up), t=5.0, score=0.8 → zoom_1
      - frame 2: face_ratio=0.45 (脸部特写, similar to frame 1), t=5.5, score=0.75
      - frame 3: face_ratio=0.08 (身体或场景, body/scene), brightness=70, t=8.0, score=0.7

    Expected: zoom = {1, 3} because:
    - Frame 1 is best quality (0.8)
    - Frame 3 has DIFFERENT content type (body vs face)
    - Content diversity bonus outweighs Frame 2's slightly higher quality
    """
    ranking_results = [
        RankingResult(frame_id=0, status="accepted", final_score=0.9, final_score_breakdown={}),
        RankingResult(frame_id=1, status="accepted", final_score=0.8, final_score_breakdown={}),
        RankingResult(frame_id=2, status="accepted", final_score=0.75, final_score_breakdown={}),
        RankingResult(frame_id=3, status="accepted", final_score=0.7, final_score_breakdown={}),
    ]

    frame_features = {
        0: FrameFeatures(
            frame_id=0, timestamp_sec=1.0, blur_score=85.0, laplacian_variance=100.0,
            edge_density=0.3, brightness_score=50.0, contrast_score=50.0,
            overexposure_score=10.0, underexposure_score=10.0, ocr_text_count=0,
            ocr_text_area_ratio=0.0, bottom_subtitle_ratio=0.0, corner_text_ratio=0.0,
            center_text_ratio=0.0, face_count=1, largest_face_ratio=0.1, face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5, is_closeup=False, is_subject_too_small=False,
            is_subject_cutoff=False, subject_center_offset=0.5, composition_balance_score=0.8,
            duplicate_group_id=None, duplicate_similarity_score=0.0, final_score=0.9,
            final_score_breakdown={},
        ),
        1: FrameFeatures(
            frame_id=1, timestamp_sec=5.0, blur_score=80.0, laplacian_variance=95.0,
            edge_density=0.4, brightness_score=50.0, contrast_score=50.0,
            overexposure_score=10.0, underexposure_score=10.0, ocr_text_count=0,
            ocr_text_area_ratio=0.0, bottom_subtitle_ratio=0.0, corner_text_ratio=0.0,
            center_text_ratio=0.0, face_count=1, largest_face_ratio=0.5, face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.1, is_closeup=True, is_subject_too_small=False,
            is_subject_cutoff=False, subject_center_offset=0.5, composition_balance_score=0.7,
            duplicate_group_id=None, duplicate_similarity_score=0.0, final_score=0.8,
            final_score_breakdown={},
        ),
        2: FrameFeatures(
            frame_id=2, timestamp_sec=5.5, blur_score=79.0, laplacian_variance=94.0,
            edge_density=0.41, brightness_score=50.0, contrast_score=50.0,
            overexposure_score=10.0, underexposure_score=10.0, ocr_text_count=0,
            ocr_text_area_ratio=0.0, bottom_subtitle_ratio=0.0, corner_text_ratio=0.0,
            center_text_ratio=0.0, face_count=1, largest_face_ratio=0.45, face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.15, is_closeup=True, is_subject_too_small=False,
            is_subject_cutoff=False, subject_center_offset=0.5, composition_balance_score=0.69,
            duplicate_group_id=None, duplicate_similarity_score=0.0, final_score=0.75,
            final_score_breakdown={},
        ),
        3: FrameFeatures(
            frame_id=3, timestamp_sec=8.0, blur_score=78.0, laplacian_variance=92.0,
            edge_density=0.1, brightness_score=70.0, contrast_score=50.0,
            overexposure_score=10.0, underexposure_score=10.0, ocr_text_count=0,
            ocr_text_area_ratio=0.0, bottom_subtitle_ratio=0.0, corner_text_ratio=0.0,
            center_text_ratio=0.0, face_count=0, largest_face_ratio=0.08, face_edge_cutoff_ratio=0.0,
            primary_face_center_offset=0.5, is_closeup=True, is_subject_too_small=False,
            is_subject_cutoff=False, subject_center_offset=0.5, composition_balance_score=0.65,
            duplicate_group_id=None, duplicate_similarity_score=0.0, final_score=0.7,
            final_score_breakdown={},
        ),
    }

    metadata = {'duration': 10.0}
    result = analyzer.compose(ranking_results, frame_features, metadata=metadata)

    assert result.is_degraded is False
    assert result.bottom_image.frame_id == 0
    assert result.zoom_images[0].frame_id == 1  # Best quality, face close-up
    # Frame 3 (body/scene) should be zoom_2, NOT frame 2 (similar face)
    zoom_ids = {z.frame_id for z in result.zoom_images}
    assert 3 in zoom_ids, "Frame 3 (body content type) should win over frame 2 due to content diversity"
    assert 2 not in zoom_ids, "Frame 2 (similar face close-up) should lose to frame 3 (different content type)"
