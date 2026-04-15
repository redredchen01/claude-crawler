"""Tests for frame sampling."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.frame_sampler import FrameSampler
from cover_selector.schemas.scene import Scene


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture
def sampler(config):
    """Frame sampler instance."""
    return FrameSampler(config)


def test_frame_sampler_init(config):
    """Test FrameSampler initialization."""
    sampler = FrameSampler(config)
    assert sampler.config == config
    assert sampler.extraction_time_sec == 0.0


def test_sample_frames_single_scene(sampler):
    """Test sampling frames from single scene."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        output_dir = Path(tmpdir) / "frames"

        scene = Scene(id=0, start_sec=0.0, end_sec=10.0)

        with patch.object(sampler, "_extract_frame_ffmpeg") as mock_extract:
            # Mock successful frame extraction
            def create_frame(*args, **kwargs):
                args[2].parent.mkdir(parents=True, exist_ok=True)
                args[2].touch()

            mock_extract.side_effect = create_frame

            frames = sampler.sample_frames(video_path, [scene], output_dir)

            # Should extract 30 frames (uniform distribution)
            assert len(frames) == 30
            assert frames[0].scene_id == 0
            assert frames[0].frame_id == 0
            assert frames[29].frame_id == 29


def test_sample_frames_multiple_scenes(sampler):
    """Test sampling frames from multiple scenes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        output_dir = Path(tmpdir) / "frames"

        scenes = [
            Scene(id=0, start_sec=0.0, end_sec=5.0),
            Scene(id=1, start_sec=5.0, end_sec=10.0),
        ]

        with patch.object(sampler, "_extract_frame_ffmpeg") as mock_extract:
            def create_frame(*args, **kwargs):
                args[2].parent.mkdir(parents=True, exist_ok=True)
                args[2].touch()

            mock_extract.side_effect = create_frame

            frames = sampler.sample_frames(video_path, scenes, output_dir)

            # Should extract 60 frames (30 per scene)
            assert len(frames) == 60
            assert frames[0].scene_id == 0
            assert frames[30].scene_id == 1


def test_sample_frames_skips_invalid_scenes(sampler):
    """Test that invalid scenes (zero duration) are skipped."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        output_dir = Path(tmpdir) / "frames"

        # Scene with zero duration
        scene = Scene(id=0, start_sec=5.0, end_sec=5.0)

        with patch.object(sampler, "_extract_frame_ffmpeg") as mock_extract:
            frames = sampler.sample_frames(video_path, [scene], output_dir)

            # Should not extract any frames
            assert len(frames) == 0
            mock_extract.assert_not_called()


def test_sample_frame_timestamps(sampler):
    """Test that sampled frames have correct timestamps."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        output_dir = Path(tmpdir) / "frames"

        scene = Scene(id=0, start_sec=0.0, end_sec=10.0)

        with patch.object(sampler, "_extract_frame_ffmpeg") as mock_extract:
            def create_frame(*args, **kwargs):
                args[2].parent.mkdir(parents=True, exist_ok=True)
                args[2].touch()

            mock_extract.side_effect = create_frame

            frames = sampler.sample_frames(video_path, [scene], output_dir)

            # Check timestamps: 30 uniform samples across 10 second scene
            # Offsets are [i / (30 + 1) for i in range(1, 31)] = [1/31, 2/31, ..., 30/31]
            assert frames[0].timestamp_sec == pytest.approx(0.322, abs=0.01)  # 1/31 * 10
            assert frames[15].timestamp_sec == pytest.approx(5.161, abs=0.01)  # 16/31 * 10
            assert frames[29].timestamp_sec == pytest.approx(9.677, abs=0.01)  # 30/31 * 10


def test_sample_frame_paths(sampler):
    """Test that frame paths are properly formatted."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"
        video_path.touch()

        output_dir = Path(tmpdir) / "frames"

        scene = Scene(id=0, start_sec=0.0, end_sec=5.0)

        with patch.object(sampler, "_extract_frame_ffmpeg") as mock_extract:
            def create_frame(*args, **kwargs):
                args[2].parent.mkdir(parents=True, exist_ok=True)
                args[2].touch()

            mock_extract.side_effect = create_frame

            frames = sampler.sample_frames(video_path, [scene], output_dir)

            # Check path formatting
            for frame in frames:
                assert frame.image_path.exists()
                assert "scene_000" in str(frame.image_path)
                assert ".jpg" in str(frame.image_path)
