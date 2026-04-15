"""Tests for blur analyzer."""

import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from cover_selector.config import BlurAnalysisConfig
from cover_selector.core.blur_analyzer import BlurAnalyzer


@pytest.fixture
def config():
    """Default blur analysis config."""
    return BlurAnalysisConfig()


@pytest.fixture
def analyzer(config):
    """Blur analyzer instance."""
    return BlurAnalyzer(config)


def create_sharp_image() -> np.ndarray:
    """Create a sharp image with high contrast edges."""
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    # Add high-contrast pattern
    img[25:75, 25:75] = 255
    return img


def create_blurry_image() -> np.ndarray:
    """Create a blurry image."""
    img = np.ones((100, 100, 3), dtype=np.uint8) * 128
    # Add subtle gradients (blurry)
    for i in range(100):
        img[:, i] = min(255, 100 + i)
    return cv2.GaussianBlur(img, (15, 15), 0)


def test_blur_analyzer_init(config):
    """Test BlurAnalyzer initialization."""
    analyzer = BlurAnalyzer(config)
    assert analyzer.config == config


def test_sharp_image_high_score(analyzer):
    """Test that sharp images get high blur score."""
    image = create_sharp_image()
    result = analyzer.analyze(image)

    assert result["blur_score"] > 50
    assert result["laplacian_variance"] > 100


def test_blurry_image_low_score(analyzer):
    """Test that blurry images get low blur score."""
    image = create_blurry_image()
    result = analyzer.analyze(image)

    assert result["blur_score"] < 50
    assert result["laplacian_variance"] < 500


def test_grayscale_image(analyzer):
    """Test analyzer works with grayscale input."""
    image = create_sharp_image()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    result = analyzer.analyze(gray)

    assert "blur_score" in result
    assert result["blur_score"] >= 0


def test_edge_density_calculation(analyzer):
    """Test that edge density is computed correctly."""
    image = create_sharp_image()
    result = analyzer.analyze(image)

    assert 0 <= result["edge_density"] <= 1
    assert result["edge_density"] > 0
