"""Tests for image preprocessing."""

import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from cover_selector.config import ImagePreprocessConfig
from cover_selector.core.image_preprocess import ImagePreprocess


@pytest.fixture
def config():
    """Default image preprocessing config."""
    return ImagePreprocessConfig()


@pytest.fixture
def preprocessor(config):
    """Image preprocessor instance."""
    return ImagePreprocess(config)


@pytest.fixture
def test_image():
    """Create a test image."""
    import numpy as np

    with tempfile.TemporaryDirectory() as tmpdir:
        image_path = Path(tmpdir) / "test.jpg"
        image = np.zeros((1080, 1920, 3), dtype=np.uint8)
        cv2.imwrite(str(image_path), image)
        yield image_path


def test_image_preprocess_init(config):
    """Test ImagePreprocess initialization."""
    preprocess = ImagePreprocess(config)
    assert preprocess.config == config


def test_create_preview_resizes_correctly(preprocessor, test_image):
    """Test that preview is resized to max_size."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "preview.jpg"

        result = preprocessor.create_preview(test_image, output_path)

        assert result.exists()

        # Load and check dimensions
        preview = cv2.imread(str(output_path))
        height, width = preview.shape[:2]

        # Longest edge should be <= analysis_max_size
        max_edge = max(height, width)
        assert max_edge <= preprocessor.config.analysis_max_size


def test_create_preview_maintains_aspect_ratio(preprocessor):
    """Test that preview maintains original aspect ratio."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create image with specific aspect ratio
        test_image = Path(tmpdir) / "test.jpg"
        original = np.zeros((1080, 1920, 3), dtype=np.uint8)
        cv2.imwrite(str(test_image), original)
        orig_h, orig_w = 1080, 1920
        orig_ratio = orig_w / orig_h

        output_path = Path(tmpdir) / "preview.jpg"
        preprocessor.create_preview(test_image, output_path)

        # Check preview maintains ratio
        preview = cv2.imread(str(output_path))
        prev_h, prev_w = preview.shape[:2]
        prev_ratio = prev_w / prev_h

        assert prev_ratio == pytest.approx(orig_ratio, rel=0.01)


def test_create_preview_nonexistent_file(preprocessor):
    """Test error handling for nonexistent input file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "preview.jpg"

        with pytest.raises(ValueError):
            preprocessor.create_preview(Path("/nonexistent/image.jpg"), output_path)


def test_get_image_dimensions(preprocessor, test_image):
    """Test getting image dimensions."""
    width, height = preprocessor.get_image_dimensions(test_image)

    assert width == 1920
    assert height == 1080


def test_get_image_dimensions_nonexistent_file(preprocessor):
    """Test error handling for nonexistent file."""
    with pytest.raises(ValueError):
        preprocessor.get_image_dimensions(Path("/nonexistent/image.jpg"))
