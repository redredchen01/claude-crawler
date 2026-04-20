---
title: refactor: Modularize parser.py and engine.py
type: refactor
status: active
date: 2026-04-20
---

# Modularize parser.py and engine.py

## Overview

The crawler's two largest modules—**parser.py** (1,915 lines, 45 functions) and **engine.py** (656 lines, 10 functions)—have grown beyond ideal size. This refactor breaks them into focused, testable modules without changing behavior or API contracts, reducing maintenance burden and enabling independent evolution.

## Problem Frame

**Current pain points:**

1. **parser.py breadth** — Mixing 12+ distinct concerns (page type detection, image parsing, JSON-LD, OpenGraph, metrics extraction, tag scoring, title normalization, link extraction, detail/list page orchestration). Changes to one concern risk rippling to others.

2. **Test organization** — test_parser.py contains 240 tests across 39 test classes, all in one file. Finding, debugging, or extending tag extraction tests requires scanning a 2,714-line file.

3. **Cognitive load** — New contributors must understand all extraction strategies to modify one. No clear module boundaries guide where new signals belong.

4. **engine.py opacity** — Worker thread logic (`_process_one_page`, `_fetch_html`, `_try_render`, write-to-counter sequencing) is mixed with orchestration loop (thread pool, frontier, shutdown). Hard to test worker behavior in isolation or reason about shutdown order.

5. **Import clarity** — Despite clean DAG (no cycles), the current structure doesn't signal which concerns are truly independent.

## Requirements Trace

- R1. **Break parser.py into focused modules** — separate page type detection, extraction, and structured data handling so changes are localized
- R2. **Improve test organization** — parallel test file structure mirrors module structure, reducing navigation overhead
- R3. **Preserve API contracts** — no changes to `parse_page()` signature, imports, or downstream consumers (export.py, engine.py, app.py)
- R4. **Zero behavioral change** — same parsing results, same raw_data provenance, same metadata extraction
- R5. **Minimal engine.py refactoring** — separate worker and orchestration for clarity; defer deep rewrite to Phase 2

## Scope Boundaries

- **In scope:** File reorganization, test consolidation, documentation of module boundaries
- **Out of scope:** Logic refactoring, optimization, new extraction signals, async improvements, performance tuning
- **Non-goal:** Full engine.py rewrite or architectural redesign; that is Phase 2 work

## Context & Research

### Relevant Code and Patterns

- **parser.py structure** — 45 private functions grouped by concern (tag scoring, metric extraction, JSON-LD parsing, page type detection, etc.). Lines 1035–1162 (page type), 353–1028 (structured data), 126–683 (tags), 481–585 (metrics), 1230–1375 (images).
- **Existing module organization** — `core/` already split across 8 files (engine, writer, render, fetcher, etc.); sets precedent for focused modules
- **Test support** — 695 tests, all synchronous (no async), distributed across 17 test files with 1:1 file-to-module correspondence
- **engine.py structure** — Core orchestration (run_crawl, ~300 lines) + worker functions (_process_one_page, _fetch_html, _try_render, write helpers, ~150 lines) + utilities (~100 lines)
- **Import DAG** — No circular dependencies; parser imports only models and (lazily) raw_data; engine imports 10+ modules but in clean hierarchy

### Institutional Learnings

- **Modularization enables independent testing** — Splitting parser into 4 modules lets each have focused test file with 60–100 tests instead of 240 in one mega-file
- **Lazy imports prevent cycles** — parser.py already uses `from crawler.raw_data import ...` inside function bodies (not top-level) to avoid import-time coupling; this pattern scales to new modules
- **Test file 1:1 correspondence works** — Projects with test file names matching module names reduce mental load; `parser/extractors.py` naturally pairs with `test_parser_extractors.py`

### External References

- **Module naming conventions** — Python community convention uses subpackages with __init__.py re-exports for large modules; this plan keeps it simpler (flat .py files in crawler/) to avoid import path thrashing
- **Test organization best practice** — Use parallel test file structure, not nested test subdirectories, to keep pytest discovery simple and imports flat

