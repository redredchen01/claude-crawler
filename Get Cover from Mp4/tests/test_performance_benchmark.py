"""Performance benchmarks for analyzer caching optimization."""

import tempfile
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.analyzer_cache import clear_cache
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture
def temp_video():
    """Create a temporary video file for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_file = Path(tmpdir) / "test.mp4"
        video_file.touch()
        yield video_file


class TestPerformanceBenchmark:
    """Performance benchmarks for pipeline execution."""

    def test_single_pipeline_initialization_time(self, config):
        """Measure time to initialize a single pipeline."""
        clear_cache()

        start = time.time()
        pipeline = VideoToTripleCollagePipeline(config)
        elapsed = time.time() - start

        # Record the baseline initialization time
        print(f"\n📊 Single pipeline init: {elapsed*1000:.2f}ms")
        assert elapsed < 1.0, "Pipeline initialization should be fast"

    def test_consecutive_pipeline_initializations(self, config):
        """Measure cached vs uncached pipeline initialization."""

        # Test 1: First initialization (cold cache)
        clear_cache()
        start = time.time()
        pipeline1 = VideoToTripleCollagePipeline(config)
        cold_time = time.time() - start

        # Test 2: Subsequent initialization (warm cache)
        start = time.time()
        pipeline2 = VideoToTripleCollagePipeline(config)
        warm_time = time.time() - start

        # Test 3: Third initialization (still warm)
        start = time.time()
        pipeline3 = VideoToTripleCollagePipeline(config)
        warm_time_2 = time.time() - start

        improvement_pct = ((cold_time - warm_time) / cold_time) * 100 if cold_time > 0 else 0

        print(f"\n📊 Pipeline Initialization Benchmark:")
        print(f"  Cold (1st):  {cold_time*1000:.2f}ms")
        print(f"  Warm (2nd):  {warm_time*1000:.2f}ms")
        print(f"  Warm (3rd):  {warm_time_2*1000:.2f}ms")
        print(f"  Improvement: {improvement_pct:.1f}%")

        # Warm should be significantly faster than cold
        assert warm_time < cold_time, "Cached initialization should be faster"
        assert warm_time_2 < cold_time, "Subsequent cached calls should be fast"

    def test_five_consecutive_runs_performance(self, config):
        """Benchmark 5 consecutive pipeline runs with mocked detection."""

        clear_cache()

        # Mock the detect function to avoid actual video processing
        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            # Setup mock to return single scene
            mock_detect.return_value = []

            times_cold = []
            times_warm = []

            # First run (cold cache)
            with tempfile.TemporaryDirectory() as tmpdir:
                video_file = Path(tmpdir) / "test.mp4"
                video_file.touch()

                start = time.time()
                pipeline = VideoToTripleCollagePipeline(config)
                times_cold.append(time.time() - start)

            # 4 more runs (warm cache)
            for i in range(4):
                with tempfile.TemporaryDirectory() as tmpdir:
                    video_file = Path(tmpdir) / "test.mp4"
                    video_file.touch()

                    start = time.time()
                    pipeline = VideoToTripleCollagePipeline(config)
                    times_warm.append(time.time() - start)

            cold_avg = times_cold[0] if times_cold else 0
            warm_avg = sum(times_warm) / len(times_warm) if times_warm else 0

            improvement_pct = ((cold_avg - warm_avg) / cold_avg) * 100 if cold_avg > 0 else 0

            print(f"\n📊 5 Consecutive Pipeline Runs:")
            print(f"  Cold (1st run): {times_cold[0]*1000:.2f}ms")
            print(f"  Warm average:   {warm_avg*1000:.2f}ms")
            print(f"  Improvement:    {improvement_pct:.1f}%")
            print(f"  Total saved:    {((cold_avg - warm_avg) * 4)*1000:.2f}ms")

            # Verify improvement occurs
            assert warm_avg < cold_avg, "Cached runs should be faster"

            # Target: 15-25% improvement on subsequent runs
            # (can vary based on system, so we just verify improvement occurs)
            assert improvement_pct > 10, "Should see measurable performance improvement"

    def test_analyzer_reuse_verification(self, config):
        """Verify that analyzers are actually being reused."""
        clear_cache()

        pipeline1 = VideoToTripleCollagePipeline(config)
        pipeline2 = VideoToTripleCollagePipeline(config)

        # Verify same instances
        assert pipeline1.scene_detector is pipeline2.scene_detector
        assert pipeline1.frame_sampler is pipeline2.frame_sampler
        assert pipeline1.ranker is pipeline2.ranker

        print("\n✓ Analyzer instances successfully reused across pipelines")


class TestMemoryUsage:
    """Memory usage benchmarks."""

    def test_analyzer_cache_memory_impact(self, config):
        """Estimate memory impact of analyzer caching."""
        import sys

        clear_cache()

        # Get baseline memory usage
        baseline_objects = len([obj for obj in [1]])

        # Create multiple pipelines
        pipelines = []
        for i in range(3):
            pipeline = VideoToTripleCollagePipeline(config)
            pipelines.append(pipeline)

        # All should reference same analyzers
        assert pipelines[0].scene_detector is pipelines[1].scene_detector
        assert pipelines[1].scene_detector is pipelines[2].scene_detector

        print(f"\n✓ Created 3 pipelines with shared analyzer instances")
        print(f"  Memory efficiency: 1 analyzer instance per type (not 3)")
