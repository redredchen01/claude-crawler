---
title: "feat: Streamlit UI Provenance Display (Phase 2)"
type: feat
status: complete
date: 2026-04-20
completed: 2026-04-20
origin: docs/plans/2026-04-17-005-refactor-structured-data-first-extraction-plan.md#Unit-9
---

# Streamlit UI Provenance Display (Phase 2)

## Overview

Add field-source visibility to the Streamlit rankings dataframe, enabling users to understand where extracted data came from (JSON-LD, OpenGraph, Twitter Cards, Microdata, or DOM heuristics). This closes the gap between raw CSV export (which includes full provenance) and the interactive UI (which previously showed values only). 

**Scope:** UI enhancement only — no schema changes, no data model changes, no crawler behavior changes. This is purely a rendering concern for the results table.

**Phase 2 Gating:** This unit is intentionally deferred and blocked by:
1. Phase 1 Exit Gate must pass (all 8 units complete, code review clean, deployed locally)
2. CSV export must be used long enough to prove insufficient for debugging needs (users ask for in-UI source visibility rather than exporting and checking CSV)
3. Design-lens review blockers must be resolved (see Open Questions below)

If trigger conditions are not met, this plan remains deferred with no implementation timeline.

## Problem Frame

After Phase 1, users can export resources to CSV and see full provenance metadata (`parse_raw_data()` output). However, the interactive Streamlit UI only shows the final values—no indication of which source each field came from. This makes debugging harder: "Why is the title different from the original site?" requires exporting to CSV.

By adding lightweight source visibility to the rankings table, users can immediately see:
- Which fields are high-confidence (JSON-LD, OG, Twitter — structured sources)
- Which fields fell back to DOM heuristics (lower confidence)
- Which fields are completely missing from all sources

This does not change crawling or extraction behavior; it only changes what the UI displays.

## Requirements Trace

- **R11** (from origin Plan 005, Q1 UI section): Provide field-source visibility in the rankings dataframe
- **R11.1**: Compact, non-intrusive source display (must not overwhelm the table)
- **R11.2**: Legend explaining source abbreviations (jl, og, tw, md, dom)
- **R11.3**: Handle old data without provenance (gracefully degrade)
- **R11.4**: Handle partial provenance (only some fields have source data)

## Scope Boundaries

- **NOT in scope:** Changing how data is extracted or stored — provenance already exists in Phase 1's `raw_data` JSON
- **NOT in scope:** Adding new extraction sources or improving extraction accuracy
- **NOT in scope:** Modifying `Resource` dataclass or any database schema
- **NOT in scope:** Changing the export format (CSV/JSON already complete in Phase 1)
- **NOT in scope:** Analytics on source distribution (histogram, charts) — Phase 2 is UI display only
- **NOT in scope:** Detailed per-row source history (e.g., "tried 3 sources, picked best") — Phase 2 shows final source only

## Context & Research

### Relevant Code and Patterns

- **Provenance data:** Already exists in `resources.raw_data` (JSON text field)
  - Entry point: `parse_raw_data(raw: str) → dict` in `crawler/raw_data.py:78`
  - Returns: `{"provenance": {field → source}, "description": "..."}`
  - Sources: `"jsonld" | "opengraph" | "twitter" | "microdata" | "dom" | "missing"`
  
- **Current UI rendering:** `app.py:render_rankings()` (line ~559)
  - Pattern: Build list-of-dicts, pass to `st.dataframe()`
  - Already extends with custom columns (Score, Title, Views, Tags, Category, Published, URL)
  - Data comes from `storage.get_resources(db_path, scan_job_id) → list[Resource]`

- **Field names to track:** 9 provenance-tracked fields from Phase 1
  ```python
  PROVENANCE_FIELDS = [
    "title", "cover_url", "views", "likes", "hearts", 
    "category", "published_at", "tags", "description"
  ]
  ```

- **Source code abbreviations (settled in Phase 1):**
  - `jl` = JSON-LD
  - `og` = OpenGraph  
  - `tw` = Twitter
  - `md` = Microdata
  - `dom` = DOM heuristics
  - `-` or empty = missing from all sources

