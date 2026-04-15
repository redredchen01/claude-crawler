"""Memory optimization utilities for pipeline processing."""

import gc
import logging
from typing import List, Iterator, Any

logger = logging.getLogger(__name__)


class BatchProcessor:
    """Process large lists in batches to manage memory usage."""

    def __init__(self, batch_size: int = 10):
        """
        Initialize batch processor.

        Args:
            batch_size: Number of items per batch (default: 10)
        """
        self.batch_size = batch_size

    def process_in_batches(self, items: List[Any], processor_func) -> List[Any]:
        """
        Process items in batches, applying processor_func to each batch.

        Args:
            items: List of items to process
            processor_func: Function that takes a batch and returns results

        Returns:
            Combined results from all batches
        """
        results = []

        for i in range(0, len(items), self.batch_size):
            batch = items[i : i + self.batch_size]
            batch_results = processor_func(batch)
            results.extend(batch_results)

            # Suggest garbage collection after each batch
            gc.collect()
            logger.debug(
                f"Processed batch {i // self.batch_size + 1}, "
                f"{len(results)} total results"
            )

        return results

    def batch_iterator(self, items: List[Any]) -> Iterator[List[Any]]:
        """
        Iterator that yields batches of items.

        Args:
            items: List of items to batch

        Yields:
            Batches of specified size
        """
        for i in range(0, len(items), self.batch_size):
            yield items[i : i + self.batch_size]


class MemoryMonitor:
    """Monitor and report memory usage."""

    @staticmethod
    def get_memory_warning_threshold(config) -> int:
        """
        Get memory warning threshold from config.

        Args:
            config: CoverSelectorConfig

        Returns:
            Memory threshold in MB (default: 200)
        """
        return config.system.memory_warning_threshold_mb

    @staticmethod
    def suggest_batch_size_reduction(config) -> int:
        """
        Suggest reduced batch size if memory is a concern.

        Args:
            config: CoverSelectorConfig with batch_size

        Returns:
            Reduced batch size (50% of original)
        """
        original = config.scorer.batch_size
        reduced = max(1, original // 2)
        logger.warning(
            f"Memory threshold approaching. "
            f"Reducing batch size: {original} → {reduced}"
        )
        return reduced

    @staticmethod
    def aggressive_cleanup():
        """Trigger aggressive garbage collection."""
        gc.collect()
        logger.debug("Aggressive garbage collection triggered")


class StreamingFrameProcessor:
    """Process video frames in a streaming fashion without loading all at once."""

    def __init__(self, max_frames_in_memory: int = 5):
        """
        Initialize streaming processor.

        Args:
            max_frames_in_memory: Maximum frames to keep in memory (default: 5)
        """
        self.max_frames_in_memory = max_frames_in_memory
        self.frame_buffer = []
        self.first_frame_index = 0  # Track which frame index the buffer starts at

    def add_frame(self, frame_data: Any) -> None:
        """
        Add frame to buffer, evicting old frames if necessary.

        Args:
            frame_data: Frame data to add
        """
        self.frame_buffer.append(frame_data)

        # Evict oldest frame if buffer exceeds limit
        if len(self.frame_buffer) > self.max_frames_in_memory:
            evicted = self.frame_buffer.pop(0)
            self.first_frame_index += 1
            del evicted
            gc.collect()
            logger.debug(
                f"Evicted frame, buffer size: {len(self.frame_buffer)}, "
                f"first index: {self.first_frame_index}"
            )

    def get_frame(self, index: int) -> Any:
        """
        Get frame from buffer (only if still in memory).

        Args:
            index: Original frame index

        Returns:
            Frame data or None if evicted

        Raises:
            IndexError: If frame was evicted from buffer
        """
        # Calculate position in buffer based on first_frame_index
        buffer_position = index - self.first_frame_index

        if 0 <= buffer_position < len(self.frame_buffer):
            return self.frame_buffer[buffer_position]
        raise IndexError(f"Frame {index} evicted from memory buffer")

    def clear(self) -> None:
        """Clear all frames from buffer."""
        self.frame_buffer.clear()
        gc.collect()
        logger.debug("Frame buffer cleared")
