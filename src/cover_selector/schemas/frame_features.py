"""Frame features schema."""

from typing import List, Optional

from pydantic import BaseModel, Field


class FrameFeatures(BaseModel):
    """All features extracted from a candidate frame."""

    frame_id: int = Field(..., description="Frame identifier")
    timestamp_sec: float = Field(0.0, ge=0, description="Timestamp in video (seconds)")

    # Blur/Clarity features
    blur_score: float = Field(0.0, ge=0, le=100, description="Clarity score (0-100)")
    laplacian_variance: float = Field(
        0.0, ge=0, description="Laplacian variance for sharpness"
    )
    edge_density: float = Field(
        0.0, ge=0, le=1, description="Edge pixel ratio (0-1)"
    )

    # Brightness/Contrast features
    brightness_score: float = Field(0.0, ge=0, le=100, description="Brightness (0-100)")
    contrast_score: float = Field(0.0, ge=0, le=100, description="Contrast (0-100)")
    overexposure_score: float = Field(
        0.0, ge=0, le=100, description="Overexposure percentage"
    )
    underexposure_score: float = Field(
        0.0, ge=0, le=100, description="Underexposure percentage"
    )

    # OCR features
    ocr_text_count: int = Field(0, ge=0, description="Number of text regions detected")
    ocr_text_area_ratio: float = Field(
        0.0, ge=0, le=1, description="Ratio of text area to image"
    )
    bottom_subtitle_ratio: float = Field(
        0.0, ge=0, le=1, description="Bottom subtitle area ratio"
    )
    corner_text_ratio: float = Field(
        0.0, ge=0, le=1, description="Corner text area ratio"
    )
    center_text_ratio: float = Field(
        0.0, ge=0, le=1, description="Center text area ratio"
    )

    # Face detection features
    face_count: int = Field(0, ge=0, description="Number of faces detected")
    largest_face_ratio: float = Field(
        0.0, ge=0, le=1, description="Largest face ratio to image"
    )
    face_edge_cutoff_ratio: float = Field(
        0.0, ge=0, le=1, description="Face cutoff at image edges"
    )
    primary_face_center_offset: float = Field(
        0.0, ge=0, le=1, description="Primary face offset from center"
    )

    # Composition features
    is_closeup: bool = Field(False, description="Face too large (closeup)")
    is_subject_too_small: bool = Field(False, description="Subject too small")
    is_subject_cutoff: bool = Field(False, description="Subject cut off at edges")
    subject_center_offset: float = Field(
        0.0, ge=0, le=1, description="Subject offset from center"
    )
    composition_balance_score: float = Field(
        0.0, ge=0, le=1, description="Composition balance (0-1)"
    )

    # Deduplication features
    duplicate_group_id: Optional[int] = Field(
        None, description="Duplicate group this frame belongs to"
    )
    duplicate_similarity_score: float = Field(
        0.0, ge=0, le=1, description="Similarity to group representative"
    )

    # Final scoring
    final_score: float = Field(0.0, ge=0, le=100, description="Final weighted score")
    final_score_breakdown: dict = Field(
        default_factory=dict,
        description="Score breakdown by component",
    )
