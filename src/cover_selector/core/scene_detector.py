"""Scene detection using PySceneDetect."""

import time
from pathlib import Path
from typing import List

import cv2
from scenedetect import detect, ContentDetector, AdaptiveDetector

from cover_selector.config import SceneDetectionConfig
from cover_selector.schemas.scene import Scene


class SceneDetector:
    """Detects scenes in video using PySceneDetect ContentDetector."""

    def __init__(self, config: SceneDetectionConfig):
        """
        Initialize scene detector with configuration.

        Args:
            config: Scene detection configuration
        """
        self.config = config
        self.detection_time_sec = 0.0
        self.scene_count = 0

    def detect(self, video_path: Path) -> List[Scene]:
        """
        Detect scenes in video using ContentDetector.

        Args:
            video_path: Path to input video file

        Returns:
            List of detected Scene objects with timestamps

        Raises:
            FileNotFoundError: If video file does not exist
            ValueError: If video format is not supported or file is corrupted
        """
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")

        start_time = time.time()

        try:
            # Get video duration first
            self.video_duration_sec = self._get_video_duration(video_path)

            # Use ContentDetector with configured parameters
            # threshold: Content change threshold (0-100)
            # luma_only: Set to False to use full color information
            # min_scene_len: Minimum scene length in frames (will convert to seconds later)
            scenes = detect(
                str(video_path),
                ContentDetector(
                    threshold=self.config.threshold,
                    luma_only=False,
                ),
            )

            detection_time = time.time() - start_time

            if not scenes:
                # No scene cuts detected, treat entire video as one scene
                return self._create_single_scene()

            # Convert scenedetect timestamps to Scene objects
            scene_list = self._convert_scenes(scenes, video_path)

            # Record metrics
            self.detection_time_sec = detection_time
            self.scene_count = len(scene_list)

            return scene_list

        except Exception as e:
            supported_formats = "MP4, WebM, MKV, MOV, AVI, FLV, M4V"
            raise ValueError(
                f"Video file corrupted or format not supported. "
                f"Supported formats: {supported_formats}\n"
                f"Original error: {str(e)}"
            )

    def _convert_scenes(self, scenes: List, video_path: Path) -> List[Scene]:
        """
        Convert scenedetect scenes to Scene schema objects.

        Args:
            scenes: List of (start, end) FrameTimecode tuples from scenedetect 0.6.7+
            video_path: Path to video (for validation)

        Returns:
            List of Scene objects with boundaries
        """
        if not scenes:
            return self._create_single_scene()

        scene_list = []
        min_duration_sec = self.config.min_scene_len / 30.0  # Assuming 30 fps default

        # PySceneDetect 0.6.7+ returns list of (start_timecode, end_timecode) tuples
        for scene_tuple in scenes:
            if isinstance(scene_tuple, tuple) and len(scene_tuple) == 2:
                start_tc, end_tc = scene_tuple
                start_sec = start_tc.get_seconds()
                end_sec = end_tc.get_seconds()
            else:
                # Fallback for older API that returns single FrameTimecode
                start_sec = scene_tuple.get_seconds()
                end_sec = start_sec
                continue

            duration_sec = end_sec - start_sec

            # Only include if duration meets minimum
            if duration_sec >= min_duration_sec:
                scene_list.append(
                    Scene(
                        id=len(scene_list),
                        start_sec=round(start_sec, 2),
                        end_sec=round(end_sec, 2),
                    )
                )

        # If all scenes were filtered out, return single scene
        if not scene_list:
            return self._create_single_scene()

        return scene_list

    def _get_video_duration(self, video_path: Path) -> float:
        """
        Get video duration in seconds using OpenCV.

        Args:
            video_path: Path to video file

        Returns:
            Duration in seconds
        """
        try:
            cap = cv2.VideoCapture(str(video_path))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            cap.release()

            if fps > 0:
                return frame_count / fps
            return 0.0
        except Exception:
            return 0.0

    def _create_single_scene(self) -> List[Scene]:
        """Create a single-scene list representing entire video."""
        duration = getattr(self, 'video_duration_sec', 0.0)
        return [
            Scene(
                id=0,
                start_sec=0.0,
                end_sec=round(duration, 2) if duration > 0 else 10.0,  # Default to 10s if unknown
            )
        ]
