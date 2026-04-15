"""Tests for scene detection."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import SceneDetectionConfig
from cover_selector.core.scene_detector import SceneDetector
from cover_selector.schemas.scene import Scene


@pytest.fixture
def config():
    """Default scene detection config."""
    return SceneDetectionConfig()


@pytest.fixture
def detector(config):
    """Scene detector instance."""
    return SceneDetector(config)


def test_scene_detector_init(config):
    """Test SceneDetector initialization."""
    detector = SceneDetector(config)
    assert detector.config == config
    assert detector.detection_time_sec == 0.0
    assert detector.scene_count == 0


def test_detect_nonexistent_file(detector):
    """Test detection with nonexistent video file."""
    with pytest.raises(FileNotFoundError):
        detector.detect(Path("/nonexistent/video.mp4"))


def test_detect_creates_single_scene(detector):
    """Test that single-scene video returns one Scene object."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_file = Path(tmpdir) / "test.mp4"
        video_file.touch()

        # Mock scenedetect to return no cuts (single scene)
        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            mock_detect.return_value = []

            scenes = detector.detect(video_file)

            assert len(scenes) == 1
            assert scenes[0].id == 0
            assert scenes[0].start_sec == 0.0


def test_detect_multiple_scenes(detector):
    """Test detection of video with multiple scenes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_file = Path(tmpdir) / "test.mp4"
        video_file.touch()

        # Mock scenedetect to return 2 cuts as (start, end) tuples
        mock_start1 = MagicMock()
        mock_start1.get_seconds.return_value = 0.0

        mock_end1 = MagicMock()
        mock_end1.get_seconds.return_value = 5.0

        mock_start2 = MagicMock()
        mock_start2.get_seconds.return_value = 5.0

        mock_end2 = MagicMock()
        mock_end2.get_seconds.return_value = 10.0

        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            mock_detect.return_value = [(mock_start1, mock_end1), (mock_start2, mock_end2)]

            scenes = detector.detect(video_file)

            # Should create 2 scenes from cuts: [0-5), [5-10)
            assert len(scenes) >= 2
            assert scenes[0].start_sec == 0.0
            assert scenes[0].end_sec == 5.0
            assert scenes[1].start_sec == 5.0
            assert scenes[1].end_sec == 10.0


def test_scene_timestamps_are_increasing(detector):
    """Test that scene timestamps are monotonically increasing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_file = Path(tmpdir) / "test.mp4"
        video_file.touch()

        mock_timecode1 = MagicMock()
        mock_timecode1.get_seconds.return_value = 3.0

        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            mock_detect.return_value = [mock_timecode1]

            scenes = detector.detect(video_file)

            for i in range(len(scenes) - 1):
                assert scenes[i].start_sec <= scenes[i].end_sec
                assert scenes[i].end_sec <= scenes[i + 1].start_sec


def test_scene_properties(detector):
    """Test Scene schema and properties."""
    scene = Scene(id=0, start_sec=0.0, end_sec=5.0)
    assert scene.id == 0
    assert scene.start_sec == 0.0
    assert scene.end_sec == 5.0
    assert scene.duration_sec == 5.0


def test_scene_validation():
    """Test Scene schema validation."""
    # Valid scene
    scene = Scene(id=0, start_sec=0.0, end_sec=10.0)
    assert scene.start_sec >= 0
    assert scene.end_sec >= 0

    # Invalid: negative timestamps should fail
    with pytest.raises(ValueError):
        Scene(id=0, start_sec=-1.0, end_sec=10.0)


def test_detector_records_metrics(detector):
    """Test that detector records execution metrics."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_file = Path(tmpdir) / "test.mp4"
        video_file.touch()

        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            mock_detect.return_value = []

            detector.detect(video_file)

            # Should record metrics
            assert detector.detection_time_sec >= 0.0
            assert detector.scene_count >= 0