## Key Technical Decisions

- **Decision: Keep parser as a flat .py module tree, not a subpackage** — Rationale: Crawler already lives at `crawler/` level (not `crawler/parser/`). Adding `crawler/parser/` subpackage would require `__init__.py` re-exports and change import paths from `from crawler.parser import parse_page` to `from crawler.parser.main import parse_page` (or re-export in __init__). This creates churn and import brittleness. Instead, create `parser_*.py` files at crawler level (e.g., `parser_extractors.py`) with a single `parser.py` as a re-export module. Simpler, zero breakage, easy to navigate.

- **Decision: Preserve module-level imports in re-export module** — The new `parser.py` will be thin, importing all public and private symbols from `parser_*` modules and re-exporting them. This ensures existing code (`from crawler.parser import parse_page`, `from crawler.parser import _extract_tags`) continues unchanged.

- **Decision: Test files use parallel naming** — `parser_extractors.py` → `test_parser_extractors.py`. Not `test/parser_extractors.py`. Keeps tests colocated with pytest discovery and avoids new directory structure.

- **Decision: Engine.py split is lighter** — `engine.py` → keep as-is with minor inline restructuring (no new files yet). Wait for Phase 2 to decompose into `engine_orchestrator.py` + `engine_worker.py`. Reason: engine is still below 700 lines and tightly interlocked; immediate payoff is lower. Parser split is higher priority (1,915 lines, more orthogonal concerns).

- **Decision: raw_data.py and models.py remain untouched** — Neither grows as part of parser split. They are already at ideal size and have zero internal coupling to parser details.

## Open Questions

### Resolved During Planning

- **Can we split without breaking imports?** ✅ Yes. Re-export module `parser.py` maintains public API; private function imports (`_extract_tags`) inside test files must update paths, but that is test code (not external API).
- **Will test discovery break?** ✅ No. Pytest finds test files by name pattern `test_*.py` anywhere on disk, regardless of nesting. We keep flat structure.
- **Do we need a __init__.py in a subpackage?** ✅ No (see Decision: flat .py module tree). This avoids that overhead.

### Deferred to Implementation

- **Exact test file boundaries** — Which 240 parser tests map to which new test file? Determined during Unit 2 based on function clustering in test_parser.py source.
- **Lazy import points in new modules** — When `parser_extractors.py` needs to call a function in `parser_structured_data.py`, does it import at top level or inside function? Decided during implementation based on actual dependency graph.
- **engine.py refactoring depth** — How far to inline-restructure engine.py before deciding Phase 2 is needed? Deferred; Unit 4 assesses after parser split lands.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Module dependency graph after parser split:**

```
parser.py (re-export facade)
├── parser_page_type_detection.py (2 functions: page type enum)
├── parser_extractors.py (15+ functions: tags, metrics, images, dates, titles)
├── parser_structured_data.py (15+ functions: JSON-LD, OG, Twitter, microdata, merge)
└── parser_main.py (entry points: parse_page, detail/list orchestration)

Imports flow:
- parser_main imports: parser_page_type_detection, parser_extractors, parser_structured_data
- parser_structured_data imports: models, re (no crawler.*)
- parser_extractors imports: models, re, URL tools (no crawler.*)
- parser_page_type_detection imports: models (no crawler.*)
- All use lazy `from crawler.raw_data import ...` inside functions only

Existing downstream unaffected:
- engine.py: from crawler.parser import parse_page (unchanged)
- export.py: from crawler.parser import Resource (unchanged via re-export)
- app.py: from crawler import parser; parser.parse_page(...) (unchanged)
```

**Test mirror structure:**

```
tests/
├── test_parser.py (re-export facade tests, ~50 tests)
├── test_parser_page_type_detection.py (~30 tests)
├── test_parser_extractors.py (~100 tests)
├── test_parser_structured_data.py (~60 tests)
├── test_parser_main.py (~50 tests for entry points)
└── ... (existing test files unchanged)

Total: 240 tests → distributed across 5 files (~50 each), same count, same cases.
```

