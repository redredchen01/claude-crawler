from __future__ import annotations

import re
from collections import Counter

# Standard Content Taxonomy (Customizable)
TAXONOMY = {
    "Anime": ["anime", "動畫", "番劇", "動漫", "劇場版", "OVA"],
    "Manga": ["manga", "漫畫", "同人誌", "單行本", "漫改"],
    "Game": ["game", "遊戲", "手遊", "單機", "攻略", "RPG", "ADV"],
    "Movie": ["movie", "電影", "影片", "視頻", "video", "4k", "1080p"],
    "Article": ["article", "文章", "資訊", "新聞", "科普", "教學"],
}

class ContentClassifier:
    """Heuristic classifier to assign categories based on labels and metadata."""
    
    def __init__(self):
        self.patterns = {
            cat: [re.compile(re.escape(k), re.I) for k in keywords]
            for cat, keywords in TAXONOMY.items()
        }

    def classify(self, title: str, tags: list[str]) -> str:
        """Predict category for a resource. Returns 'Other' if no strong match."""
        scores = Counter()
        
        # Text to analyze: Title has high weight, tags have normal weight
        combined_text = (title + " ") * 2 + " ".join(tags)
        
        for category, regex_list in self.patterns.items():
            for regex in regex_list:
                matches = len(regex.findall(combined_text))
                if matches:
                    scores[category] += matches
        
        if not scores:
            return "Other"
            
        # Get the highest score category
        top_cat, top_score = scores.most_common(1)[0]
        return top_cat

_CLASSIFIER = ContentClassifier()

def predict_category(title: str, tags: list[str]) -> str:
    return _CLASSIFIER.classify(title, tags)
