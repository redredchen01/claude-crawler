"""HTML page parser — extracts resources, links, and page metadata.

Public API: parse_page(). Private functions re-exported for test compatibility.

Implementation split across parser_*.py submodules:
- parser_page_type_detection: page type classification
- parser_extractors: tag scoring, metrics, images, dates, titles
- parser_structured_data: JSON-LD, OpenGraph, Twitter, microdata
- parser_main: entry points (parse_page, extract_detail_resource, etc.)
"""

# Page type detection
from crawler.parser_page_type_detection import (
    _detect_page_type,
    _heading_hierarchy_signal,
    _jsonld_has_detail_entity,
    _JSONLD_DETAIL_TYPES,
    _LISTING_PATH_RE,
    _LIST_STRONG_THRESHOLD,
    _LIST_LISTING_URL_THRESHOLD,
)

# Extractors (tags, metrics, images, dates, titles)
from crawler.parser_extractors import (
    _extract_tags_and_category,
    _score_tag_candidate,
    _extract_metric,
    _parse_metric_number,
    _pick_cover_image,
    _resolve_img_src,
    _img_qualifies,
    _normalize_date_triple,
    _extract_published_date,
    _strip_title_site_suffix,
    _class_tokens,
    _clean_text,
    _is_link_card,
    _rescue_title_from_siblings,
    _is_placeholder_url,
)

# Structured data (JSON-LD, OG, Twitter, microdata)
from crawler.parser_structured_data import (
    _parse_jsonld_blocks,
    _extract_opengraph,
    _extract_twitter_cards,
    _extract_microdata,
    _extract_jsonld,
    _merge_by_priority,
    _extract_structured,
    _parse_tags_keywords,
    _tags_pass_stuffing_gate,
)

# Entry points
from crawler.parser_main import (
    parse_page,
    _extract_detail_resource,
    _extract_list_resources,
    _pick_main_container,
    _extract_links,
    _normalize_url,
)

# Models
from crawler.models import ParseResult

# Re-export constants for test compatibility
from crawler.parser_extractors import (
    _FALLBACK_TAG_CLOUD_CAP,
    _METRIC_SIBLING_CAP,
    _MIN_COVER_DIMENSION,
    _TAG_SCORE_THRESHOLD,
    _TAG_TEXT_MIN,
    _TAG_TEXT_MAX,
    _METRIC_NUM_RE,
    _METRIC_MULTIPLIERS,
    _METRIC_YEAR_CONTEXT_RE,
    _ICON_URL_RE,
    _ICON_URL_BOUNDARY,
    _TAG_PATH_RE,
    _CATEGORY_PATH_RE,
    _PERCENT_CJK_RE,
    _TAG_CLASS_RE,
    _CATEGORY_CLASS_RE,
    _WEAK_TITLE_MAX_LEN,
    _DURATION_RE,
    _DATE_ISO_RE,
    _DATE_SLASH_RE,
    _DATE_CJK_RE,
    _NON_RESOURCE_HREF_PREFIXES,
    _LAZY_OVERRIDE_ATTRS,
    _TAG_KEYWORD_SPLIT_RE,
    _TAG_ALIASES,
)

__all__ = [
    'parse_page',
    'ParseResult',
    '_detect_page_type',
    '_extract_detail_resource',
    '_extract_list_resources',
    '_extract_metric',
    '_extract_published_date',
    '_img_qualifies',
    '_normalize_date_triple',
    '_parse_metric_number',
    '_pick_cover_image',
    '_pick_main_container',
    '_resolve_img_src',
    '_extract_tags_and_category',
    '_is_link_card',
]