## Decision Log

**Pre-Flight Check (2026-04-20)**
- ✅ Import cycle verified: Single-direction (extractors → structured_data), no circular dependency
- ✅ Unit 3 Outcome thresholds quantified: 75% / 50-75% / <50%
- ✅ engine.py Phase 2 strategy confirmed: Mandatory Phase 2 (delete Unit 9, plan Phase 2 after Phase 1)

## Implementation Units

- [ ] **Unit 1: Scaffold parser submodules and re-export**

**Goal:** Create 4 new `parser_*.py` modules with stubbed content; establish re-export `parser.py` that imports and exposes all public/private symbols. No behavior change yet—just file structure.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Create: `crawler/parser_page_type_detection.py`
- Create: `crawler/parser_extractors.py`
- Create: `crawler/parser_structured_data.py`
- Create: `crawler/parser_main.py`
- Modify: `crawler/parser.py` (convert to re-export facade)
- Test: `tests/test_parser.py` (verify re-export aliases work)

**Approach:**

1. Create `parser_page_type_detection.py` with stubs for `_detect_page_type()`, `_heading_hierarchy_signal()`, `_jsonld_has_detail_entity()`
2. Create `parser_extractors.py` with stubs for all tag/metric/image/date/title functions (~18 stubs)
3. Create `parser_structured_data.py` with stubs for JSON-LD, OG, Twitter, microdata, merge functions (~15 stubs)
4. Create `parser_main.py` with stubs for `parse_page()`, `_extract_detail_resource()`, `_extract_list_resources()`, container selection, link extraction
5. Rewrite `parser.py` to become a re-export module:
   ```python
   # Re-export for backward compatibility
   from parser_page_type_detection import *
   from parser_extractors import *
   from parser_structured_data import *
   from parser_main import *
   ```
6. Run `python -m pytest tests/test_parser.py -v` to confirm re-exports are discoverable by existing import statements

**Execution note:** Test-first — write a small test that imports `from crawler.parser import parse_page` and confirm it resolves before moving functions.

**Patterns to follow:**
- Use `__all__` in each new module to signal public API
- Keep function docstrings intact (move with function)
- Preserve relative line numbers in old parser.py so git blame is searchable

**Test scenarios:**
- Happy path: `from crawler.parser import parse_page` resolves and is callable
- Edge case: `from crawler.parser import _extract_tags` (private import) still works
- Edge case: `import crawler.parser as parser; parser.parse_page(...)` still works
- Integration: existing test_parser.py test discovery finds all re-exported symbols

**Verification:**
- All existing `from crawler.parser import ...` statements in engine.py, export.py, app.py continue unchanged
- `pytest tests/test_parser.py --collect-only` shows all existing tests still discoverable
- No import errors in full test suite

---

- [ ] **Unit 2: Move page type detection logic**

**Goal:** Move `_detect_page_type()`, `_heading_hierarchy_signal()`, `_jsonld_has_detail_entity()` from parser.py into parser_page_type_detection.py. Update import in parser_main.py.

**Requirements:** R1, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `crawler/parser_page_type_detection.py` (replace stubs with actual code from parser.py:1035–1162)
- Modify: `crawler/parser_main.py` (add import from parser_page_type_detection, update call sites)
- Test: `tests/test_parser_page_type_detection.py` (new, migrated from test_parser.py)

**Approach:**

1. Copy lines 1035–1162 from old parser.py into `parser_page_type_detection.py`
2. In `parser_main.py`, add `from crawler.parser_page_type_detection import _detect_page_type, _heading_hierarchy_signal, _jsonld_has_detail_entity`
3. Update any internal call site in parser_main.py that calls `_detect_page_type(...)` — it will now resolve from the import
4. In `parser.py` (re-export), add `from crawler.parser_page_type_detection import *`
5. Create `tests/test_parser_page_type_detection.py` by moving all page-type-related test classes from test_parser.py (~30 tests). Update import paths in test file.

