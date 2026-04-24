from __future__ import annotations

import pytest
from bs4 import BeautifulSoup
from crawler.parser import _calculate_simhash, _generate_content_dna, _extract_detail_resource
from crawler.analysis import hamming_distance, cluster_resources
from crawler.models import Resource

def test_simhash_similarity():
    # Two very similar short texts
    text1 = "This is a sample article about web crawling with Python and BeautifulSoup."
    text2 = "This is a simple article about web crawling using Python and BeautifulSoup."
    
    h1 = _calculate_simhash(text1)
    h2 = _calculate_simhash(text2)
    
    dist = hamming_distance(h1, h2)
    assert dist <= 18 # Reasonable for short texts
    
    # Two identical long texts
    long_text1 = "Content " * 500
    long_text2 = "Content " * 500
    assert hamming_distance(_calculate_simhash(long_text1), _calculate_simhash(long_text2)) == 0

    # Very similar long texts
    long_text3 = ("Similar Content " * 499) + "Different"
    long_text4 = ("Similar Content " * 499) + "Another"
    assert hamming_distance(_calculate_simhash(long_text3), _calculate_simhash(long_text4)) <= 5

def test_content_dna():
    html = "<html><body><article><h1>Title</h1><p>Text</p><img src='1.jpg'><a href='1'>L</a></article></body></html>"
    soup = BeautifulSoup(html, "lxml")
    container = soup.find("article")
    
    dna = _generate_content_dna(soup, container)
    assert "T" in dna
    assert "L1" in dna
    assert "I1" in dna

@pytest.mark.skip(reason="Needs DB and complex setup")
def test_clustering_logic():
    # Mock resources for analysis
    pass
