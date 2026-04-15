"""Tests for the complete pipeline."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.schemas.scene import Scene
from cover_selector.schemas.candidate_frame import CandidateFrame
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture
def pipeline(config):
    """Pipeline instance."""
    return VideoToTripleCollagePipeline(config)


def create_mock_frame_features(frame_id: int, timestamp_sec: float) -> FrameFeatures:
    """Helper to create mock frame features."""
    return FrameFeatures(
        frame_id=frame_id,
        timestamp_sec=timestamp_sec,
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
        final_score=0.8,
        final_score_breakdown={},
    )


def test_pipeline_init(config):
    """Test pipeline initialization."""
    pipeline = VideoToTripleCollagePipeline(config)
    assert pipeline.config == config
    assert pipeline.scene_detector is not None
    assert pipeline.frame_sampler is not None
    assert pipeline.scorer is not None
    assert pipeline.ranker is not None
    assert pipeline.composer_analyzer is not None
    assert pipeline.image_compositor is not None


def test_pipeline_run_with_mocked_stages(pipeline):
    """Test pipeline run with mocked stages."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        # Create a dummy video file
        video_path = tmpdir / "test.mp4"
        video_path.touch()

        output_dir = tmpdir / "output"
        output_dir.mkdir()

        # Mock each stage
        with patch.object(pipeline.scene_detector, 'detect') as mock_detect, \
             patch.object(pipeline.frame_sampler, 'sample_frames') as mock_sample, \
             patch.object(pipeline.scorer, 'score') as mock_score, \
             patch.object(pipeline.ranker, 'rank') as mock_rank, \
             patch.object(pipeline.composer_analyzer, 'compose') as mock_compose, \
             patch.object(pipeline.image_compositor, 'compose') as mock_compositor, \
             patch.object(pipeline.report_builder, 'build_report') as mock_build_report, \
             patch.object(pipeline.report_builder, 'save_report') as mock_save_report, \
             patch.object(pipeline, '_extract_frames') as mock_extract, \
             patch.object(pipeline, '_get_video_duration') as mock_duration:

            # Setup mock returns
            mock_detect.return_value = [
                Scene(id=0, start_sec=0.0, end_sec=10.0),
            ]

            candidate_frames = [
                CandidateFrame(
                    frame_id=i,
                    scene_id=0,
                    timestamp_sec=float(i),
                    image_path=tmpdir / f"frame_{i}.jpg",
                    preview_path=tmpdir / f"frame_{i}_preview.jpg",
                )
                for i in range(3)
            ]
            mock_sample.return_value = candidate_frames

            mock_score.return_value = MagicMock(final_score=0.8)

            ranking_results = [
                RankingResult(frame_id=i, status="accepted", final_score=0.8 - i*0.05, final_score_breakdown={})
                for i in range(3)
            ]
            mock_rank.return_value = (ranking_results, {})

            # Mock composition result
            mock_compose_result = MagicMock()
            mock_compose_result.is_degraded = False
            mock_compose_result.bottom_image = create_mock_frame_features(0, 0.0)
            mock_compose_result.zoom_images = [
                create_mock_frame_features(1, 1.0),
                create_mock_frame_features(2, 2.0),
            ]
            mock_compose.return_value = mock_compose_result

            # Mock image compositor
            output_cover = output_dir / "final_cover.jpg"
            output_cover.touch()
            mock_compositor.return_value = output_cover

            # Create dummy frames for extraction
            frame_files = [tmpdir / f"extracted_{i}.jpg" for i in range(3)]
            for f in frame_files:
                f.touch()
            mock_extract.return_value = [str(f) for f in frame_files]

            # Mock video duration
            mock_duration.return_value = 10.0

            # Mock report builder
            mock_build_report.return_value = {"composition": "report"}
            mock_save_report.return_value = None

            # Run pipeline
            result = pipeline.run(str(video_path), output_dir)

            # Verify results
            assert result["video_path"] == str(video_path)
            assert result["scenes_count"] == 1
            assert result["candidates_count"] == 3
            assert result["cover_mode"] == "triple"
            assert result["composition"]["mode"] == "triple"
            assert result["composition"]["bottom_image"]["frame_id"] == 0
            assert len(result["composition"]["zoom_images"]) == 2


def test_pipeline_run_degraded_mode(pipeline):
    """Test pipeline when composition falls back to degraded mode."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        video_path = tmpdir / "test.mp4"
        video_path.touch()

        output_dir = tmpdir / "output"
        output_dir.mkdir()

        # Mock stages - only 1 valid frame for degraded mode
        with patch.object(pipeline.scene_detector, 'detect') as mock_detect, \
             patch.object(pipeline.frame_sampler, 'sample_frames') as mock_sample, \
             patch.object(pipeline.scorer, 'score') as mock_score, \
             patch.object(pipeline.ranker, 'rank') as mock_rank, \
             patch.object(pipeline.composer_analyzer, 'compose') as mock_compose, \
             patch.object(pipeline.image_compositor, 'compose') as mock_compositor:

            mock_detect.return_value = [Scene(id=0, start_sec=0.0, end_sec=10.0)]

            candidate_frames = [
                CandidateFrame(
                    frame_id=0,
                    scene_id=0,
                    timestamp_sec=0.0,
                    image_path=tmpdir / "frame_0.jpg",
                    preview_path=tmpdir / "frame_0_preview.jpg",
                )
            ]
            mock_sample.return_value = candidate_frames

            mock_score.return_value = MagicMock(final_score=0.8)

            ranking_results = [
                RankingResult(frame_id=0, status="accepted", final_score=0.8, final_score_breakdown={})
            ]
            mock_rank.return_value = (ranking_results, {})

            # Mock degraded composition
            mock_compose_result = MagicMock()
            mock_compose_result.is_degraded = True
            mock_compose_result.degradation_reason = "Insufficient frames for triple-collage (1 < 3)"
            mock_compose_result.bottom_image = create_mock_frame_features(0, 0.0)
            mock_compose_result.zoom_images = []
            mock_compose.return_value = mock_compose_result

            output_cover = output_dir / "final_cover.jpg"
            output_cover.touch()
            mock_compositor.return_value = output_cover

            result = pipeline.run(str(video_path), output_dir)

            # Verify degraded mode
            assert result["cover_mode"] == "degraded"
            assert result["composition"]["mode"] == "degraded"
            assert "Insufficient frames" in result["composition"]["reason"]


def test_pipeline_get_video_duration(pipeline):
    """Test video duration extraction."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(stdout="123.45")

            duration = pipeline._get_video_duration(str(video_path))

            assert duration == 123.45
            mock_run.assert_called_once()


def test_pipeline_get_video_duration_error(pipeline):
    """Test video duration extraction with error."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = Exception("FFprobe failed")

            duration = pipeline._get_video_duration(str(video_path))

            # Should return 0.0 on error
            assert duration == 0.0
