"""Frame sampling from video scenes."""

import subprocess
import time
from pathlib import Path
from typing import List

import cv2

from cover_selector.config import CoverSelectorConfig
from cover_selector.schemas.candidate_frame import CandidateFrame
from cover_selector.schemas.scene import Scene


class FrameSampler:
    """Extracts frames from video at specified timestamps."""

    def __init__(self, config: CoverSelectorConfig):
        """
        Initialize frame sampler.

        Args:
            config: Complete cover selector configuration
        """
        self.config = config
        self.output_dir = Path("candidate_frames")
        self.extraction_time_sec = 0.0

    def sample_frames(
        self, video_path: Path, scenes: List[Scene], output_dir: Path = None
    ) -> List[CandidateFrame]:
        """
        Sample representative frames from each scene.

        Samples 30 frames uniformly distributed across each scene (1/31, 2/31, ..., 30/31).

        Args:
            video_path: Path to video file
            scenes: List of Scene objects from scene detection
            output_dir: Directory to save frames (default: candidate_frames/)

        Returns:
            List of CandidateFrame objects

        Raises:
            ValueError: If video cannot be read or FFmpeg fails
        """
        if output_dir is None:
            output_dir = Path(output_dir) if output_dir else self.output_dir

        output_dir.mkdir(parents=True, exist_ok=True)

        start_time = time.time()
        candidate_frames = []
        frame_id = 0

        for scene in scenes:
            # Skip invalid scenes (both start and end at same time)
            if scene.duration_sec <= 0:
                continue

            # Calculate sampling points: uniform distribution
            # Default: 30 samples per scene for richer selection
            num_samples = 30
            sampling_offsets = [i / (num_samples + 1) for i in range(1, num_samples + 1)]

            for offset in sampling_offsets:
                # Calculate actual timestamp
                sample_sec = scene.start_sec + (scene.duration_sec * offset)

                # Skip if it goes beyond scene end
                if sample_sec > scene.end_sec:
                    continue

                # Extract frame using FFmpeg
                frame_count = len([f for f in candidate_frames if f.scene_id == scene.id])
                frame_path = output_dir / f"scene_{scene.id:03d}_frame_{frame_count:02d}.jpg"

                try:
                    self._extract_frame_ffmpeg(video_path, sample_sec, frame_path)

                    # Verify frame was extracted
                    if frame_path.exists():
                        # Create preview (for now, just a reference)
                        preview_path = frame_path  # Will be created by ImagePreprocess

                        candidate_frame = CandidateFrame(
                            frame_id=frame_id,
                            scene_id=scene.id,
                            timestamp_sec=round(sample_sec, 2),
                            image_path=frame_path,
                            preview_path=preview_path,
                        )
                        candidate_frames.append(candidate_frame)
                        frame_id += 1

                except Exception as e:
                    # Log and continue with next frame
                    continue

        self.extraction_time_sec = time.time() - start_time
        return candidate_frames

    def _extract_frame_ffmpeg(self, video_path: Path, timestamp_sec: float, output_path: Path) -> None:
        """
        Extract single frame using FFmpeg.

        Args:
            video_path: Path to video file
            timestamp_sec: Timestamp to extract (seconds)
            output_path: Path to save extracted frame

        Raises:
            ValueError: If FFmpeg fails or frame cannot be extracted
        """
        try:
            cmd = [
                "ffmpeg",
                "-ss",
                str(timestamp_sec),
                "-i",
                str(video_path),
                "-vframes",
                "1",
                "-q:v",
                "2",  # High quality JPEG
                "-y",  # Overwrite output
                str(output_path),
            ]

            # Run FFmpeg silently
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode != 0:
                raise ValueError(f"FFmpeg failed: {result.stderr}")

        except FileNotFoundError:
            raise ValueError("FFmpeg not found. Install with: brew install ffmpeg")
        except subprocess.TimeoutExpired:
            raise ValueError(f"FFmpeg timeout extracting frame at {timestamp_sec}s")
        except Exception as e:
            raise ValueError(f"Failed to extract frame: {str(e)}")
