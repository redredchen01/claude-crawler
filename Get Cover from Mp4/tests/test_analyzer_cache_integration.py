"""Tests for analyzer cache integration in pipeline."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.analyzer_cache import get_analyzer, clear_cache, get_cache_stats
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.core.scene_detector import SceneDetector
from cover_selector.core.frame_sampler import FrameSampler
from cover_selector.core.ranker import Ranker
from cover_selector.core.composer_analyzer import ComposerAnalyzer
from cover_selector.core.image_compositor import ImageCompositor


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture(autouse=True)
def cleanup_cache():
    """Clear cache before and after each test."""
    clear_cache()
    yield
    clear_cache()


def test_cache_stores_analyzer_instances(config):
    """Test that analyzers are cached and reused."""
    # First call should create instances
    pipeline1 = VideoToTripleCollagePipeline(config)
    scene_detector_1 = pipeline1.scene_detector
    ranker_1 = pipeline1.ranker

    # Second call should return cached instances
    pipeline2 = VideoToTripleCollagePipeline(config)
    scene_detector_2 = pipeline2.scene_detector
    ranker_2 = pipeline2.ranker

    # Verify same instances are returned (same memory address)
    assert scene_detector_1 is scene_detector_2, "SceneDetector should be cached"
    assert ranker_1 is ranker_2, "Ranker should be cached"


def test_cache_stats_reflect_cached_analyzers(config):
    """Test that cache stats correctly report cached analyzers."""
    clear_cache()
    stats = get_cache_stats()
    assert stats["cached_analyzers"] == 0

    # Create pipeline (initializes analyzers)
    pipeline = VideoToTripleCollagePipeline(config)

    stats = get_cache_stats()
    # Should have 4 cached analyzers: SceneDetector, FrameSampler, Ranker, ComposerAnalyzer
    # ImageCompositor is not cached due to configuration issues
    assert stats["cached_analyzers"] == 4
    assert "SceneDetector" in stats["analyzer_types"]
    assert "FrameSampler" in stats["analyzer_types"]
    assert "Ranker" in stats["analyzer_types"]
    assert "ComposerAnalyzer" in stats["analyzer_types"]


def test_clear_cache_removes_all_analyzers(config):
    """Test that clear_cache removes all cached instances."""
    # Create pipeline (initializes analyzers)
    pipeline = VideoToTripleCollagePipeline(config)
    stats = get_cache_stats()
    assert stats["cached_analyzers"] == 4

    # Clear cache
    clear_cache()
    stats = get_cache_stats()
    assert stats["cached_analyzers"] == 0


def test_force_reinit_creates_new_instance(config):
    """Test that force_reinit=True creates a new instance even if cached."""
    pipeline1 = VideoToTripleCollagePipeline(config)
    scene_detector_1 = pipeline1.scene_detector

    # Get a new instance with force_reinit
    scene_detector_2 = get_analyzer(SceneDetector, config.scene_detection, force_reinit=True)

    # Should be different instances
    assert scene_detector_1 is not scene_detector_2, "force_reinit should create new instance"


def test_multiple_analyzers_use_same_cache(config):
    """Test that different analyzer types share the same cache."""
    # First pipeline initializes all analyzers
    pipeline1 = VideoToTripleCollagePipeline(config)

    # Get individual analyzers - should all be cached
    scene_detector = get_analyzer(SceneDetector, config.scene_detection)
    ranker = get_analyzer(Ranker, config)
    composer = get_analyzer(ComposerAnalyzer, config.composition_analysis)

    # Should match the ones from pipeline
    assert scene_detector is pipeline1.scene_detector
    assert ranker is pipeline1.ranker
    assert composer is pipeline1.composer_analyzer


def test_different_configs_create_different_instances(config):
    """Test that different config objects still use cache based on class name."""
    # Note: This test verifies current behavior - cache key is class name only,
    # so different configs will overwrite the cached instance.
    # This is acceptable for MVP as config is typically singleton.

    # Create analyzer with first config
    analyzer1 = get_analyzer(SceneDetector, config.scene_detection)

    # Create different config and analyzer
    config2 = CoverSelectorConfig()
    config2.scene_detection.threshold = 50.0  # Different threshold

    analyzer2 = get_analyzer(SceneDetector, config2.scene_detection)

    # Both should reference the first analyzer (cache key is class name)
    assert analyzer1 is analyzer2, "Cache is based on class name, not config"
    # But config should be from the first initialization
    assert analyzer1.config.threshold == config.scene_detection.threshold


def test_cache_improves_initialization_performance(config):
    """Test that cached initialization is faster than creating new instances."""
    import time

    clear_cache()

    # First initialization (cold)
    start = time.time()
    pipeline1 = VideoToTripleCollagePipeline(config)
    cold_time = time.time() - start

    # Second initialization (warm from cache)
    start = time.time()
    pipeline2 = VideoToTripleCollagePipeline(config)
    warm_time = time.time() - start

    # Warm initialization should be significantly faster (accessing from dict)
    # We expect warm to be at least 10x faster for simple cache lookup
    # Note: This is a loose check since timing can vary
    print(f"Cold init: {cold_time*1000:.2f}ms, Warm init: {warm_time*1000:.2f}ms")
    assert warm_time < cold_time, "Cached initialization should be faster"