**Execution note:** Move code as-is; no refactoring. Test failure will signal if any internal call site was missed.

**Patterns to follow:**
- Docstrings stay with function
- Private helper patterns (regex patterns, constants like `_DETAIL_PATH_RE`) move with the function that uses them

**Test scenarios:**
- Happy path: `_detect_page_type(url, soup)` for known list URL returns 'list'
- Happy path: detail URL returns 'detail'
- Edge case: unknown pattern returns 'other'
- Edge case: heading hierarchy fallback triggers when URL signal is weak
- Integration: page type feeds downstream _extract_detail_resource / _extract_list_resources correctly

**Verification:**
- `pytest tests/test_parser_page_type_detection.py -v` passes with ~30 tests
- `pytest tests/test_parser.py -v` still passes (original tests remain, just moved)
- `from crawler.parser import _detect_page_type` still works (re-export)

---

- [ ] **Unit 3: Move extractors (tags, metrics, images, dates, titles)**

**Goal:** Move 18+ functions (tag scoring, metric extraction, image handling, date parsing, title normalization) from parser.py into parser_extractors.py. Update imports in parser_main.py and parser_structured_data.py.

**Requirements:** R1, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `crawler/parser_extractors.py` (replace stubs with code from parser.py ~126–683 tag section + ~481–585 metric section + ~1230–1375 image section + ~1377–1451 date section + ~291–350 title section)
- Modify: `crawler/parser_main.py` (add import from parser_extractors, update call sites)
- Modify: `crawler/parser_structured_data.py` (add import from parser_extractors if needed for cross-calls)
- Test: `tests/test_parser_extractors.py` (new, migrated from test_parser.py)

**Approach:**

1. Copy lines ~126–683 (tags), ~481–585 (metrics), ~1230–1375 (images), ~1377–1451 (dates), ~291–350 (titles) into `parser_extractors.py`
2. In `parser_main.py`, add import: `from crawler.parser_extractors import _extract_tags, _extract_metric, _pick_cover_image, _extract_published_date, _strip_title_site_suffix, ...` (all 18+ functions)
3. In `parser_structured_data.py`, if any function there calls an extractor (e.g., `_extract_metric` from JSON-LD metrics), add the same import
4. Create `tests/test_parser_extractors.py` by moving all tag/metric/image/date/title test classes from test_parser.py (~100 tests). Update imports.

**Execution note:** This is the largest migration. Verify call sites carefully — parser_structured_data and parser_main both call these functions. Use grep to find all call sites before moving.

**Patterns to follow:**
- Constants like `_TAG_SCORE_THRESHOLD`, `_METRIC_MULTIPLIERS`, `_FALLBACK_TAG_CLOUD_CAP` move with their functions
- Regex patterns like `_TAG_PATH_RE`, `_METRIC_NUM_RE` move with their functions

**Test scenarios:**
- Tags: score threshold, CJK percent-encoded href, container-scoped scoring
- Metrics: K/M/B suffix handling, CJK 万/千/亿 multipliers, year protection (copyright 2010 not counted as metric)
- Images: srcset parsing, lazy-load attrs (data-src, data-lazy-src), tiny image rejection, data: URI rejection
- Dates: ISO 8601, slash-separated (2020/01/15), CJK format, time tags extraction
- Titles: site suffix stripping, weak title rescue from siblings

**Verification:**
- `pytest tests/test_parser_extractors.py -v` passes with ~100 tests
- All tag/metric/image/date/title behaviors remain unchanged
- `from crawler.parser import _extract_tags` still resolves

---

- [ ] **Unit 4: Move structured data extraction (JSON-LD, OG, Twitter, microdata, merge)**

**Goal:** Move 15+ functions (JSON-LD parsing, OpenGraph, Twitter Card, microdata, priority merge logic) from parser.py into parser_structured_data.py. Update imports in parser_main.py.

