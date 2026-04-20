"""HTML page parser — extracts resources, links, and page metadata.

This is a re-export facade. During transition (Unit 1-8), all content is imported
from parser_legacy.py. After Unit 8, the implementation will be split across:
- parser_page_type_detection.py: page type classification
- parser_extractors.py: tag scoring, metrics, images, dates, titles
- parser_structured_data.py: JSON-LD, OpenGraph, Twitter, microdata
- parser_main.py: entry points and orchestration
"""

import sys
from typing import Any

# Re-export everything from parser_legacy for compatibility
from crawler import parser_legacy

# Explicit imports from new submodules (Unit 2+)
from crawler.parser_page_type_detection import (
    _detect_page_type,
    _heading_hierarchy_signal,
    _jsonld_has_detail_entity,
)

def __getattr__(name: str) -> Any:
    """Dynamically import attributes from parser_legacy or submodules."""
    try:
        return getattr(parser_legacy, name)
    except AttributeError:
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

def __dir__():
    """List all attributes available from parser_legacy."""
    return dir(parser_legacy)
