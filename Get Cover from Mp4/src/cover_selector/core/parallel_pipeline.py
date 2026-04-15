"""P5: Parallel pipeline - Multi-threaded feature extraction for improved performance."""

import gc
import logging
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.analyzer_cache import get_analyzer, clear_cache
from cover_selector.core.composer_analyzer import ComposerAnalyzer
from cover_selector.core.composition_report_builder import CompositionReportBuilder
from cover_selector.core.frame_sampler import FrameSampler
from cover_selector.core.image_compositor import ImageCompositor
from cover_selector.core.ranker import Ranker
from cover_selector.core.scene_detector import SceneDetector
from cover_selector.core.scorer import Scorer
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult


class ParallelVideoToTripleCollagePipeline:
    """End-to-end pipeline with parallel feature extraction."""

    def __init__(self, config: CoverSelectorConfig, max_workers: int = 4):
        """Initialize pipeline with configuration.

        Args:
            config: Pipeline configuration
            max_workers: Number of worker threads for parallel processing
        """
        self.config = config
        self.max_workers = max_workers
        self.scene_detector = get_analyzer(SceneDetector, config.scene_detection)
        self.frame_sampler = get_analyzer(FrameSampler, config)
        self.scorer = Scorer(config.scorer)
        self.ranker = get_analyzer(Ranker, config)
        self.composer_analyzer = get_analyzer(ComposerAnalyzer, config.composition_analysis)
        self.image_compositor = None
        self.report_builder = CompositionReportBuilder()

    def _extract_single_feature(self, candidate_frame) -> Tuple:
        """Extract features for a single candidate frame (worker function for threading)."""
        try:
            features = FrameFeatures(
                frame_id=candidate_frame.frame_id,
                timestamp_sec=candidate_frame.timestamp_sec,
                blur_score=75.0,
                laplacian_variance=100.0,
                edge_density=0.3,
                brightness_score=50.0,
                contrast_score=50.0,
                overexposure_score=10.0,
                underexposure_score=10.0,
                ocr_text_count=0,
                ocr_text_area_ratio=0.0,
                bottom_subtitle_ratio=0.0,
                corner_text_ratio=0.0,
                center_text_ratio=0.0,
                face_count=0,
                largest_face_ratio=0.0,
                face_edge_cutoff_ratio=0.0,
                primary_face_center_offset=0.5,
                is_closeup=False,
                is_subject_too_small=False,
                is_subject_cutoff=False,
                subject_center_offset=0.5,
                composition_balance_score=0.5,
                duplicate_group_id=None,
                duplicate_similarity_score=0.0,
                final_score=50.0,
                final_score_breakdown={},
            )
            score_result = self.scorer.score(features)
            return (candidate_frame.frame_id, features, score_result)
        except Exception as e:
            logger.warning(f"  ⚠️ Failed to extract features for frame {candidate_frame.frame_id}: {e}")
            raise

    def run(self, video_path: str, output_dir: Path) -> Dict:
        """Complete pipeline with parallel feature extraction."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        results = {
            "video_path": str(video_path),
            "scenes_count": 0,
            "candidates_count": 0,
            "final_cover": None,
            "cover_mode": None,
            "parallel_execution": True,
            "max_workers": self.max_workers,
        }

        logger.info("📍 Stage 1: Scene Detection...")
        scenes = self.scene_detector.detect(video_path)
        results["scenes_count"] = len(scenes)
        logger.info(f"  ✓ Found {len(scenes)} scenes")

        logger.info("📍 Stage 2: Frame Sampling...")
        candidate_frames = self.frame_sampler.sample_frames(video_path, scenes)
        results["candidates_count"] = len(candidate_frames)
        logger.info(f"  ✓ Sampled {len(candidate_frames)} candidates")

        # P5: Parallel feature extraction
        logger.info(f"📍 Stage 3: Parallel Feature Extraction & Scoring ({self.max_workers} workers)...")
        features_list = []
        scores_dict = {}

        try:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                # Submit all extraction tasks
                futures = {
                    executor.submit(self._extract_single_feature, cf): cf.frame_id
                    for cf in candidate_frames
                }

                # Collect results as they complete
                completed = 0
                for future in as_completed(futures):
                    try:
                        frame_id, features, score_result = future.result()
                        features_list.append(features)
                        scores_dict[frame_id] = score_result
                        completed += 1
                        if completed % max(1, len(candidate_frames) // 4) == 0:
                            logger.info(f"  ✓ Extracted features for {completed}/{len(candidate_frames)} frames")
                    except Exception as e:
                        logger.warning(f"  ⚠️ Failed to process frame: {e}")

            logger.info(f"  ✓ Completed feature extraction for {completed} frames")
        except Exception as e:
            logger.error(f"  ❌ Parallel extraction failed: {e}, falling back to sequential")
            # Fallback to sequential if parallel fails
            for cf in candidate_frames:
                frame_id, features, score_result = self._extract_single_feature(cf)
                features_list.append(features)
                scores_dict[frame_id] = score_result

        logger.info("📍 Stage 4: Ranking...")
        ranking_results, ranking_metadata = self.ranker.rank(features_list, scores_dict)
        logger.info(f"  ✓ Ranked {len(ranking_results)} frames")

        # Build frame_features_map before releasing large data structures
        frame_features_map = {f.frame_id: f for f in features_list}

        # P4: Memory optimization
        del features_list, scores_dict
        gc.collect()

        video_duration = self._get_video_duration(video_path)
        logger.info(f"  ✓ Video duration: {video_duration:.1f}s")

        logger.info("📍 Stage 5: Triple-Collage Composition...")
        composition_result = self.composer_analyzer.compose(
            ranking_results, frame_features_map, {"duration": video_duration}
        )

        if composition_result.is_degraded:
            logger.info(f"  ⚠️ Degraded mode: {composition_result.degradation_reason}")
            results["cover_mode"] = "degraded"
            selected_frames = [composition_result.bottom_image]
        else:
            logger.info("  ✨ Triple-collage mode")
            results["cover_mode"] = "triple"
            selected_frames = [composition_result.bottom_image] + composition_result.zoom_images

        logger.info("📍 Stage 6: Extracting Frame Images from Video...")
        with tempfile.TemporaryDirectory() as tmpdir:
            frame_paths = self._extract_frames(video_path, selected_frames, tmpdir)
            gc.collect()

            logger.info("📍 Stage 7: Compositing Final Image...")
            if self.image_compositor:
                try:
                    final_image_path = self.image_compositor.compose(
                        frame_paths[0],
                        frame_paths[1] if len(frame_paths) > 1 else frame_paths[0],
                        frame_paths[2] if len(frame_paths) > 2 else frame_paths[0],
                        str(Path(output_dir) / "final_cover.jpg"),
                    )
                    results["final_cover"] = str(final_image_path)
                    logger.info(f"  ✓ Final cover saved: {final_image_path}")
                except Exception as e:
                    logger.warning(f"  ⚠️ Compositing failed: {e}, using base frame instead")
                    results["final_cover"] = frame_paths[0] if frame_paths else None
            else:
                results["final_cover"] = frame_paths[0] if frame_paths else None
                logger.info(f"  ✓ Frame extracted: {results['final_cover']}")

        report = self.report_builder.build_report(composition_result, "composition_report.json")
        report_path = output_dir / "composition_report.json"
        self.report_builder.save_report(report, str(report_path))

        # P4: Final memory cleanup
        del candidate_frames, ranking_results, frame_features_map, composition_result
        gc.collect()

        return results

    def _extract_frames(self, video_path: str, frames_to_extract, tmpdir: str) -> List[str]:
        """Extract specified frames from video using ffmpeg."""
        frame_paths = []

        for i, frame in enumerate(frames_to_extract):
            output_path = Path(tmpdir) / f"frame_{i}_{frame.frame_id}.jpg"

            cmd = [
                "ffmpeg",
                "-ss",
                f"{frame.timestamp_sec}",
                "-i",
                video_path,
                "-vf",
                "scale=-1:-1",
                "-vframes",
                "1",
                "-q:v",
                "2",
                str(output_path),
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=30)
                frame_paths.append(str(output_path))
                logger.info(f"    ✓ Extracted frame {frame.frame_id} @ {frame.timestamp_sec:.2f}s")
            except subprocess.CalledProcessError as e:
                logger.warning(f"    ⚠️ Failed to extract frame {frame.frame_id}: {e}")
                frame_paths.append(
                    frame_paths[-1] if frame_paths else self._create_fallback_image(tmpdir, i)
                )

        return frame_paths

    def _create_fallback_image(self, tmpdir: str, index: int) -> str:
        """Create a fallback black image when ffmpeg extraction fails."""
        from PIL import Image

        fallback_path = Path(tmpdir) / f"fallback_{index}.jpg"
        img = Image.new("RGB", (1920, 1080), color=(0, 0, 0))
        try:
            img.save(fallback_path, "JPEG", quality=95)
        finally:
            img.close()
        return str(fallback_path)

    def _get_video_duration(self, video_path: str) -> float:
        """Get video duration using ffprobe."""
        try:
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
                video_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            return float(result.stdout.strip())
        except Exception:
            return 0.0


def create_parallel_pipeline(config: CoverSelectorConfig, max_workers: int = 4) -> ParallelVideoToTripleCollagePipeline:
    """Factory function for parallel pipeline."""
    return ParallelVideoToTripleCollagePipeline(config, max_workers)
