from __future__ import annotations
import json
import logging
from bs4 import BeautifulSoup
from crawler.parser.base import BaseExtractor

logger = logging.getLogger(__name__)

class StructuredExtractor(BaseExtractor):
    """Extracts high-fidelity metadata from JSON-LD, OpenGraph, and Twitter Cards."""
    
    def extract(self, soup: BeautifulSoup, url: str, **kwargs) -> dict:
        data = {
            "title": "",
            "cover_url": "",
            "category": "",
            "tags": [],
            "views": 0,
            "likes": 0,
            "hearts": 0,
            "published_at": ""
        }
        
        # 1. JSON-LD (Highest Priority)
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                ld = json.loads(script.string)
                # Handle both single dict and lists of dicts
                items = ld if isinstance(ld, list) else [ld]
                for item in items:
                    if not isinstance(item, dict): continue
                    
                    # Title
                    if "headline" in item: data["title"] = item["headline"]
                    elif "name" in item: data["title"] = item["name"]
                    
                    # Cover Image
                    if "image" in item:
                        img = item["image"]
                        data["cover_url"] = img[0] if isinstance(img, list) else (img.get("url") if isinstance(img, dict) else img)
                        
                    # Metrics (VideoObject)
                    if item.get("@type") == "VideoObject":
                        if "interactionStatistic" in item:
                            for stat in item["interactionStatistic"]:
                                if not isinstance(stat, dict): continue
                                t = stat.get("interactionType", "")
                                v = stat.get("userInteractionCount", 0)
                                if "WatchAction" in t: data["views"] = int(v)
                                elif "LikeAction" in t: data["likes"] = int(v)
                        if "uploadDate" in item: data["published_at"] = item["uploadDate"]
                    elif item.get("@type") in ("Article", "NewsArticle", "BlogPosting"):
                        if "datePublished" in item: data["published_at"] = item["datePublished"]
                        
            except Exception as e:
                logger.debug(f"JSON-LD parse error on {url}: {e}")

        # 2. OpenGraph (Medium Priority - only fill missing)
        if not data["title"]:
            og_title = soup.find("meta", property="og:title")
            if og_title: data["title"] = og_title.get("content", "")
            
        if not data["cover_url"]:
            og_image = soup.find("meta", property="og:image")
            if og_image: data["cover_url"] = og_image.get("content", "")
            
        # 3. Twitter Card (Fallback)
        if not data["title"]:
            tw_title = soup.find("meta", attrs={"name": "twitter:title"})
            if tw_title: data["title"] = tw_title.get("content", "")
            
        if not data["cover_url"]:
            tw_image = soup.find("meta", attrs={"name": "twitter:image"})
            if tw_image: data["cover_url"] = tw_image.get("content", "")
            
        return data
