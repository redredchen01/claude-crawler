from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch
from crawler.analysis import get_tag_cooccurrence
from crawler.models import Resource

def test_tag_cooccurrence_logic():
    # Create mock resources with overlapping tags
    r1 = Resource(id=1, tags=["Python", "Crawl", "Data"])
    r2 = Resource(id=2, tags=["Python", "Crawl", "Automation"])
    r3 = Resource(id=3, tags=["Python", "Data"])
    
    with patch("crawler.storage.get_resources", return_value=[r1, r2, r3]):
        # Top 10 co-occurrences
        res = get_tag_cooccurrence("dummy_path", 1, top_n=10)
        
        # (Python, Crawl) appears in r1, r2 -> count 2
        # (Python, Data) appears in r1, r3 -> count 2
        # (Crawl, Data) appears in r1 -> count 1
        
        counts = {tuple(sorted(c["pair"])): c["count"] for c in res}
        
        assert counts[("Crawl", "Python")] == 2
        assert counts[("Data", "Python")] == 2
        assert counts[("Automation", "Python")] == 1
        assert len(res) > 0
