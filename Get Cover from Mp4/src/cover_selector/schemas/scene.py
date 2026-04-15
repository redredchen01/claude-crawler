"""Scene detection schema."""

from pydantic import BaseModel, Field


class Scene(BaseModel):
    """Represents a detected scene in video."""

    id: int = Field(..., description="Scene sequence number (0-indexed)")
    start_sec: float = Field(..., ge=0, description="Scene start time in seconds")
    end_sec: float = Field(..., ge=0, description="Scene end time in seconds")

    @property
    def duration_sec(self) -> float:
        """Scene duration in seconds."""
        return self.end_sec - self.start_sec