**Requirements:** R1, R4

**Dependencies:** Unit 1, Unit 3 (if parser_structured_data calls functions from parser_extractors)

**Files:**
- Modify: `crawler/parser_structured_data.py` (replace stubs with code from parser.py ~353–1028)
- Modify: `crawler/parser_main.py` (add import from parser_structured_data, update call sites)
- Test: `tests/test_parser_structured_data.py` (new, migrated from test_parser.py)

**Approach:**

1. Copy lines ~353–1028 (JSON-LD, OG, Twitter, microdata, merge) into `parser_structured_data.py`
2. Add imports within `parser_structured_data.py`:
   - If calling `_extract_metric()` or other extractors: `from crawler.parser_extractors import ...`
   - If calling page type helpers: `from crawler.parser_page_type_detection import _jsonld_has_detail_entity`
3. In `parser_main.py`, add import: `from crawler.parser_structured_data import _extract_structured, _merge_by_priority, ...` (all 15+ functions)
4. Update call sites in `parser_main.py` to use imported functions
5. Create `tests/test_parser_structured_data.py` by moving all JSON-LD/OG/Twitter/microdata test classes from test_parser.py (~60 tests). Update imports.

**Execution note:** Watch for cross-module calls. JSON-LD may extract metrics using `_extract_metric()`; ensure import chain is clean (no cycles).

**Patterns to follow:**
- @type detection constants move with parser_structured_data
- `_MISSING_MARKER` constant and `VALID_PROVENANCE_SOURCES` patterns move with merge logic

**Test scenarios:**
- JSON-LD: multiple script blocks merged (author + article dedup), entity selection (BreadcrumbList ignored), @type matching (VideoObject, NewsArticle, etc.)
- OpenGraph: meta tag extraction, og:image with https preference
- Twitter: twitter:player, twitter:image, twitter:title parsing
- Microdata: itemscope/itemprop matching, multiple itemtypes
- Merge: priority chain (JSON-LD > OG > Twitter > microdata), missing marker handling, raw_data provenance mapping
- Integration: merged result feeds downstream resource construction

**Verification:**
- `pytest tests/test_parser_structured_data.py -v` passes with ~60 tests
- All JSON-LD/OG/Twitter/microdata behaviors remain unchanged
- Raw_data provenance dict correctly reflects source for each field

---

- [ ] **Unit 5: Migrate entry points to parser_main.py**

**Goal:** Move `parse_page()`, `_extract_detail_resource()`, `_extract_list_resources()`, container selection, and link extraction logic to parser_main.py. Unify imports and coordination.

**Requirements:** R1, R4

**Dependencies:** Unit 2, Unit 3, Unit 4 (all dependencies mapped)

**Files:**
- Modify: `crawler/parser_main.py` (replace stubs with code from parser.py ~1481–1845)
- Modify: `crawler/parser.py` (verify re-export includes parse_page)
- Test: `tests/test_parser_main.py` (new, migrated from test_parser.py)

**Approach:**

1. Copy lines ~1481–1845 from old parser.py into `parser_main.py`. This includes:
   - `parse_page()` — entry point dispatcher
   - `_extract_detail_resource()` — phase 1 + phase 2 (DOM fallback)
   - `_extract_list_resources()` — cardholder iteration
   - `_pick_main_container()` — article/main/section selection
   - `_extract_links()` — URL extraction and normalization
   - URL normalization helpers
2. At top of `parser_main.py`, collect all imports from other parser submodules:
   ```python
   from crawler.parser_page_type_detection import _detect_page_type
   from crawler.parser_extractors import _extract_tags, _extract_metric, ...
   from crawler.parser_structured_data import _extract_structured, ...
   ```
3. Update all call sites within parser_main functions to use the imported symbols
4. Create `tests/test_parser_main.py` with:
   - `parse_page()` integration tests (~30 tests for detail/list dispatch, link discovery)
   - `_extract_detail_resource()` tests (~10 tests for structured + DOM fallback)
   - `_extract_list_resources()` tests (~10 tests for card iteration, title rescue)

