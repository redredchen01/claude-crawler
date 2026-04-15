"""Tests for image compositor."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

from cover_selector.config import CompositionAnalysisConfig, LayoutConfig, OutputConfig
from cover_selector.core.image_compositor import ImageCompositor


@pytest.fixture
def config():
    """Default composition analysis config."""
    return CompositionAnalysisConfig(
        layout=LayoutConfig(zoom_size=360, padding=20),
        output=OutputConfig(
            jpg_quality=95,
            jpg_optimize=True,
            jpg_progressive=True,
            preserve_exif=False,
            fallback_on_exif_fail=True,
        )
    )


@pytest.fixture
def compositor(config):
    """Image compositor instance."""
    return ImageCompositor(config)


@pytest.fixture
def test_images(tmp_path):
    """Create test images for composition."""
    # Create bottom image (1920x1080)
    bottom = Image.new("RGB", (1920, 1080), color=(100, 100, 200))
    bottom_path = tmp_path / "bottom.jpg"
    bottom.save(bottom_path)

    # Create zoom images (500x500)
    zoom1 = Image.new("RGB", (500, 500), color=(200, 100, 100))
    zoom1_path = tmp_path / "zoom1.jpg"
    zoom1.save(zoom1_path)

    zoom2 = Image.new("RGB", (500, 500), color=(100, 200, 100))
    zoom2_path = tmp_path / "zoom2.jpg"
    zoom2.save(zoom2_path)

    return str(bottom_path), str(zoom1_path), str(zoom2_path)


def test_compositor_init(config):
    """Test compositor initialization."""
    compositor = ImageCompositor(config)
    assert compositor.config == config
    assert compositor.layout == config.layout
    assert compositor.output_cfg == config.output


def test_make_circular_frame(compositor):
    """Test circular frame creation."""
    # Create a test image
    img = Image.new("RGB", (500, 500), color=(100, 100, 100))

    # Make circular frame
    circular = compositor._make_circular_frame(img, 360)

    # Check properties
    assert circular.size == (360, 360)
    assert circular.mode == "RGBA"

    # Verify that it has transparency outside the circle
    # Center should be opaque, corners should be transparent
    center_pixel = circular.getpixel((180, 180))
    corner_pixel = circular.getpixel((10, 10))

    assert center_pixel[3] == 255  # Center is opaque
    assert corner_pixel[3] == 0    # Corner is transparent


def test_compose_basic(compositor, test_images, tmp_path):
    """Test basic image composition."""
    bottom_path, zoom1_path, zoom2_path = test_images
    output_path = str(tmp_path / "composed.jpg")

    result = compositor.compose(bottom_path, zoom1_path, zoom2_path, output_path)

    # Check that output file exists
    assert result.exists()
    assert result.name == "composed.jpg"

    # Verify output is a valid image
    output_img = Image.open(result)
    assert output_img.size == (1920, 1080)
    assert output_img.mode == "RGB"


def test_compose_with_different_input_sizes(compositor, tmp_path):
    """Test composition with different input image sizes."""
    # Create images of different sizes
    bottom = Image.new("RGB", (2560, 1440), color=(50, 50, 50))
    bottom_path = tmp_path / "bottom.jpg"
    bottom.save(bottom_path)

    zoom1 = Image.new("RGB", (800, 800), color=(200, 50, 50))
    zoom1_path = tmp_path / "zoom1.jpg"
    zoom1.save(zoom1_path)

    zoom2 = Image.new("RGB", (300, 300), color=(50, 200, 50))
    zoom2_path = tmp_path / "zoom2.jpg"
    zoom2.save(zoom2_path)

    output_path = tmp_path / "composed.jpg"

    result = compositor.compose(str(bottom_path), str(zoom1_path), str(zoom2_path), str(output_path))

    assert result.exists()
    # Output should maintain bottom image size
    output_img = Image.open(result)
    assert output_img.size == (2560, 1440)


def test_compose_creates_output_directory(compositor, test_images, tmp_path):
    """Test that compose creates output directory if it doesn't exist."""
    bottom_path, zoom1_path, zoom2_path = test_images
    nested_dir = tmp_path / "nested" / "output" / "dir"
    output_path = str(nested_dir / "composed.jpg")

    result = compositor.compose(bottom_path, zoom1_path, zoom2_path, output_path)

    assert result.exists()
    assert result.parent == nested_dir


def test_compose_rgba_conversion(compositor, tmp_path):
    """Test that RGBA images are properly converted to RGB."""
    # Create RGBA image (with alpha channel)
    bottom = Image.new("RGBA", (1920, 1080), color=(100, 100, 200, 255))
    bottom_path = tmp_path / "bottom.png"
    bottom.save(bottom_path)

    # Create regular RGB images
    zoom1 = Image.new("RGB", (500, 500), color=(200, 100, 100))
    zoom1_path = tmp_path / "zoom1.jpg"
    zoom1.save(zoom1_path)

    zoom2 = Image.new("RGB", (500, 500), color=(100, 200, 100))
    zoom2_path = tmp_path / "zoom2.jpg"
    zoom2.save(zoom2_path)

    output_path = tmp_path / "composed.jpg"

    result = compositor.compose(str(bottom_path), str(zoom1_path), str(zoom2_path), str(output_path))

    assert result.exists()
    # Output should always be RGB JPEG
    output_img = Image.open(result)
    assert output_img.mode == "RGB"


def test_compose_missing_input_file(compositor, test_images, tmp_path):
    """Test compose with missing input file."""
    bottom_path, zoom1_path, zoom2_path = test_images
    output_path = str(tmp_path / "composed.jpg")

    # Try to compose with non-existent file
    with pytest.raises(FileNotFoundError):
        compositor.compose("/nonexistent/file.jpg", zoom1_path, zoom2_path, output_path)


def test_circular_frame_resizes_correctly(compositor):
    """Test that circular frame resizes images correctly."""
    # Create a small image
    small_img = Image.new("RGB", (100, 100), color=(100, 100, 100))

    # Create circular frame with larger size
    circular = compositor._make_circular_frame(small_img, 360)

    # Should be resized to 360x360
    assert circular.size == (360, 360)


def test_save_with_metadata(compositor, test_images, tmp_path):
    """Test saving with EXIF metadata."""
    # Configure to preserve EXIF
    compositor.output_cfg.preserve_exif = True

    bottom_path, zoom1_path, zoom2_path = test_images
    output_path = str(tmp_path / "composed_with_exif.jpg")

    # Save without EXIF source
    result = compositor.compose(bottom_path, zoom1_path, zoom2_path, output_path, frame_timestamps={})

    assert result.exists()

    # Check that it saved successfully even without EXIF source
    output_img = Image.open(result)
    assert output_img.size == (1920, 1080)
