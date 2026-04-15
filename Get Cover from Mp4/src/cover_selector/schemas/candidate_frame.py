"""Candidate frame schema."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class CandidateFrame(BaseModel):
    """Represents a candidate frame extracted from video."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    frame_id: int = Field(..., description="Unique frame identifier")
    scene_id: int = Field(..., ge=0, description="Scene this frame belongs to")
    timestamp_sec: float = Field(..., ge=0, description="Timestamp in video (seconds)")
    image_path: Path = Field(..., description="Path to original resolution frame")
    preview_path: Path = Field(..., description="Path to preview/analysis thumbnail")