**Execution note:** This is the "glue" layer. Verify all imported functions are called correctly. Run full suite to detect any missed imports.

**Patterns to follow:**
- `parse_page()` remains the public API boundary
- Helper imports are at top of module, no lazy imports at this layer

**Test scenarios:**
- Happy path: detail page → calls _extract_detail_resource → returns Resource with title/views/etc.
- Happy path: list page → calls _extract_list_resources → returns list of Resources
- Happy path: tag page → returns 'tag' type, empty resources
- Edge case: mixed page (list URL but detail content) → page type detection + downstream dispatch
- Integration: extracted Resource.raw_data includes correct provenance (jsonld, opengraph, dom, etc.)
- Integration: links discovered and normalized correctly

**Verification:**
- `pytest tests/test_parser_main.py -v` passes with ~50 tests
- All integration tests from old test_parser.py (cross-concern tests) pass
- `parse_page(url, html)` still returns ParseResult unchanged

---

- [ ] **Unit 6: Rewrite parser.py as re-export facade and remove old code**

**Goal:** Delete the old monolithic parser.py and replace with a clean re-export facade that imports all symbols from submodules. Verify no regressions.

**Requirements:** R3, R4

**Dependencies:** Unit 1–5 (all migration complete)

**Files:**
- Delete: old `crawler/parser.py` (~1,900 lines)
- Create: new `crawler/parser.py` (~50 lines, re-export facade)

**Approach:**

1. Verify `tests/test_parser.py` still passes (should verify re-exports work)
2. Verify all downstream imports work:
   - `python -c "from crawler.parser import parse_page; print(parse_page)"`
   - `python -c "from crawler.parser import _extract_tags; print(_extract_tags)"`
   - `python -c "from crawler.parser import Resource; print(Resource)"`
3. Delete old parser.py
4. Create new parser.py with clean re-exports:
   ```python
   """HTML page parser — extracts resources, links, and page metadata.
   
   Public API: parse_page(). Private functions re-exported for test compatibility.
   
   Implementation split across parser_*.py submodules:
   - parser_page_type_detection: page type enum
   - parser_extractors: multi-signal tag scoring, metric parsing, image/date/title helpers
   - parser_structured_data: JSON-LD, OpenGraph, Twitter, microdata extraction & merge
   - parser_main: entry points and orchestration
   """
   from crawler.parser_page_type_detection import *
   from crawler.parser_extractors import *
   from crawler.parser_structured_data import *
   from crawler.parser_main import *
   
   __all__ = [
       'parse_page',
       'ParseResult',
       # + all private functions for test compatibility
   ]
   ```
5. Run full test suite: `pytest tests/test_parser*.py -v`
6. Spot-check engine.py import: `python -c "from crawler.parser import parse_page; ..."`

**Execution note:** No logic changes — just housekeeping. If any test fails, it signals a missed import or circular dependency.

**Test scenarios:**
- Integration: `from crawler.parser import parse_page; result = parse_page(url, html)` works
- Integration: existing test files all pass
- Boundary: no circular imports (pytest should catch)

**Verification:**
- `pytest tests/test_parser*.py -v` passes all 240+ tests
- `python -c "from crawler import parser; parser.parse_page(...)"` works
- `git log --oneline crawler/parser.py` shows clean history (old monolith replaced)

---

- [ ] **Unit 7: Migrate test_parser.py and create parallel test files**

**Goal:** Reorganize test_parser.py (~2,700 lines, 39 test classes) into 5 parallel test files matching submodule structure. No test logic changes—just reorganization.

**Requirements:** R2, R4

**Dependencies:** Unit 1–6 (all source modules migrated)

