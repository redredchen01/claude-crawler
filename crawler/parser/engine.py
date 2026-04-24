from __future__ import annotations
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from crawler.models import ParseResult, Resource
from crawler.parser.base import BaseExtractor

logger = logging.getLogger(__name__)

class ParsingEngine:
    """Orchestrates multiple extractors to produce a unified ParseResult."""
    def __init__(self, extractors: list[BaseExtractor]):
        self.extractors = extractors

    def parse(self, html: str, url: str, source: str = "static") -> ParseResult:
        if not html or not html.strip():
            return ParseResult(source=source)

        soup = BeautifulSoup(html, "lxml")
        
        # R23: Aggregated Extraction via modular extractors
        merged_data = {
            "title": "", "tags": [], "category": "", "cover_url": "",
            "views": 0, "likes": 0, "hearts": 0
        }
        
        for extractor in self.extractors:
            try:
                data = extractor.extract(soup, url, source=source)
                for key, value in data.items():
                    # Update if not set, or extend if it's a list
                    if isinstance(value, list):
                        merged_data[key] = list(set(merged_data[key] + value))
                    elif value and not merged_data[key]:
                        merged_data[key] = value
            except Exception as e:
                logger.error(f"Extractor {extractor.__class__.__name__} failed: {e}")

        # Basic fallback for title if all extractors missed it
        if not merged_data["title"]:
            title_tag = soup.find("title")
            merged_data["title"] = title_tag.text.strip() if title_tag else "Untitled"

        # Unleash Link Discovery (Absolute URLs)
        raw_links = [a.get("href") for a in soup.find_all("a") if a.get("href")]
        resolved_links = []
        for href in raw_links:
            # Skip noise like javascript:, mailto:, etc.
            if href.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue
            absolute_url = urljoin(url, href)
            # Basic normalization (remove fragments)
            absolute_url = absolute_url.split("#")[0]
            resolved_links.append(absolute_url)
            
        # Deduplicate links while preserving order
        resolved_links = list(dict.fromkeys(resolved_links))

        # Unleash Page Type Classification
        page_type = "detail"
        articles = soup.find_all("article")
        img_links = []
        if len(articles) > 3:
            page_type = "list"
            
        # Basic heuristic: if we have lots of links with images, it might be a list
        if page_type == "detail":
            img_links = [a for a in soup.find_all("a") if a.find("img")]
            if len(img_links) > 10:
                page_type = "list"

        resources = []
        if page_type == "detail":
            # Build Single Resource
            res = Resource(
                title=merged_data["title"],
                url=url,
                tags=merged_data["tags"],
                category=merged_data["category"],
                cover_url=merged_data["cover_url"],
                views=merged_data.get("views", 0),
            )
            resources.append(res)
        else:
            # Build Multiple Resources for List Pages (Simple heuristic version)
            for article in articles:
                a_tag = article.find("a")
                if not a_tag or not a_tag.get("href"): continue
                
                res_url = urljoin(url, a_tag.get("href"))
                title = a_tag.get_text(strip=True) or (a_tag.get("title", ""))
                
                # Try to find an image for cover
                img = article.find("img")
                cover = urljoin(url, img.get("src")) if img and img.get("src") else ""
                
                if title:
                    resources.append(Resource(title=title, url=res_url, cover_url=cover))
                    
            if not resources and len(img_links) > 10:
                for a in img_links:
                    res_url = urljoin(url, a.get("href"))
                    img = a.find("img")
                    title = img.get("alt", "") or img.get("title", "")
                    cover = urljoin(url, img.get("src")) if img.get("src") else ""
                    if title:
                        resources.append(Resource(title=title, url=res_url, cover_url=cover))
        
        return ParseResult(
            page_type=page_type,
            resources=resources,
            links=resolved_links,
            source=source
        )