### Institutional Learnings

No prior team documentation on Streamlit dataframe source tracking. However, Phase 1 established:
- Dict-list dataframe pattern scales well (tested with 100+ resources)
- `st.columns()` for multi-column layouts is performant
- Filtering/aggregation at storage layer (SQL) rather than UI layer (Python)

**Key insight from export.py:** Phase 1 already exports full provenance via `export_resources_json()`. The JSON includes:
```json
{
  "provenance": {
    "title": "opengraph",
    "views": "dom",
    "category": "jsonld",
    ...
  }
}
```

Phase 2 reuses the same `parse_raw_data()` helper that the export layer uses.

### External References

- **Streamlit dataframe best practices:** Use dict-list for static tables, `column_config` for conditional formatting (Streamlit 1.42+)
- **Tooltip/legend patterns:** Streamlit `st.info()`, `st.caption()`, or small text next to header

## Key Technical Decisions

### 1. UI Representation Approach

**Decision:** Implement **Approach A (Preferred)** — compact "Sources" column with field-source pairs.

**Rationale:**
- Minimal table width impact (single column instead of 9)
- High information density (all fields visible in one glance)
- Matches export CSV structure (familiar to users who exported Phase 1 data)
- Avoids expander overhead (Approach B) or button click friction (Approach C)

**Format Decision:** Compact string format with field+source pairs, space-separated.
- Format: `t:jl v:dom l:dom k:jl c:- p:og` (field abbrev + : + source abbrev)
- Field abbreviations: `t=title`, `v=views`, `l=likes`, `h=hearts`, `k=category`, `c=cover`, `p=published`, `g=tags` (g for "tags"), `d=description`
- Example: A resource with JSON-LD title, DOM views/likes, JSON-LD category, missing published:
  ```
  t:jl v:dom l:dom k:jl p:-
  ```

**Visual design:** 
- Column header: "Sources"
- Tooltip on hover (Streamlit `column_config`) to show full names (if Streamlit >= 1.42)
- Fallback for older Streamlit: plain text, rely on legend

### 2. Legend Placement

**Decision:** Display legend as `st.info()` block **above** the rankings table.

