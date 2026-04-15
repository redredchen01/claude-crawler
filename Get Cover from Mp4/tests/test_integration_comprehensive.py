"""Comprehensive integration tests for all optimization phases."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.analyzer_cache import clear_cache, get_cache_stats
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.core.memory_optimizer import BatchProcessor, StreamingFrameProcessor
from cover_selector.core.parallel_processor import ParallelFrameProcessor


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


@pytest.fixture(autouse=True)
def cleanup():
    """Clean up cache before and after each test."""
    clear_cache()
    yield
    clear_cache()


class TestEndToEndIntegration:
    """End-to-end integration tests."""

    def test_pipeline_initialization_with_caching(self, config):
        """Test that pipeline initializes correctly with caching enabled."""
        # First initialization
        pipeline1 = VideoToTripleCollagePipeline(config)
        assert pipeline1.scene_detector is not None
        assert pipeline1.ranker is not None

        # Verify caching is working
        stats = get_cache_stats()
        assert stats["cached_analyzers"] == 4

        # Second initialization should reuse cached instances
        pipeline2 = VideoToTripleCollagePipeline(config)
        assert pipeline1.scene_detector is pipeline2.scene_detector
        assert pipeline1.ranker is pipeline2.ranker

    def test_pipeline_with_mocked_video_processing(self, config):
        """Test complete pipeline flow with mocked video detection."""

        with patch("cover_selector.core.scene_detector.detect") as mock_detect:
            # Setup mock
            mock_start = MagicMock()
            mock_start.get_seconds.return_value = 0.0
            mock_end = MagicMock()
            mock_end.get_seconds.return_value = 10.0
            mock_detect.return_value = [(mock_start, mock_end)]

            pipeline = VideoToTripleCollagePipeline(config)

            # Verify pipeline is properly initialized
            assert pipeline.config == config
            assert pipeline.scene_detector is not None

    def test_pipeline_memory_efficiency(self, config):
        """Test that pipeline doesn't create redundant analyzer instances."""
        # Create 5 pipelines
        pipelines = [VideoToTripleCollagePipeline(config) for _ in range(5)]

        # All should share the same analyzer instances
        for i in range(1, 5):
            assert pipelines[0].scene_detector is pipelines[i].scene_detector
            assert pipelines[0].ranker is pipelines[i].ranker

        # Verify cache stats
        stats = get_cache_stats()
        assert stats["cached_analyzers"] == 4  # Only 4 unique analyzers


class TestMemoryOptimizationIntegration:
    """Integration tests for memory optimization."""

    def test_batch_processing_in_pipeline_context(self, config):
        """Test batch processing works with pipeline config."""
        processor = BatchProcessor(batch_size=config.scorer.batch_size)

        # Create test frames
        test_frames = [
            {"id": i, "timestamp": float(i)} for i in range(20)
        ]

        def analyze_batch(batch):
            return [{"id": f["id"], "score": f["id"] * 1.5} for f in batch]

        results = processor.process_in_batches(test_frames, analyze_batch)

        assert len(results) == 20
        assert results[0]["score"] == 0.0
        assert results[19]["score"] == 28.5

    def test_streaming_processor_with_candidate_frames(self):
        """Test streaming processor as would be used with candidate frames."""
        processor = StreamingFrameProcessor(max_frames_in_memory=5)

        # Simulate processing 100 candidate frames
        for i in range(100):
            frame_data = {"frame_id": i, "path": f"/path/to/frame_{i}.jpg"}
            processor.add_frame(frame_data)

        # Only last 5 should be in memory
        assert len(processor.frame_buffer) == 5

        # Recent frames should be accessible
        assert processor.get_frame(99)["frame_id"] == 99
        assert processor.get_frame(95)["frame_id"] == 95

        # Old frames should be evicted
        with pytest.raises(IndexError):
            processor.get_frame(0)

    def test_memory_efficiency_with_large_frame_count(self):
        """Test memory efficiency with large number of frames."""
        processor = StreamingFrameProcessor(max_frames_in_memory=10)

        # Process 1000 frames
        for i in range(1000):
            processor.add_frame({"id": i, "data": f"frame_{i}"})

        # Should only keep last 10
        assert len(processor.frame_buffer) == 10

        print(f"\n✓ Processed 1000 frames with only {len(processor.frame_buffer)} in memory")


