"""Configuration management for cover selector MVP."""

from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SceneDetectionConfig(BaseModel):
    """Scene detection parameters."""
    threshold: float = Field(27.0, gt=0, le=100, description="Content change threshold (0-100)")
    min_scene_len: int = Field(15, ge=1, description="Minimum scene length in frames")
    delta_lum: float = Field(1.0, ge=0, description="Luminance delta for content detection")
    delta_edges: float = Field(0.2, ge=0, description="Edge delta for content detection")


class ImagePreprocessConfig(BaseModel):
    """Image preprocessing parameters."""
    analysis_max_size: int = Field(960, ge=480, description="Max long edge for analysis thumbnails (pixels)")


class BlurAnalysisConfig(BaseModel):
    """Blur analysis parameters."""
    blur_threshold: float = Field(30.0, ge=0, le=100, description="Minimum acceptable blur score")


class BrightnessAnalysisConfig(BaseModel):
    """Brightness analysis parameters."""
    brightness_threshold_low: float = Field(40.0, ge=0, le=100, description="Minimum acceptable brightness")
    brightness_threshold_high: float = Field(80.0, ge=0, le=100, description="Maximum acceptable brightness")


class OCRDetectionConfig(BaseModel):
    """OCR text detection parameters."""
    ocr_enabled: bool = Field(True, description="Enable OCR text detection")
    bottom_subtitle_ratio_threshold: float = Field(0.3, ge=0, le=1, description="Bottom subtitle area threshold")
    center_text_ratio_threshold: float = Field(0.2, ge=0, le=1, description="Center text area threshold")


class FaceAnalysisConfig(BaseModel):
    """Face detection parameters."""
    face_confidence: float = Field(0.5, ge=0, le=1, description="MediaPipe face confidence threshold")


class LayoutConfig(BaseModel):
    """Image composition layout parameters."""
    zoom_size: int = Field(360, ge=100, le=800, description="Diameter of circular zoom overlays in pixels")
    padding: int = Field(20, ge=0, le=100, description="Padding from image edges for overlay placement")


class OutputConfig(BaseModel):
    """Image output and EXIF parameters."""
    jpg_quality: int = Field(95, ge=1, le=100, description="JPEG compression quality (1-100)")
    jpg_optimize: bool = Field(True, description="Enable PIL JPEG optimization")
    jpg_progressive: bool = Field(True, description="Use progressive JPEG format")
    preserve_exif: bool = Field(False, description="Preserve EXIF metadata from source")
    fallback_on_exif_fail: bool = Field(True, description="Fallback to saving without EXIF if preservation fails")


class CompositionAnalysisConfig(BaseModel):
    """Composition analysis and rendering parameters."""
    closeup_threshold: float = Field(0.4, ge=0, le=1, description="Face ratio threshold for closeup detection")
    subject_too_small_threshold: float = Field(0.05, ge=0, le=1, description="Face ratio threshold for 'too small' detection")
    cutoff_threshold: float = Field(0.1, ge=0, le=1, description="Face edge cutoff threshold for 'face cut off' detection")
    layout: LayoutConfig = Field(default_factory=LayoutConfig, description="Layout configuration for triple-collage composition")
    output: OutputConfig = Field(default_factory=OutputConfig, description="Output configuration for final image")


class DeduplicationConfig(BaseModel):
    """Deduplication parameters."""
    dedup_threshold: int = Field(8, ge=0, le=64, description="dHash Hamming distance threshold for similarity")
    dedup_enabled: bool = Field(True, description="Enable deduplication")


class ScorerConfig(BaseModel):
    """Scoring parameters."""
    weights: List[float] = Field(
        [0.25, 0.25, 0.20, 0.20, 0.10],
        description="Weights for [clarity, cleanliness, subject_presence, composition, cover_suitability]"
    )
    top_k: int = Field(10, ge=1, le=50, description="Number of top candidates to return")
    batch_size: int = Field(10, ge=1, le=100, description="Batch size for frame processing")

    @field_validator('weights')
    @classmethod
    def validate_weights(cls, v):
        """Validate weights list has exactly 5 elements."""
        if len(v) != 5:
            raise ValueError("weights must have exactly 5 elements (one per scoring category)")
        if not all(0 <= w <= 1 for w in v):
            raise ValueError("weights must be in range [0, 1]")
        return v


class SystemConfig(BaseModel):
    """System parameters."""
    memory_warning_threshold_mb: int = Field(200, ge=50, description="Memory threshold for batch size reduction (MB)")


class CoverSelectorConfig(BaseModel):
    """Complete configuration for cover selector MVP."""

    model_config = ConfigDict(frozen=False, arbitrary_types_allowed=True)

    # Subsystems
    scene_detection: SceneDetectionConfig = Field(default_factory=SceneDetectionConfig)
    image_preprocessing: ImagePreprocessConfig = Field(default_factory=ImagePreprocessConfig)
    blur_analysis: BlurAnalysisConfig = Field(default_factory=BlurAnalysisConfig)
    brightness_analysis: BrightnessAnalysisConfig = Field(default_factory=BrightnessAnalysisConfig)
    ocr_detection: OCRDetectionConfig = Field(default_factory=OCRDetectionConfig)
    face_analysis: FaceAnalysisConfig = Field(default_factory=FaceAnalysisConfig)
    composition_analysis: CompositionAnalysisConfig = Field(default_factory=CompositionAnalysisConfig)
    deduplication: DeduplicationConfig = Field(default_factory=DeduplicationConfig)
    scorer: ScorerConfig = Field(default_factory=ScorerConfig)
    system: SystemConfig = Field(default_factory=SystemConfig)

    @staticmethod
    def load_yaml(path: Path) -> "CoverSelectorConfig":
        """Load configuration from YAML file."""
        with open(path) as f:
            data = yaml.safe_load(f)
        return CoverSelectorConfig(**data)

    def save_yaml(self, path: Path) -> None:
        """Save configuration to YAML file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            yaml.dump(self.model_dump(), f, default_flow_style=False)
