"""Parallel processing utilities for CPU-intensive tasks."""

import logging
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from typing import List, Callable, Any, Optional

logger = logging.getLogger(__name__)


class ParallelFrameProcessor:
    """Process frames in parallel using thread pool."""

    def __init__(self, num_workers: Optional[int] = None):
        """
        Initialize parallel processor.

        Args:
            num_workers: Number of worker threads (default: CPU count)
        """
        if num_workers is None:
            num_workers = multiprocessing.cpu_count()

        self.num_workers = num_workers
        logger.info(f"Initialized parallel processor with {num_workers} workers")

    def process_frames_parallel(
        self, frames: List[Any], processor_func: Callable
    ) -> List[Any]:
        """
        Process frames in parallel using ThreadPoolExecutor.

        Args:
            frames: List of frames to process
            processor_func: Function to apply to each frame

        Returns:
            List of processed results in same order as input
        """
        results = [None] * len(frames)

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            # Submit all tasks
            futures = {
                executor.submit(processor_func, frame, idx): idx
                for idx, frame in enumerate(frames)
            }

            # Collect results as they complete
            completed = 0
            for future in futures:
                try:
                    idx = futures[future]
                    results[idx] = future.result()
                    completed += 1

                    if completed % 5 == 0:
                        logger.debug(f"Processed {completed}/{len(frames)} frames")

                except Exception as e:
                    logger.error(f"Error processing frame {futures[future]}: {e}")
                    results[futures[future]] = None

        return results

    def process_batch_parallel(
        self, batches: List[List[Any]], batch_processor_func: Callable
    ) -> List[Any]:
        """
        Process batches in parallel.

        Args:
            batches: List of batches to process
            batch_processor_func: Function to apply to each batch

        Returns:
            Combined results from all batches
        """
        all_results = []

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            # Submit all batch tasks
            futures = [
                executor.submit(batch_processor_func, batch) for batch in batches
            ]

            # Collect results
            for future in futures:
                try:
                    batch_results = future.result()
                    all_results.extend(batch_results)
                except Exception as e:
                    logger.error(f"Error processing batch: {e}")

        return all_results


class ParallelFeatureExtractor:
    """Extract features from multiple frames in parallel."""

    def __init__(self, num_workers: Optional[int] = None):
        """
        Initialize feature extractor.

        Args:
            num_workers: Number of worker threads
        """
        self.processor = ParallelFrameProcessor(num_workers)

    def extract_features_parallel(
        self, frames: List[Any], feature_func: Callable
    ) -> List[dict]:
        """
        Extract features from multiple frames in parallel.

        Args:
            frames: List of frame data
            feature_func: Function to extract features (takes frame and index)

        Returns:
            List of feature dictionaries
        """
        logger.info(f"Extracting features for {len(frames)} frames in parallel")

        features = self.processor.process_frames_parallel(frames, feature_func)

        # Filter out None results (failed processing)
        valid_features = [f for f in features if f is not None]
        logger.info(
            f"Successfully extracted {len(valid_features)}/{len(frames)} feature sets"
        )

        return valid_features


class OptimalWorkerConfig:
    """Determine optimal worker configuration based on system."""

    @staticmethod
    def get_optimal_workers_for_task(task_type: str) -> int:
        """
        Get optimal worker count for specific task type.

        Args:
            task_type: Type of task ('cpu-bound', 'io-bound', 'mixed')

        Returns:
            Recommended number of workers
        """
        cpu_count = multiprocessing.cpu_count()

        if task_type == "cpu-bound":
            # CPU-bound: use CPU count
            return cpu_count
        elif task_type == "io-bound":
            # IO-bound: can use more threads
            return cpu_count * 2
        elif task_type == "mixed":
            # Mixed: use 1.5x CPU count
            return int(cpu_count * 1.5)
        else:
            return cpu_count

    @staticmethod
    def get_optimal_batch_size(
        total_items: int, workers: int, base_batch_size: int = 5
    ) -> int:
        """
        Calculate optimal batch size for parallel processing.

        Args:
            total_items: Total items to process
            workers: Number of workers
            base_batch_size: Base batch size (default: 5)

        Returns:
            Recommended batch size
        """
        # Ensure each worker gets at least a few batches to distribute work
        optimal = max(base_batch_size, total_items // (workers * 4))
        logger.debug(
            f"Optimal batch size: {optimal} (items={total_items}, workers={workers})"
        )
        return optimal
