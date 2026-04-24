from __future__ import annotations
import re
from bs4 import BeautifulSoup
from bs4.element import Tag as BsTag
from crawler.parser.base import BaseExtractor

class DensityExtractor(BaseExtractor):
    """Adaptive content extractor using text-density analysis (Readability-lite)."""
    
    def __init__(self):
        # Tags that are unlikely to contain main content
        self.garbage_tags = ["nav", "footer", "header", "aside", "script", "style", "form"]

    def extract(self, soup: BeautifulSoup, url: str, **kwargs) -> dict:
        # Clone soup to avoid mutating original
        body = soup.find("body")
        if not body: return {}

        # 1. Score nodes based on text density
        best_node = None
        max_score = 0

        for node in body.find_all(["div", "section", "article"]):
            # Skip noise
            if node.name in self.garbage_tags: continue
            
            # Simple scoring: text length / (link count + 1)
            text_len = len(node.get_text(strip=True))
            link_count = len(node.find_all("a"))
            
            # Weighting: favor longer text with fewer links
            score = text_len / (link_count + 1)
            
            # Bonus for structural depth
            depth = len(list(node.parents))
            score = score * (1 + (depth * 0.05))

            if score > max_score:
                max_score = score
                best_node = node

        if best_node:
            return {
                "title": self._find_title(soup),
                "main_content": best_node.get_text(" ", strip=True),
                "content_html": best_node.outerHTML if hasattr(best_node, "outerHTML") else str(best_node)
            }
        return {}

    def _find_title(self, soup: BeautifulSoup) -> str:
        h1 = soup.find("h1")
        if h1: return h1.get_text(strip=True)
        title = soup.find("title")
        return title.get_text(strip=True) if title else ""
