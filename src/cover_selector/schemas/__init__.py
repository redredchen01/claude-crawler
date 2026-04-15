"""Schema definitions for cover selector."""

from cover_selector.schemas.candidate_frame import CandidateFrame
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult
from cover_selector.schemas.scene import Scene

__all__ = ["CandidateFrame", "FrameFeatures", "RankingResult", "Scene"]