**Files:**
- Modify: `tests/test_parser.py` (reduce to re-export facade tests, ~50 tests)
- Create: `tests/test_parser_page_type_detection.py` (~30 tests, moved from test_parser.py)
- Create: `tests/test_parser_extractors.py` (~100 tests, moved from test_parser.py)
- Create: `tests/test_parser_structured_data.py` (~60 tests, moved from test_parser.py)
- Create: `tests/test_parser_main.py` (~50 tests, moved from test_parser.py)

**Approach:**

1. In test_parser.py, identify all test classes by concern:
   - `class TestPageTypeDetection_*` (5–6 classes) → move to test_parser_page_type_detection.py
   - `class TestTags_*`, `TestMetrics_*`, `TestImages_*`, `TestDates_*`, `TestTitles_*` (12–15 classes) → move to test_parser_extractors.py
   - `class TestJSON_LD_*`, `TestOpenGraph_*`, `TestTwitterCard_*`, `TestMicrodata_*`, `TestMerge_*` (12–15 classes) → move to test_parser_structured_data.py
   - `class TestParsePageIntegration_*`, `TestDetailExtraction_*`, `TestListExtraction_*`, `TestLinkExtraction_*` (5–8 classes) → move to test_parser_main.py

2. For each moved test class, update imports:
   - Old: `from crawler.parser import _extract_tags`
   - New in test_parser_extractors.py: `from crawler.parser_extractors import _extract_tags` (or `from crawler.parser import _extract_tags` to verify re-export)

3. Keep test_parser.py as a facade with ~50 tests that specifically test re-export aliasing:
   ```python
   # Verify re-export aliases work
   from crawler.parser import parse_page, _extract_tags, _detect_page_type, ...
   def test_parse_page_re_export():
       assert parse_page is not None
   def test_extract_tags_re_export():
       assert _extract_tags is not None
   ```

4. Run `pytest tests/test_parser*.py --collect-only -q` to verify discovery (~240 tests found)
5. Run `pytest tests/test_parser*.py -v` to verify all tests pass

**Execution note:** This is a pure reorganization. No test logic changes. If a test fails after moving, it signals an import issue—fix the import in the test file.

**Patterns to follow:**
- Keep test class names unchanged (e.g., `TestTagScoring` stays `TestTagScoring`)
- Keep test method names unchanged
- Update only the import statements at the top of each file

**Test scenarios:**
- Meta: `pytest tests/test_parser_page_type_detection.py --collect-only -q` shows ~30 tests
- Meta: `pytest tests/test_parser_extractors.py --collect-only -q` shows ~100 tests
- Meta: `pytest tests/test_parser_structured_data.py --collect-only -q` shows ~60 tests
- Meta: `pytest tests/test_parser_main.py --collect-only -q` shows ~50 tests
- Integration: `pytest tests/test_parser.py -v` passes re-export tests
- Integration: Full suite `pytest tests/test_parser*.py -v` still shows 240+ passing

**Verification:**
- Total test count unchanged (~240)
- No test failures
- Import paths correct in all 5 files
- pytest discovery works with no explicit test list

---

- [ ] **Unit 8: Documentation and refactor summary**

**Goal:** Document the module structure, update any code comments referring to parser.py line numbers, and write a summary of the refactor for future maintainers.

**Requirements:** R1, R2

**Dependencies:** Unit 1–7 (refactor complete)

**Files:**
- Create: `docs/PARSER_MODULARIZATION.md` (new doc explaining module responsibilities)
- Modify: `crawler/parser_main.py` (add module docstring explaining coordination)
- Modify: README.md or relevant docs (update any references to "parser.py" size or structure)

**Approach:**

