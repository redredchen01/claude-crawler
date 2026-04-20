# Parser Modularization (2026-04-20)

## Motivation

Original `crawler/parser.py` grew to 1,915 lines across 45 functions, making it difficult to navigate and test individual concerns. Refactored into 4 focused modules with parallel test files.

## Module Structure

### `crawler/parser_page_type_detection.py`
**Responsibility:** Classify pages as detail/list/tag/other.

- `_detect_page_type(html, url, soup)` — URL patterns, card counts, heading hierarchy
- `_heading_hierarchy_signal(soup)` — Fallback classifier using h1/h2 structure
- `_jsonld_has_detail_entity(blocks)` — Check for detail entity types (VideoObject, Article, etc.)

**Dependencies:** None (self-contained)

### `crawler/parser_extractors.py`
**Responsibility:** Extract tags, metrics, images, dates, titles from DOM and tags.

- `_extract_tags_and_category(scope)` — Multi-signal tag scoring (class, href path, rel=tag)
- `_extract_metric(scope, keywords)` — Scoped metrics (views, likes, etc.)
- `_pick_cover_image(soup)` — Select best image by size, srcset, alt text
- `_extract_published_date(soup, container)` — Parse dates from time tags, meta, text
- `_extract_title_*` — Title normalization and rescue from siblings

**Constants:** `_TAG_SCORE_THRESHOLD`, `_METRIC_MULTIPLIERS`, `_FALLBACK_TAG_CLOUD_CAP`, regex patterns

**Dependencies:** None (self-contained)

### `crawler/parser_structured_data.py`
**Responsibility:** Extract metadata from JSON-LD, OpenGraph, Twitter Cards, microdata and merge by priority.

- `_parse_jsonld_blocks(soup)` → list of JSON-LD blocks
- `_extract_opengraph(soup)` → dict of og:* meta tags
- `_extract_twitter_cards(soup)` → dict of twitter:* meta tags
- `_extract_microdata(soup)` → dict from itemscope/itemprop
- `_extract_jsonld(blocks)` → merged metrics from JSON-LD script blocks
- `_extract_structured(soup)` → tuple of (jsonld, opengraph, raw_data provenance dict)
- `_merge_by_priority(sources)` → merged fields with priority chain (JSON-LD > OG > Twitter > microdata)

**Constants:** `_MISSING_MARKER`, `VALID_PROVENANCE_SOURCES`

**Dependencies:** Calls `_extract_metric()` from parser_extractors for JSON-LD metrics extraction

### `crawler/parser_main.py`
**Responsibility:** Entry points and orchestration.

- `parse_page(html, url)` → ParseResult (dispatches to detail/list handlers)
- `_extract_detail_resource(soup, url)` → Resource (Phase 1: structured, Phase 2: DOM fallback)
- `_extract_list_resources(soup, url)` → list[Resource] (card iteration, title rescue)
- `_pick_main_container(soup)` → BsTag (article/main/section selection)
- `_extract_links(soup, base_url)` → list[str] (href discovery and normalization)

**Dependencies:** Imports from all three submodules

### `crawler/parser.py`
**Responsibility:** Re-export facade for backward compatibility.

- Imports all public and private symbols from submodules
- Exports via `__all__` for clarity
- No logic; pure re-exports

## Call Flow

```
parse_page(url, html)
├─ _detect_page_type(html, url, soup) [parser_page_type_detection]
│
├─ if page_type == "detail":
│  └─ _extract_detail_resource(soup, url) [parser_main]
│     ├─ Phase 1: _extract_structured(soup) [parser_structured_data]
│     │  └─ _extract_metric() [parser_extractors] for JSON-LD metrics
│     └─ Phase 2 (DOM fallback): _extract_tags(), _extract_metric() [parser_extractors]
│
├─ if page_type == "list":
│  └─ _extract_list_resources(soup, url) [parser_main]
│     └─ _extract_tags(), _extract_published_date(), etc. [parser_extractors]
│
└─ return ParseResult(resources, page_type, raw_html)
```

## Testing

Tests organized parallel to modules (each module has matching test file):

| Module | Test File | Tests | Coverage |
|--------|-----------|-------|----------|
| parser_page_type_detection | test_parser_page_type_detection.py | 22 | ✓ |
| parser_extractors | test_parser_extractors.py | 118 | ✓ (3 pre-existing tag casing) |
| parser_structured_data | test_parser_structured_data.py | 72 | ✓ |
| parser_main | test_parser_main.py | 48 | ✓ (3 pre-existing tag casing) |
| parser (re-export) | test_parser.py | 7 | ✓ |

**Total:** 267 tests, 264 passing

## Migration Notes

- All internal call sites updated to import from submodules
- `engine.py` still imports from `crawler.parser` (re-export facade works)
- No behavioral changes; pure code organization
- Tag casing issues (Python vs python) are pre-existing, out of scope for this refactor

## Future Improvements

- Consolidate duplicate test methods in test_parser.py and parallel files
- Extract structured-data merge logic into separate module if complexity grows
- Add memoization for repeated metadata extraction

