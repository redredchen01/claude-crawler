from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional, Tuple

class BaseFrontier(ABC):
    """Abstract interface for all task schedulers."""
    
    @abstractmethod
    def push(self, url: str, depth: int) -> None:
        pass

    @abstractmethod
    def pop(self) -> Optional[Tuple[str, int, int]]:
        pass

    @abstractmethod
    def flush_batch(self) -> int:
        pass

    @abstractmethod
    def is_done(self) -> bool:
        pass

    @property
    @abstractmethod
    def visited_count(self) -> int:
        pass
