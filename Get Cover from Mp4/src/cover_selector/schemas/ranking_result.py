"""Ranking and filtering result schema."""

from typing import List, Optional

from pydantic import BaseModel, Field


class RankingResult(BaseModel):
    """Result of scoring, filtering, and ranking a frame."""

    rank: Optional[int] = Field(None, ge=1, description="Rank if selected (1-indexed)")
    frame_id: int = Field(..., description="Frame identifier")
    final_score: float = Field(0.0, ge=0, le=100, description="Final weighted score")
    confidence_score: float = Field(
        0.0, ge=0, le=100, description="Confidence in this score"
    )
    status: str = Field(
        "rejected",
        description="Status: normal, duplicate, rejected, borderline",
    )
    violation_reasons: List[str] = Field(
        default_factory=list,
        description="Reasons for rejection (if rejected)",
    )
    violation_severity_score: Optional[float] = Field(
        None, ge=0, le=100, description="Severity of violations (for borderline)"
    )
    score_breakdown: dict = Field(
        default_factory=dict,
        description="Breakdown of component scores",
    )
