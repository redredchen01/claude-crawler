"""Tests for configuration management."""

import tempfile
from pathlib import Path

import pytest
import yaml

from cover_selector.config import CoverSelectorConfig, ScorerConfig


def test_config_default_values():
    """Test that default configuration values are sensible."""
    cfg = CoverSelectorConfig()

    # Scene detection
    assert cfg.scene_detection.threshold == 27.0
    assert cfg.scene_detection.min_scene_len == 15

    # Blur analysis
    assert cfg.blur_analysis.blur_threshold == 30.0

    # Scorer
    assert len(cfg.scorer.weights) == 5
    assert cfg.scorer.top_k == 10
    assert cfg.scorer.batch_size == 10


def test_config_yaml_roundtrip():
    """Test that config can be saved and loaded from YAML."""
    cfg = CoverSelectorConfig()

    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "test_config.yaml"
        cfg.save_yaml(config_path)
        assert config_path.exists()

        # Load it back
        cfg_loaded = CoverSelectorConfig.load_yaml(config_path)
        assert cfg_loaded.scene_detection.threshold == cfg.scene_detection.threshold
        assert cfg_loaded.blur_analysis.blur_threshold == cfg.blur_analysis.blur_threshold


def test_config_weights_validation():
    """Test that scorer weights validation works."""
    # Valid: 5 weights, each in [0, 1]
    weights_valid = [0.25, 0.25, 0.20, 0.20, 0.10]
    scorer = ScorerConfig(weights=weights_valid)
    assert scorer.weights == weights_valid

    # Invalid: wrong number of weights
    with pytest.raises(ValueError):
        ScorerConfig(weights=[0.5, 0.5])

    # Invalid: weights out of range
    with pytest.raises(ValueError):
        ScorerConfig(weights=[0.5, 0.5, 0.5, 0.5, 2.0])


def test_config_custom_yaml():
    """Test loading custom YAML with modified values."""
    custom_config = {
        'scene_detection': {
            'threshold': 35.0,
            'min_scene_len': 20,
            'delta_lum': 1.5,
            'delta_edges': 0.3,
        },
        'blur_analysis': {
            'blur_threshold': 25.0,
        },
        'scorer': {
            'top_k': 5,
            'batch_size': 8,
        }
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "custom_config.yaml"
        with open(config_path, 'w') as f:
            yaml.dump(custom_config, f)

        cfg = CoverSelectorConfig.load_yaml(config_path)
        assert cfg.scene_detection.threshold == 35.0
        assert cfg.scene_detection.min_scene_len == 20
        assert cfg.blur_analysis.blur_threshold == 25.0
        assert cfg.scorer.top_k == 5
        assert cfg.scorer.batch_size == 8


def test_config_threshold_ranges():
    """Test that threshold values are validated."""
    # Valid ranges
    cfg = CoverSelectorConfig()
    cfg.blur_analysis.blur_threshold = 0.0
    cfg.blur_analysis.blur_threshold = 100.0

    # Invalid ranges should fail validation
    with pytest.raises(ValueError):
        CoverSelectorConfig(
            blur_analysis={'blur_threshold': -1.0}
        )


def test_memory_threshold_parameter():
    """Test system memory threshold configuration."""
    cfg = CoverSelectorConfig()
    assert cfg.system.memory_warning_threshold_mb == 200

    # Should be adjustable
    cfg.system.memory_warning_threshold_mb = 500
    assert cfg.system.memory_warning_threshold_mb == 500
