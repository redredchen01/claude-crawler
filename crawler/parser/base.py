from __future__ import annotations
from abc import ABC, abstractmethod
from bs4 import BeautifulSoup
from crawler.models import Resource

class BaseExtractor(ABC):
    """Base class for all extraction signals."""
    @abstractmethod
    def extract(self, soup: BeautifulSoup, url: str, **kwargs) -> dict:
        pass