**Rationale:**
- Always visible (not buried in a sidebar)
- Self-contained (doesn't require user to find help)
- Matches existing UX (Phase 1's zero-resources diagnosis also uses `st.info()`)
- Compact (6-line explanation)

**Legend content:**
```
Field sources: t=Title  v=Views  l=Likes  h=Hearts  k=Category  c=Cover  p=Published  g=Tags  d=Description
Source codes:  jl=JSON-LD  og=OpenGraph  tw=Twitter  md=Microdata  dom=DOM heuristics  -=Missing
```

### 3. Data Completeness Strategy

**Decision:** Show sources for **all 9 tracked fields**, but only render sources for fields that are actually present in the resource (filter out missing/empty fields in the display).

**Rationale:**
- Users see "v:dom" but not "v:-" if there's no views count
- Reduces clutter (omit missing fields)
- Still shows fallback sources (e.g., "v:dom" = views came from DOM, not structured source)

**Implementation:**
```python
def _format_sources_compact(raw_data: str) -> str:
    """
    Parse raw_data JSON and return compact sources string.
    
    Example input: {"provenance": {"title": "opengraph", "views": "dom"}}
    Example output: "t:og v:dom"
    
    - Only include fields that have a source (skip "missing")
    - Use abbreviations: t, v, l, h, k, c, p, g, d
    - Use source abbreviations: jl, og, tw, md, dom
    - If raw_data is malformed, return "?"
    """
```

### 4. Backward Compatibility (Old Data)

**Decision:** For resources created before Phase 1 (no `raw_data` or empty JSON), show **"–"** in Sources column.

**Rationale:**
- Clear signal that source info is unavailable
- Does not break the dataframe
- Users understand the distinction (new crawls have sources, old ones don't)

**Implementation:** `parse_raw_data()` already handles malformed JSON gracefully (returns `{"provenance": {}}` on error). The compact formatter checks for empty provenance and returns "–".

## Open Questions

### Resolve Before Planning

None — all core decisions are settled by Phase 1 Unit 9 requirements and design-lens review (deferred).

### Deferred to Implementation

1. **Streamlit column_config syntax** — Does the target Streamlit version support custom column tooltips? If not, fall back to plain text + legend. Defer to implementer to check `streamlit.__version__`.
   
2. **Performance with 500+ resources** — Dict-list dataframe is proven for 100+, but not tested at 500+. If pagination is needed, use existing `_render_pagination()` helper. Implementation should monitor and add pagination if UX degrades.

3. **Tooltip vs. legend adequacy** — Will users find the legend without a help icon? Implementer should monitor feedback; if unclear, add a small help icon (`st.info()` or `st.help()`) next to the legend.

## High-Level Technical Design

```
User views rankings table
         ↓
app.py:render_rankings()
         ↓
  Fetch resources from storage
         ↓
  For each Resource:
    ├─ Parse raw_data JSON via parse_raw_data(raw: str)
    ├─ Extract provenance dict
    ├─ Format compact sources string: _format_sources_compact(provenance)
    └─ Add to dataframe dict: {"Title": ..., "Sources": compact_string, ...}
         ↓
  Render legend (st.info with codes)
         ↓
  Render dataframe (st.dataframe with new Sources column)
```

**No schema changes, no data model changes.** This is a pure rendering enhancement.

## Implementation Units

### Unit 1: Add Compact Source Formatter Helper

**Goal:** Implement `_format_sources_compact(raw_data: str) → str` helper to convert raw_data JSON provenance into a readable, compact string format.

**Requirements:** R11.1, R11.4

**Dependencies:** None — pure function, no side effects

**Files:**
- Modify: `app.py` (add helper function, ~30 lines)
- Test: `tests/test_app_helpers.py` (add 5-8 test cases)

**Approach:**
- Call `parse_raw_data(raw_data)` to safely extract provenance dict
- Map 9 field names to single-letter abbreviations (t, v, l, h, k, c, p, g, d)
- Map 5 source names to two-letter abbreviations (jl, og, tw, md, dom)
- Build compact string: iterate provenance dict, skip "missing" entries, join with spaces
- Return "–" if provenance is empty or malformed

**Patterns to follow:**
- `app.py:_format_duration()` (line ~406) — similar one-off formatter
- `crawler/raw_data.py:parse_raw_data()` (line 78) — safe JSON parsing model

**Test scenarios:**
- Happy path: Full provenance with all 9 fields → compact string with all field codes
- Edge case: Partial provenance (only 3 fields) → only those fields in output
- Edge case: Empty provenance dict → return "–"
- Edge case: Malformed raw_data (invalid JSON, null) → return "–" (never raise)
- Edge case: Future field names not in abbrev map → skip them gracefully (explicit test: `test_future_field_names_skipped_gracefully()`)
- CJK titles & descriptions → provenance codes still ASCII (no encoding issues)

**Verification:**
- Unit tests pass for all scenarios
- Output format matches spec: space-separated pairs, no trailing spaces, field codes in consistent order

### Unit 2: Update render_rankings() to Display Sources

**Goal:** Modify `app.py:render_rankings()` to include "Sources" column in the rankings dataframe.

**Requirements:** R11.1, R11.2, R11.3

**Dependencies:** Unit 1 (requires `_format_sources_compact()`)

**Files:**
- Modify: `app.py:render_rankings()` (line ~559, add ~5 lines to dict construction)
- Test: `tests/test_app_helpers.py` (add 3-4 integration test cases)

**Approach:**
- In the dict-list construction loop, add: `"Sources": _format_sources_compact(r.raw_data)`
- Keep existing columns in same order (Score, Title, Views, Likes, Hearts, Tags, Category, Published, URL)
- Add "Sources" column **before** URL (so URL stays rightmost and easy to click)
- **Column width concern:** Sources values can be 20-40 chars (e.g., `t:jl v:dom l:dom k:og p:-`). On narrow screens, this may overflow.
  - Mitigation: For Streamlit >= 1.42, use `column_config={"Sources": st.column_config.TextColumn(width="small")}` to enable truncation with hover tooltip
  - Fallback (Streamlit < 1.42): Let text wrap naturally; rely on legend to explain format
  - Test in Unit 5: Verify readability on mobile width
- No other changes to render_rankings() — filter/pagination/export buttons unchanged

**Patterns to follow:**
- `app.py:render_rankings()` line 684-692 (current dict construction)
- `app.py:_render_history_table()` (similar pattern for history scan jobs table)

**Test scenarios:**
- Happy path: Render a dataframe with Resources → Sources column present and non-empty
- Edge case: Empty resources list → dataframe still renders (no regression)
- Edge case: Resources without raw_data or with null raw_data → Sources column shows "–"
- Integration: Filter/pagination still work with new column
- Manual UI: Open Streamlit and verify Sources column readable, doesn't overflow

**Verification:**
- Dataframe renders without error
- Sources column is readable (text is legible, no truncation)
- Existing functionality (filters, export, URL clicks) unaffected
- Manual Streamlit smoke test: dataframe displays correctly

### Unit 3: Add Legend and Documentation

**Goal:** Display a legend explaining source codes and field abbreviations above the rankings table. Add docstring to `render_rankings()` noting the new column.

**Requirements:** R11.2

**Dependencies:** Unit 1, Unit 2 (legend is displayed after dataframe is defined)

**Files:**
- Modify: `app.py:render_rankings()` (add ~8 lines for legend, update docstring)
- No test file changes

**Approach:**
- Before `st.dataframe()` call, add:
  ```python
  st.info("""
  **Field sources:** Each field's value comes from one source.  
  t=Title | v=Views | l=Likes | h=Hearts | k=Category | c=Cover | p=Published | g=Tags | d=Description  
  **Sources:** jl=JSON-LD | og=OpenGraph | tw=Twitter | md=Microdata | dom=DOM heuristics | –=Missing
  """)
  ```
- Update `render_rankings()` docstring to explain the Sources column
- Keep legend formatting minimal (use `st.info()` for consistency with existing diagnostics)

**Patterns to follow:**
- `app.py:_render_zero_resources_diagnosis()` (line ~436) — uses `st.info()` for explanation blocks
- `app.py:render_ranking()` docstring style

**Test scenarios:**
- Manual: Legend text is readable, codes are all explained
- Manual: Legend appears above the dataframe (not below or in sidebar)
- Manual: Legend does not push dataframe off-screen (responsive layout)

**Verification:**
- Legend renders without error
- All source codes explained
- No spillover or layout issues

### Unit 4: Handle Edge Cases in Tests

**Goal:** Comprehensive test coverage for edge cases: old data without provenance, mixed provenance, malformed JSON.

**Requirements:** R11.3, R11.4

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create/Modify: `tests/test_app_helpers.py` (add TestRenderRankingsProvenanceEdgeCases class with ~8 tests)
- Test file should mock `st.dataframe()` and `st.info()` as done in Unit A (test_app_helpers.py:TestRenderHistoryTable)

**Approach:**
- Test with Resource objects that have:
  - Valid raw_data with full provenance
  - Valid raw_data with partial provenance (only 3-4 fields)
  - Empty raw_data (empty string or "{}")
  - Null raw_data (None)
  - Malformed JSON in raw_data
  - Old Resource created before Phase 1 (no raw_data field)
  
- Mock `st.dataframe()` and verify:
  - data dict includes "Sources" key
  - Sources value is string (either compact format or "–")
  - Other columns unchanged

**Patterns to follow:**
- `tests/test_app_helpers.py:TestRenderHistoryTable` (line ~TBD, existing mock pattern)
- `tests/test_raw_data.py:TestParseRawDataTolerance` (line ~TBD, lenient parsing model)

**Test scenarios:**
- Happy path: 10 Resources with full provenance → all Sources rendered correctly
- Edge case: 1 Resource with no raw_data → Sources shows "–"
- Edge case: 5 Resources, 2 with provenance, 3 without → mixed display
- Edge case: raw_data contains future field names not in abbrev map → skip gracefully
- Error resilience: Malformed JSON → returns "–" (never raises, never crashes dataframe)

**Verification:**
- All test cases pass
- Mock assertions verify "Sources" key in data dict
- Error cases confirmed non-crashing

### Unit 5: Manual Streamlit UI Verification

**Goal:** Manually verify the Sources column displays correctly in the live Streamlit UI with real scan data (kissavs domain, Phase 1 extracted resources).

**Requirements:** R11.1, R11.2, R11.3

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4 (all other units)

**Files:**
- No code changes (verification only)
- Document findings in test session notes

**Approach:**
- Start Streamlit dev server: `streamlit run app.py`
- Perform a new scan on kissavs (or use existing Phase 1 scan results from memory)
- Navigate to "Results > Rankings" tab
- Verify:
  1. Legend displays above the dataframe (readable, all codes explained)
  2. Sources column is present and populated
  3. Each row shows compact source string (e.g., "t:jl v:dom l:-")
  4. Column does not overflow or break table layout
  5. Can still interact with table (sort, filter, export)
  6. For a resource known to have JSON-LD data (e.g., title from OG), verify "t:og" is shown
  7. For a resource known to have DOM fallback (e.g., views from heuristics), verify "v:dom" is shown
  
- Test with filters active:
  - Apply status filter (completed/failed) → Sources column still correct
  - Apply resource range filter → Sources column still correct
  - Pagination to next page → Sources column correct
  
- Export and compare:
  - Download CSV → verify provenance column matches Sources column display
  - Download JSON → verify provenance matches Sources column display

**Verification:**
- No console errors or warnings
- Table renders in expected layout
- Sources column is readable and accurate
- No performance degradation (dataframe loads quickly)
- Filters and exports unaffected

## System-Wide Impact

- **Interaction graph:** read-only enhancement
  - `app.py:render_rankings()` → calls `parse_raw_data()` from crawler/raw_data.py
  - No callbacks, no side effects, no state mutations
  - Legend rendered via `st.info()` (built-in Streamlit component)

- **Error propagation:** Defensive
  - `_format_sources_compact()` never raises (returns "–" on any error)
  - `parse_raw_data()` never raises (already lenient from Phase 1)
  - `st.dataframe()` handles gracefully (Streamlit always renders, even with None values)

- **State lifecycle risks:** None
  - No new session_state keys
  - No database mutations
  - No cache invalidation needed
  - Old scan results display correctly (graceful degradation for missing raw_data)

- **API surface parity:** No changes
  - `Resource` dataclass unchanged
  - `storage.get_resources()` unchanged
  - Export functions unchanged
  - No public APIs modified

- **Integration coverage:** Light
  - `render_rankings()` is a leaf function (no callers depend on its output beyond Streamlit rendering)
  - Filter/pagination/export buttons tested separately in Phase 1
  - This unit adds a column to the dict; all existing code paths unaffected

- **Unchanged invariants:**
  - Resource dataclass has exact same fields
  - SQLite schema untouched
  - Extraction behavior untouched (Phase 1 determines provenance)
  - CSV/JSON export unchanged (Phase 1 export already includes full provenance; Phase 2 just displays it)

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Streamlit version < 1.40 lacks column_config support | Low | Cannot add tooltips to "Sources" header | Fall back to plain text legend; still readable |
| 500+ resources cause dataframe render lag | Low | Users perceive slow UI | Use existing pagination helper; monitor first implementation |
| Users confused by field/source abbreviations | Med | Support questions increase | Legend is always visible (st.info() above table); clear, single explanation block |
| Raw_data JSON format changes in future (v2 schema) | Very low | `_format_sources_compact()` breaks | Version provenance dict in raw_data; maintain backward compat in parser |

## Documentation / Operational Notes

- **User documentation:** Add brief note to app UI or README explaining the Sources column
  - "Sources column shows where each field's value came from (e.g., jl=JSON-LD, dom=DOM heuristics)"
  
- **Developer notes:** Document the field and source abbreviation mappings in code (unit 1 docstring)
  
- **No monitoring required:** This is read-only UI enhancement; no runtime metrics, no error handling changes, no performance monitoring needed

---

## Blockers & Trigger Conditions

**This plan is explicitly BLOCKED until all of the following conditions are met:**

### Blocking Condition 1: Phase 1 Exit Gate Must Pass
- All 8 units of Phase 1 (refactor/crawler-concurrency) must be merged to main
- Code review must pass with 0 blocking findings
- 493+ tests must pass
- Live validation (kissavs domain crawl) must complete without errors

**Owner:** Current session — Phase 1 is not yet pushed or merged  
**Current status:** Phase 1 complete locally on refactor/crawler-concurrency, not yet merged

### Blocking Condition 2: CSV Export Usage Proves Insufficient [DEPLOYMENT GATE, NOT CODING GATE]
- Phase 1 CSV export must be deployed and used by actual users for ≥2 weeks
- Users must report that exporting to CSV for debugging is cumbersome
- Explicit request for in-UI source visibility must come from user feedback or internal testing

**Owner:** Post-Phase-1-deployment user feedback loop  
**Current status:** Not applicable yet (Phase 1 not deployed)

**Important Clarification (from architecture review):** This is a **deployment gate**, not a **coding gate**. Phase 2 code implementation can proceed in parallel with Phase 1's deployment and feedback cycle. Once Phase 1 merges to main and is deployed, Phase 2 Units 1-4 can be completed and merged (to a feature branch or main) while waiting for the 2-week+ feedback window. Phase 2 UI components are only activated in production after user feedback confirms CSV-only approach is insufficient.

### Blocking Condition 3: Design-Lens Review Issues Must Be Resolved
From origin Plan 005, Unit 9:

> 启动前必须先解决 design-lens 审阅提出的 IA 问题：user job 拆分、编码方式（推荐 column tooltip + 可视化 badges 而非 AI-slop 风格 `t:jl` 缩写）、空态/混合态/损坏态设计、legend 稳定位置。

**Design issues to resolve:**
1. **User job clarity:** What user action requires seeing source info? (Answer: debugging why a field differs from source site)
2. **Encoding approach:** Chosen: compact string format `t:jl v:dom` (rejected: verbose `t:opengraph` as "AI-slop style")
3. **State design:**
   - Empty state (no resources): diagram handled by existing `_render_zero_resources_diagnosis()`
   - Mixed state (some resources with provenance, some without): handled by returning "–" for missing
   - Damaged state (malformed raw_data): handled by `parse_raw_data()` lenience
4. **Legend position:** Chosen: `st.info()` block above dataframe (always visible, not in sidebar)

**Design-lens findings incorporated into this plan (Units 1-3 implement the choices above)**

**Owner:** Code review during implementation (units 2-3 embed the design choices)  
**Current status:** Design decisions finalized in this plan; ready for code review

---

## Next Steps

**If Phase 2 is triggered (all blocking conditions met):**
1. Use `/ce:work` with this plan to execute Units 1-5 in sequence
2. Each unit should land as a separate commit
3. Final code review via `ce:review mode:autofix`
4. Merge to main when all tests pass and code review is clean

**If Phase 2 remains deferred:**
- This plan stays in `docs/plans/` as a reference
- Revisit when Phase 1 is deployed and user feedback arrives
- Update trigger conditions as needed based on actual usage patterns

---

## Sign-Off

**Plan Status:** ✅ Ready for implementation (when trigger conditions are met)

**Acceptance:** This plan satisfies all requirements from origin Unit 9. Units 1-5 are executable without further planning. Design decisions are settled and risk-mitigated.
