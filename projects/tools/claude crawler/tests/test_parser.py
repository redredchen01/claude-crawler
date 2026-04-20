"""Re-export facade tests for crawler.parser module.

This file verifies that all public API and private functions are properly
re-exported from the parser module's submodules. Detailed unit tests for each
concern are organized in parallel test files:
- test_parser_page_type_detection.py
- test_parser_extractors.py
- test_parser_structured_data.py
- test_parser_main.py
"""

import pytest

from crawler.parser import (
    parse_page,
    ParseResult,
    _detect_page_type,
    _extract_detail_resource,
    _extract_list_resources,
    _extract_metric,
    _extract_published_date,
    _img_qualifies,
    _normalize_date_triple,
    _parse_metric_number,
    _pick_cover_image,
    _pick_main_container,
    _resolve_img_src,
    _extract_tags_and_category,
    _is_link_card,
    _extract_opengraph,
    _extract_twitter_cards,
    _extract_microdata,
    _extract_jsonld,
    _merge_by_priority,
    _extract_structured,
    _parse_tags_keywords,
    _tags_pass_stuffing_gate,
)


class TestParserReExports:
    """Verify re-export facades work for all public and private symbols."""

    def test_parse_page_re_export(self):
        """parse_page is properly re-exported."""
        assert parse_page is not None
        assert callable(parse_page)

    def test_parse_result_re_export(self):
        """ParseResult is properly re-exported."""
        assert ParseResult is not None

    def test_page_type_detection_re_exports(self):
        """Page type detection functions are re-exported."""
        assert _detect_page_type is not None
        assert callable(_detect_page_type)

    def test_extractor_re_exports(self):
        """Extractor functions are re-exported."""
        assert _extract_metric is not None
        assert _extract_published_date is not None
        assert _pick_cover_image is not None
        assert _extract_tags_and_category is not None

    def test_structured_data_re_exports(self):
        """Structured data extraction functions are re-exported."""
        assert _extract_opengraph is not None
        assert _extract_twitter_cards is not None
        assert _extract_microdata is not None
        assert _extract_jsonld is not None
        assert _merge_by_priority is not None

    def test_entry_point_re_exports(self):
        """Entry point functions are re-exported."""
        assert _extract_detail_resource is not None
        assert _extract_list_resources is not None
        assert _pick_main_container is not None

    def test_integration_parse_page(self):
        """Integration: parse_page() basic call works."""
        html = '<html><body><h1>Test</h1></body></html>'
        result = parse_page(html, 'https://example.com/')
        assert isinstance(result, ParseResult)
        assert result.page_type in ('detail', 'list', 'tag', 'other')
