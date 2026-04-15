"""Tests for brightness analyzer."""

import cv2
import numpy as np
import pytest

from cover_selector.config import BrightnessAnalysisConfig
from cover_selector.core.brightness_analyzer import BrightnessAnalyzer


@pytest.fixture
def config():
    """Default brightness analysis config."""
    return BrightnessAnalysisConfig()


@pytest.fixture
def analyzer(config):
    """Brightness analyzer instance."""
    return BrightnessAnalyzer(config)


def test_brightness_analyzer_init(config):
    """Test BrightnessAnalyzer initialization."""
    analyzer = BrightnessAnalyzer(config)
    assert analyzer.config == config


def test_normal_brightness(analyzer):
    """Test normal brightness image."""
    # Create image with 50% brightness (128 intensity)
    image = np.ones((100, 100, 3), dtype=np.uint8) * 128
    result = analyzer.analyze(image)

    assert 40 <= result["brightness_score"] <= 60
    assert result["contrast_score"] >= 0
    assert result["overexposure_score"] == 0.0
    assert result["underexposure_score"] == 0.0


def test_bright_image(analyzer):
    """Test overexposed image."""
    image = np.ones((100, 100, 3), dtype=np.uint8) * 250
    result = analyzer.analyze(image)

    assert result["brightness_score"] > 90
    assert result["overexposure_score"] > 50


def test_dark_image(analyzer):
    """Test underexposed image."""
    image = np.ones((100, 100, 3), dtype=np.uint8) * 10
    result = analyzer.analyze(image)

    assert result["brightness_score"] < 10
    assert result["underexposure_score"] > 50


def test_high_contrast_image(analyzer):
    """Test high contrast image."""
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[50:, :] = 255  # Half bright, half dark
    result = analyzer.analyze(image)

    assert result["contrast_score"] > 50


def test_result_format(analyzer):
    """Test that result has all required keys."""
    image = np.ones((100, 100, 3), dtype=np.uint8) * 128
    result = analyzer.analyze(image)

    assert "brightness_score" in result
    assert "contrast_score" in result
    assert "overexposure_score" in result
    assert "underexposure_score" in result
    assert all(0 <= v <= 100 for v in result.values())
