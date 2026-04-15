"""Tests for composition analyzer."""

import pytest

from cover_selector.config import CompositionAnalysisConfig
from cover_selector.core.composition_analyzer import CompositionAnalyzer


@pytest.fixture
def config():
    """Default composition analysis config."""
    return CompositionAnalysisConfig()


@pytest.fixture
def analyzer(config):
    """Composition analyzer instance."""
    return CompositionAnalyzer(config)


def test_composition_analyzer_init(config):
    """Test CompositionAnalyzer initialization."""
    analyzer = CompositionAnalyzer(config)
    assert analyzer.config == config


def test_closeup_detection(analyzer):
    """Test closeup face detection."""
    # Face takes 50% of image (above threshold of 0.4)
    face_features = {
        "largest_face_ratio": 0.5,
        "face_edge_cutoff_ratio": 0.0,
        "primary_face_center_offset": 0.0,
        "face_count": 1,
    }
    result = analyzer.analyze(face_features)

    assert result["is_closeup"] is True
    assert result["is_subject_too_small"] is False


def test_subject_too_small(analyzer):
    """Test small subject detection."""
    # Face takes 2% of image (below threshold of 0.05)
    face_features = {
        "largest_face_ratio": 0.02,
        "face_edge_cutoff_ratio": 0.0,
        "primary_face_center_offset": 0.0,
        "face_count": 1,
    }
    result = analyzer.analyze(face_features)

    assert result["is_subject_too_small"] is True
    assert result["is_closeup"] is False


def test_subject_cutoff(analyzer):
    """Test subject cutoff detection."""
    # Face cut off by 0.2 at edge (above threshold of 0.1)
    face_features = {
        "largest_face_ratio": 0.2,
        "face_edge_cutoff_ratio": 0.15,
        "primary_face_center_offset": 0.0,
        "face_count": 1,
    }
    result = analyzer.analyze(face_features)

    assert result["is_subject_cutoff"] is True


def test_centered_subject(analyzer):
    """Test well-centered subject."""
    face_features = {
        "largest_face_ratio": 0.2,
        "face_edge_cutoff_ratio": 0.0,
        "primary_face_center_offset": 0.1,  # Close to center
        "face_count": 1,
    }
    result = analyzer.analyze(face_features)

    assert result["is_closeup"] is False
    assert result["is_subject_too_small"] is False
    assert result["is_subject_cutoff"] is False
    assert result["composition_balance_score"] > 0.5


def test_no_face_composition(analyzer):
    """Test composition with no faces."""
    face_features = {
        "largest_face_ratio": 0.0,
        "face_edge_cutoff_ratio": 0.0,
        "primary_face_center_offset": 1.0,
        "face_count": 0,
    }
    result = analyzer.analyze(face_features)

    assert result["subject_center_offset"] == 1.0
    assert result["composition_balance_score"] <= 0.5