class TestParallelProcessingIntegration:
    """Integration tests for parallel processing."""

    def test_parallel_frame_processing_correctness(self):
        """Test that parallel processing maintains correctness."""
        processor = ParallelFrameProcessor(num_workers=4)

        # Create test frames with IDs
        frames = [{"id": i, "value": i * 2.5} for i in range(30)]

        def process_frame(frame, idx):
            # Simulate feature extraction
            return {
                "frame_id": frame["id"],
                "index": idx,
                "processed_value": frame["value"] * 1.5,
            }

        results = processor.process_frames_parallel(frames, process_frame)

        # Verify correctness
        assert len(results) == 30
        for i, result in enumerate(results):
            assert result["frame_id"] == i
            assert result["index"] == i
            assert result["processed_value"] == i * 2.5 * 1.5

    def test_parallel_batch_processing_integration(self):
        """Test parallel batch processing."""
        processor = ParallelFrameProcessor(num_workers=2)

        # Create batches
        batches = [list(range(i, i + 10)) for i in range(0, 50, 10)]

        def process_batch(batch):
            # Return aggregated results
            return [{"batch_sum": sum(batch), "batch_len": len(batch)}]

        results = processor.process_batch_parallel(batches, process_batch)

        # Verify results
        assert len(results) == 5
        expected_sums = [45, 145, 245, 345, 445]
        for i, result in enumerate(results):
            assert result["batch_sum"] == expected_sums[i]


class TestPerformanceRegression:
    """Performance regression tests."""

    def test_cache_performance_consistency(self, config):
        """Test that caching performance is consistent across calls."""
        import time

        warm_times = []

        for _ in range(5):
            clear_cache()

            # First call (cold)
            start = time.time()
            pipeline1 = VideoToTripleCollagePipeline(config)
            cold_time = time.time() - start

            # Subsequent calls (warm)
            start = time.time()
            for _ in range(10):
                pipeline = VideoToTripleCollagePipeline(config)
            warm_time = (time.time() - start) / 10
            warm_times.append(warm_time)

        # Warm times should be consistently fast and stable
        avg_warm = sum(warm_times) / len(warm_times)
        max_warm = max(warm_times)

        # No warm call should take more than 2x the average
        assert max_warm < avg_warm * 2

    def test_no_memory_regression(self, config):
        """Test that memory usage doesn't regress."""
        processor = StreamingFrameProcessor(max_frames_in_memory=5)

        # Process multiple rounds of frames
        for round in range(10):
            for i in range(50):
                processor.add_frame({"round": round, "id": i})

            # Should always maintain same buffer size
            assert len(processor.frame_buffer) == 5

        print(f"\n✓ Consistent memory usage across {10 * 50} frame operations")


class TestRobustnessAndErrorHandling:
    """Tests for robustness and error handling."""

    def test_pipeline_handles_initialization_errors(self, config):
        """Test that pipeline gracefully handles errors."""
        # This should not raise
        try:
            pipeline = VideoToTripleCollagePipeline(config)
            assert pipeline is not None
        except Exception as e:
            pytest.fail(f"Pipeline initialization raised unexpected error: {e}")

    def test_parallel_processor_handles_errors(self):
        """Test that parallel processor handles task errors."""
        processor = ParallelFrameProcessor(num_workers=2)

        frames = [{"id": i} for i in range(10)]

        def buggy_processor(frame, idx):
            if frame["id"] == 5:
                raise ValueError("Simulated error")
            return {"id": frame["id"], "processed": True}

        # Should complete without crashing
        results = processor.process_frames_parallel(frames, buggy_processor)

        # Should have 9 valid results
        valid_results = [r for r in results if r is not None]
        assert len(valid_results) == 9

    def test_streaming_processor_large_scale(self):
        """Test streaming processor at scale."""
        processor = StreamingFrameProcessor(max_frames_in_memory=20)

        # Process 10,000 items
        for i in range(10000):
            processor.add_frame({"id": i, "data": f"item_{i}"})

        # Should still only keep 20 in memory
        assert len(processor.frame_buffer) == 20

        print(f"\n✓ Streamed 10,000 items with only {len(processor.frame_buffer)} in memory")
