"""Tests for parallel processing features."""

import multiprocessing
import time
from unittest.mock import MagicMock

import pytest

from cover_selector.core.parallel_processor import (
    ParallelFrameProcessor,
    ParallelFeatureExtractor,
    OptimalWorkerConfig,
)


class TestParallelFrameProcessor:
    """Tests for parallel frame processing."""

    def test_processor_initialization(self):
        """Test processor initialization."""
        processor = ParallelFrameProcessor(num_workers=4)
        assert processor.num_workers == 4

    def test_processor_default_workers(self):
        """Test processor with default worker count."""
        processor = ParallelFrameProcessor()
        # Should use CPU count
        assert processor.num_workers == multiprocessing.cpu_count()

    def test_process_frames_in_parallel(self):
        """Test processing frames in parallel."""
        processor = ParallelFrameProcessor(num_workers=2)

        frames = [{"id": i, "data": f"frame_{i}"} for i in range(10)]

        def process_frame(frame, idx):
            # Simulate processing
            return {"id": frame["id"], "score": frame["id"] * 0.5, "processed": True}

        results = processor.process_frames_parallel(frames, process_frame)

        # Verify results
        assert len(results) == 10
        assert all(r is not None for r in results)
        assert all(r.get("processed") for r in results)
        assert results[0]["score"] == 0.0
        assert results[9]["score"] == 4.5

    def test_process_frames_maintains_order(self):
        """Test that parallel processing maintains frame order."""
        processor = ParallelFrameProcessor(num_workers=3)

        frames = list(range(20))

        def double_value(frame, idx):
            # Simulate some work
            time.sleep(0.001)
            return frame * 2

        results = processor.process_frames_parallel(frames, double_value)

        # Verify order is maintained
        expected = [f * 2 for f in frames]
        assert results == expected

    def test_process_batch_parallel(self):
        """Test processing batches in parallel."""
        processor = ParallelFrameProcessor(num_workers=2)

        batches = [list(range(i, i + 5)) for i in range(0, 20, 5)]

        def sum_batch(batch):
            return [sum(batch)]

        results = processor.process_batch_parallel(batches, sum_batch)

        # Verify batch sums
        expected_sums = [10, 35, 60, 85]  # Sum of each batch
        assert results == expected_sums

    def test_parallel_faster_than_sequential(self):
        """Test that parallel processing is faster than sequential."""
        processor = ParallelFrameProcessor(num_workers=2)

        frames = list(range(20))

        def slow_process(frame, idx):
            time.sleep(0.01)  # Simulate slow operation
            return frame * 2

        # Parallel processing
        start = time.time()
        results_parallel = processor.process_frames_parallel(frames, slow_process)
        parallel_time = time.time() - start

        # Sequential processing
        start = time.time()
        results_sequential = [slow_process(f, i) for i, f in enumerate(frames)]
        sequential_time = time.time() - start

        # Parallel should be faster
        assert parallel_time < sequential_time
        # Results should be identical
        assert results_parallel == results_sequential

        print(
            f"\n⚡ Parallel: {parallel_time*1000:.0f}ms, "
            f"Sequential: {sequential_time*1000:.0f}ms, "
            f"Speedup: {sequential_time/parallel_time:.1f}x"
        )


class TestParallelFeatureExtractor:
    """Tests for parallel feature extraction."""

    def test_extractor_initialization(self):
        """Test feature extractor initialization."""
        extractor = ParallelFeatureExtractor(num_workers=4)
        assert extractor.processor.num_workers == 4

    def test_extract_features_parallel(self):
        """Test extracting features in parallel."""
        extractor = ParallelFeatureExtractor(num_workers=2)

        frames = [
            {"id": 0, "data": "frame_0"},
            {"id": 1, "data": "frame_1"},
            {"id": 2, "data": "frame_2"},
        ]

        def extract_features(frame, idx):
            return {
                "frame_id": frame["id"],
                "blur_score": frame["id"] * 10.0,
                "brightness": 50.0 + frame["id"],
            }

        features = extractor.extract_features_parallel(frames, extract_features)

        assert len(features) == 3
        assert features[0]["blur_score"] == 0.0
        assert features[2]["brightness"] == 52.0

    def test_extractor_handles_errors(self):
        """Test that extractor handles processing errors gracefully."""
        extractor = ParallelFeatureExtractor(num_workers=2)

        frames = [{"id": 0}, {"id": 1}, {"id": 2}]

        def buggy_extractor(frame, idx):
            if frame["id"] == 1:
                raise ValueError("Simulated error")
            return {"frame_id": frame["id"], "success": True}

        features = extractor.extract_features_parallel(frames, buggy_extractor)

        # Should have 2 valid results (0 and 2)
        assert len(features) == 2
        assert all(f["success"] for f in features)


class TestOptimalWorkerConfig:
    """Tests for optimal worker configuration."""

    def test_optimal_workers_cpu_bound(self):
        """Test optimal workers for CPU-bound tasks."""
        workers = OptimalWorkerConfig.get_optimal_workers_for_task("cpu-bound")
        assert workers == multiprocessing.cpu_count()

    def test_optimal_workers_io_bound(self):
        """Test optimal workers for IO-bound tasks."""
        workers = OptimalWorkerConfig.get_optimal_workers_for_task("io-bound")
        assert workers == multiprocessing.cpu_count() * 2

    def test_optimal_workers_mixed(self):
        """Test optimal workers for mixed tasks."""
        workers = OptimalWorkerConfig.get_optimal_workers_for_task("mixed")
        expected = int(multiprocessing.cpu_count() * 1.5)
        assert workers == expected

    def test_optimal_batch_size(self):
        """Test optimal batch size calculation."""
        batch_size = OptimalWorkerConfig.get_optimal_batch_size(
            total_items=100, workers=4, base_batch_size=5
        )
        # Should be at least base_batch_size
        assert batch_size >= 5
        # Should not exceed total items
        assert batch_size <= 100

    def test_optimal_batch_size_small_items(self):
        """Test batch size when items < workers."""
        batch_size = OptimalWorkerConfig.get_optimal_batch_size(
            total_items=2, workers=4, base_batch_size=5
        )
        # Should use base batch size
        assert batch_size == 5


class TestParallelizationImpact:
    """Integration tests for parallelization impact."""

    def test_parallel_speedup_with_multiple_workers(self):
        """Test speedup with different worker counts."""
        def slow_task(item, idx):
            time.sleep(0.01)
            return item * 2

        items = list(range(10))

        # Single worker
        processor1 = ParallelFrameProcessor(num_workers=1)
        start = time.time()
        results1 = processor1.process_frames_parallel(items, slow_task)
        time1 = time.time() - start

        # Multiple workers
        processor4 = ParallelFrameProcessor(num_workers=4)
        start = time.time()
        results4 = processor4.process_frames_parallel(items, slow_task)
        time4 = time.time() - start

        # Both should produce same results
        assert results1 == results4

        # Multiple workers should be faster
        speedup = time1 / time4
        print(f"\n⚡ Speedup with 4 workers vs 1: {speedup:.1f}x")
        assert speedup > 1.2, "Should see measurable speedup"

    def test_thread_pool_configuration(self):
        """Test that thread pool is properly configured."""
        processor = ParallelFrameProcessor(num_workers=2)

        # Verify processor can handle multiple batches efficiently
        frames = [{"id": i} for i in range(50)]

        def process_frame(frame, idx):
            return frame["id"] * 2

        results = processor.process_frames_parallel(frames, process_frame)

        assert len(results) == 50
        assert results[0] == 0
        assert results[49] == 98
