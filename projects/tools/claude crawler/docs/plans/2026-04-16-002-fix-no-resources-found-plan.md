---
title: "fix: Integrate parser into crawl engine so resources are persisted"
type: fix
status: active
date: 2026-04-16
---

# fix: Integrate parser into crawl engine so resources are persisted

## Overview

The crawl engine (`engine.py`) fetches pages and extracts links but **never calls the parser** to extract resources and **never saves resources** to the database. This causes "No resources found in this scan." for every scan.

## Problem Frame

The parser module (`parser.py`) has full resource extraction logic (detail pages, list pages, tags). The storage module has `save_resource_with_tags()`. But the engine's BFS loop never connects them — it fetches HTML, extracts links with its own local `_extract_links`, records pages, and moves on. Resources are never extracted or persisted.

## Root Cause

`engine.py:run_crawl()` lines 75-121:
- Fetches HTML ✓
- Inserts page record ✓
- Extracts links (via local `_extract_links`, not parser's) ✓
- **Missing: `parser.parse_page(html, url)` call**
- **Missing: `storage.save_resource_with_tags()` for each extracted resource**
- **Missing: page_type update from parser result**
- **Missing: `resources_found` counter increment**

Additionally, `engine.py` has its own `_extract_links` function (line 38) that duplicates `parser._extract_links` but without the dedup and scheme filtering. The parser's version is more robust.

## Scope Boundaries

- Only fix the integration gap — do not refactor parser or storage
- Do not add new features
- Replace engine's `_extract_links` with parser's version

## Key Technical Decisions

- **Use `parser.parse_page()` as the single entry point**: It returns `ParseResult` with page_type, resources, and links — all needed by the engine
- **Remove engine's local `_extract_links`**: Parser's version is more robust (dedup, scheme filtering)
- **Set `scan_job_id` and `page_id` on each Resource before saving**: Parser creates Resources without these DB-specific fields
- **Track `resources_found` incrementally**: Count saved resources and update scan_job at completion

## Implementation Units

- [ ] **Unit 1: Wire parser into engine's BFS loop**

**Goal:** After fetching HTML, call `parse_page()`, save extracted resources, use parser's links, update page_type.

**Dependencies:** None

**Files:**
- Modify: `crawler/core/engine.py`
- Test: `tests/test_engine_integration.py`

**Approach:**
1. Import `parse_page` from `crawler.parser`
2. Import `save_resource_with_tags` from `crawler.storage`
3. Remove local `_extract_links` function
4. After successful fetch, call `result = parse_page(html, url)`
5. Update page record with `page_type=result.page_type`
6. For each resource in `result.resources`: set `scan_job_id`, `page_id`, call `save_resource_with_tags`
7. Use `result.links` instead of local `_extract_links(html, url)` for frontier pushing
8. Track total resources saved, pass to `update_scan_job` at completion

**Patterns to follow:**
- `storage.save_resource_with_tags()` handles tag creation and linking
- `Resource` dataclass needs `scan_job_id` and `page_id` set before saving

**Test scenarios:**
- Happy path: crawl a page with detail content → resources appear in DB with tags
- Happy path: crawl a list page → multiple resources extracted and saved
- Edge case: page with no extractable resources → no resources saved, no errors
- Edge case: duplicate resource URLs across pages → `INSERT OR IGNORE` prevents duplicates
- Integration: after crawl completes, `analysis.compute_scores()` finds resources and scores them

**Verification:**
- Run a scan against any website → "Hot Resources" tab shows extracted resources with titles, URLs, and tags
- `resources_found` counter on scan job reflects actual count
- Tag analysis tab shows extracted tags with frequency counts

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Parser returns empty resources for some page types | Already handled — `page_type == "other"` returns no resources by design |
| `lxml` not installed (parser uses it) | Already in dependencies per original MVP |

## Sources & References

- Engine: `crawler/core/engine.py` — BFS loop missing parser integration
- Parser: `crawler/parser.py:parse_page()` — returns `ParseResult` with resources + links
- Storage: `crawler/storage.py:save_resource_with_tags()` — persists resource + tags
