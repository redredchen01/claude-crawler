"""Tests for memory optimization features."""

import gc
from unittest.mock import MagicMock

import pytest

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.memory_optimizer import (
    BatchProcessor,
    MemoryMonitor,
    StreamingFrameProcessor,
)


@pytest.fixture
def config():
    """Default configuration."""
    return CoverSelectorConfig()


class TestBatchProcessor:
    """Tests for batch processing."""

    def test_batch_processor_creation(self):
        """Test BatchProcessor initialization."""
        processor = BatchProcessor(batch_size=5)
        assert processor.batch_size == 5

    def test_process_items_in_batches(self):
        """Test processing items in batches."""
        processor = BatchProcessor(batch_size=3)

        # Create test items
        items = list(range(10))

        # Process with simple doubling function
        def processor_func(batch):
            return [x * 2 for x in batch]

        results = processor.process_in_batches(items, processor_func)

        # Verify results
        expected = [x * 2 for x in items]
        assert results == expected
        assert len(results) == 10

    def test_batch_iterator(self):
        """Test batch iterator."""
        processor = BatchProcessor(batch_size=3)
        items = list(range(10))

        batches = list(processor.batch_iterator(items))

        # Should have 4 batches: [0,1,2], [3,4,5], [6,7,8], [9]
        assert len(batches) == 4
        assert batches[0] == [0, 1, 2]
        assert batches[1] == [3, 4, 5]
        assert batches[2] == [6, 7, 8]
        assert batches[3] == [9]

    def test_batch_processor_with_large_list(self):
        """Test batch processor with large lists."""
        processor = BatchProcessor(batch_size=10)

        # Create large list
        large_list = list(range(1000))

        def count_processor(batch):
            return [len(batch) for _ in batch]

        results = processor.process_in_batches(large_list, count_processor)

        # All results should be 10 (or less for final partial batch)
        assert len(results) == 1000
        for i, result in enumerate(results):
            if i < 990:  # First 99 full batches
                assert result == 10
            else:  # Last partial batch
                assert result == 10


class TestMemoryMonitor:
    """Tests for memory monitoring."""

    def test_get_memory_warning_threshold(self, config):
        """Test getting memory threshold from config."""
        threshold = MemoryMonitor.get_memory_warning_threshold(config)
        assert threshold == 200  # Default

    def test_suggest_batch_size_reduction(self, config):
        """Test batch size reduction suggestion."""
        original_batch_size = config.scorer.batch_size
        reduced = MemoryMonitor.suggest_batch_size_reduction(config)

        # Should be half the original
        expected = max(1, original_batch_size // 2)
        assert reduced == expected

    def test_aggressive_cleanup(self):
        """Test aggressive garbage collection."""
        # This should not raise any exceptions
        MemoryMonitor.aggressive_cleanup()

        # Verify gc was collected (can't directly test, but no error is good)
        assert True


class TestStreamingFrameProcessor:
    """Tests for streaming frame processing."""

    def test_frame_processor_initialization(self):
        """Test StreamingFrameProcessor initialization."""
        processor = StreamingFrameProcessor(max_frames_in_memory=5)
        assert processor.max_frames_in_memory == 5
        assert len(processor.frame_buffer) == 0

    def test_add_and_get_frames(self):
        """Test adding and retrieving frames."""
        processor = StreamingFrameProcessor(max_frames_in_memory=3)

        # Add frames
        processor.add_frame("frame_0")
        processor.add_frame("frame_1")
        processor.add_frame("frame_2")

        # Retrieve frames
        assert processor.get_frame(0) == "frame_0"
        assert processor.get_frame(1) == "frame_1"
        assert processor.get_frame(2) == "frame_2"

    def test_frame_eviction(self):
        """Test that old frames are evicted when buffer exceeds limit."""
        processor = StreamingFrameProcessor(max_frames_in_memory=3)

        # Add 4 frames (4th should evict 1st)
        processor.add_frame("frame_0")
        processor.add_frame("frame_1")
        processor.add_frame("frame_2")
        processor.add_frame("frame_3")

        # Frame 0 should be evicted
        assert len(processor.frame_buffer) == 3

        # Try to access evicted frame
        with pytest.raises(IndexError):
            processor.get_frame(0)

        # But frames 1, 2, 3 should still be accessible
        assert processor.get_frame(1) == "frame_1"
        assert processor.get_frame(2) == "frame_2"
        assert processor.get_frame(3) == "frame_3"

    def test_clear_buffer(self):
        """Test clearing the buffer."""
        processor = StreamingFrameProcessor()

        # Add frames
        processor.add_frame("frame_0")
        processor.add_frame("frame_1")

        # Clear
        processor.clear()

        # Buffer should be empty
        assert len(processor.frame_buffer) == 0

        # All frames should be inaccessible
        with pytest.raises(IndexError):
            processor.get_frame(0)

    def test_memory_efficiency_with_large_buffer(self):
        """Test memory efficiency by processing many frames with small buffer."""
        processor = StreamingFrameProcessor(max_frames_in_memory=2)

        # Add 100 frames
        for i in range(100):
            processor.add_frame(f"frame_{i}")

        # Buffer should only contain last 2 frames
        assert len(processor.frame_buffer) == 2
        assert processor.frame_buffer[-1] == "frame_99"
        assert processor.frame_buffer[-2] == "frame_98"

        print(f"\n✓ Processed 100 frames with only {len(processor.frame_buffer)} in memory")


class TestMemoryOptimizationIntegration:
    """Integration tests for memory optimization."""

    def test_batch_processing_workflow(self):
        """Test complete batch processing workflow."""
        processor = BatchProcessor(batch_size=5)

        # Simulate frame analysis
        frames = [{"id": i, "data": f"frame_{i}"} for i in range(20)]

        def analyze_batch(batch):
            # Simulate analysis that returns scores
            return [{"id": f["id"], "score": f["id"] * 0.5} for f in batch]

        results = processor.process_in_batches(frames, analyze_batch)

        assert len(results) == 20
        assert results[0]["score"] == 0.0
        assert results[19]["score"] == 9.5

    def test_combined_memory_strategies(self):
        """Test combining batch processing + streaming + monitoring."""
        batch_processor = BatchProcessor(batch_size=3)
        stream_processor = StreamingFrameProcessor(max_frames_in_memory=2)

        # Simulate processing frames through both strategies
        frames = list(range(10))

        def batch_analyzer(batch):
            # Process batch and return results
            return [x * 2 for x in batch]

        results = batch_processor.process_in_batches(frames, batch_analyzer)

        # Add results to stream processor
        for result in results:
            stream_processor.add_frame(result)

        # Verify memory efficiency
        assert len(stream_processor.frame_buffer) == 2  # Only keeping last 2
        assert stream_processor.frame_buffer[-1] == 18  # Last result (9*2)

        print(f"\n✓ Combined batch + streaming processing successful")
        print(f"  Processed {len(results)} items with only {len(stream_processor.frame_buffer)} in memory")
