from __future__ import annotations
import re
from bs4 import BeautifulSoup
from bs4.element import Tag as BsTag
from crawler.parser.base import BaseExtractor

class TagExtractor(BaseExtractor):
    """Modular extractor for tags and categories using multi-signal scoring."""
    
    def __init__(self, threshold: int = 2):
        self.threshold = threshold
        self.tag_path_re = re.compile(r"/(tag|tags|label|keyword|topic)/", re.I)
        self.tag_class_re = re.compile(r"\b(tag|tags|label|keyword|topic)\b", re.I)
        self.cat_path_re = re.compile(r"/(category|theme|channel|section)/", re.I)
        self.cat_class_re = re.compile(r"\b(cat|category|channel|section|theme)\b", re.I)

    def extract(self, soup: BeautifulSoup, url: str, **kwargs) -> dict:
        tags = []
        category = ""
        
        # Analyze all links in the document
        for a in soup.find_all("a"):
            score, is_cat = self._score_a(a)
            text = a.get_text(" ", strip=True)
            
            if is_cat:
                if not category: category = text
                continue
                
            if score >= self.threshold:
                if text and text != "+" and text not in tags:
                    tags.append(text)
                    
        return {"tags": tags, "category": category}

    def _score_a(self, a: BsTag) -> tuple[int, bool]:
        href = a.get("href", "") or ""
        classes = " ".join(a.get("class", [])) if a.get("class") else ""
        
        # Category signal
        if self.cat_path_re.search(href) or self.cat_class_re.search(classes):
            return 0, True
            
        score = 0
        if self.tag_path_re.search(href): score += 3
        if "tag" in " ".join(a.get("rel", [])).lower(): score += 3
        if self.tag_class_re.search(classes): score += 2
        
        return score, False