1. Create `docs/PARSER_MODULARIZATION.md`:
   ```markdown
   # Parser Modularization (2026-04-20)
   
   ## Motivation
   Original parser.py (1,915 lines) split into focused modules.
   
   ## Module Structure
   - parser_page_type_detection.py: page type classification (detail/list/tag/other)
   - parser_extractors.py: tag scoring, metrics, images, dates, titles
   - parser_structured_data.py: JSON-LD, OpenGraph, Twitter, microdata, merge logic
   - parser_main.py: entry points (parse_page), orchestration
   - parser.py: re-export facade for backward compatibility
   
   ## Call Flow
   parse_page(url, html)
     └─ calls _detect_page_type(...) [parser_page_type_detection]
     └─ if detail:
           └─ calls _extract_detail_resource(...) [parser_main]
           └─ calls _extract_structured(...) [parser_structured_data]
           └─ calls _extract_tags(...) [parser_extractors] (DOM fallback)
     └─ if list:
           └─ calls _extract_list_resources(...) [parser_main]
     └─ returns ParseResult
   
   ## Testing
   Tests organized parallel to modules:
   - test_parser_page_type_detection.py (~30 tests)
   - test_parser_extractors.py (~100 tests)
   - test_parser_structured_data.py (~60 tests)
   - test_parser_main.py (~50 tests)
   - test_parser.py (re-export facade tests, ~50 tests)
   ```

2. Add module docstrings to each parser_*.py explaining its role
3. Update any project docs (README, CHANGELOG, etc.) mentioning parser.py structure

**Execution note:** Documentation is optional refinement; ship the refactor without this if time is tight.

**Test scenarios:**
- Meta: documentation accurately reflects file organization and imports

**Verification:**
- `docs/PARSER_MODULARIZATION.md` exists and is accurate
- All parser_*.py files have descriptive docstrings
- README or relevant docs mention modularization

---

## Next Phase: engine.py Modularization (Phase 2)

After Phase 1 complete, plan Phase 2: Split engine.py (656 lines) into `engine_orchestrator.py` (run_crawl + thread pool) and `engine_worker.py` (_process_one_page + _fetch_html + _try_render + write helpers). This is confirmed as **mandatory** by decision, not optional assessment.

---

## System-Wide Impact

**Affected interfaces:**

- **engine.py** — imports `parse_page` from `crawler.parser`. Still works (re-export).
- **export.py** — imports `Resource` from `crawler.parser`. Still works (re-export or `from crawler.models`).
- **app.py** — imports parsing utilities. Still works (re-export).
- **All tests** — import from `crawler.parser` or submodules. Re-export maintains compatibility; new test files are additive.

**No breaking changes to external API or internal contracts.**

**Failure propagation:**
- If an import fails, pytest will catch it immediately (tests depend on correct imports)
- No data loss or state corruption risk (no schema, config, or runtime changes)

**Testing coverage:**
- All 695 existing tests continue to pass
- New test files don't add new test count (reorganization, not new tests)
- No reduction in coverage

**Unchanged invariants:**
- `parse_page()` signature, return type, behavior
- Raw_data provenance tracking and serialization
- Page type detection accuracy
- Downstream resource construction (engine.py, export.py)

## Risks & Dependencies

| Risk | Mitigation |
|------|-----------|
| Import cycle during transition | Unit 1 runs test to verify re-export; catch cycles early |
| Test discovery breaks after split | Pytest finds test_parser*.py files by glob; no brittle imports |
| Line number references in comments become stale | Update docstrings and comments that name old line numbers |
| Missed call site during function move | grep for function names after move; test suite will fail if call site is missing |
| Circular import between submodules | Research identified no cycles; verify in Unit 1 |

**Dependencies:** None. This refactor is pure internal restructuring. No external APIs, dependencies, or configs change.

## Documentation / Operational Notes

- Update CHANGELOG.md: "refactor(parser): Modularize parser.py into focused submodules (4 files, no behavior change)"
- Optional: Add `docs/PARSER_MODULARIZATION.md` explaining new structure and module responsibilities
- No rollout or operational impact (internal refactor only)

## Sources & References

- **Research:** Analyzed 1,915 lines of parser.py (45 functions), 656 lines of engine.py (10 functions), 695 tests (17 files), 6,101 total LOC
- **Patterns:** Existing `core/` submodule organization (8 separate files) demonstrates project precedent for modularization
- **Test precedent:** Existing test files use 1:1 correspondence with module names (test_engine.py, test_render.py)
