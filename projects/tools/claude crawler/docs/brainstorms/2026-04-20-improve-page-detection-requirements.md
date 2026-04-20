---
date: 2026-04-20
topic: improve-page-type-detection
---

# 改进页面类型检测 — 修复 90% 的"Other"页面

## Problem Frame

当前爬虫有 90% 的页面被误分类为 "other"，导致零资源提取。这是数据质量的最大瓶颈。

根据分析：
- 总页面数：~22k
- 被正确分类：~10%（detail/list/tag）
- 被误分类：~90%（other）
- 影响：这 ~20k 个页面的内容完全被浪费

许多"other"页面实际上是 detail 或 list 页面，只是当前的启发式规则不够完整。例如：
- `/video/detail/123` ✗ 错误分类为 other（应该是 detail）
- `/av/updates/` ✗ 错误分类为 other（应该是 list）

## Key Decisions (Resolved)

### Decision 1: HTML Storage Strategy
- **Choice:** Backfill `raw_html` to database for all ~22k pages
- **Rationale:** Enables complete offline validation; can re-run `_detect_page_type()` without re-crawling
- **Cost:** One full re-crawl of existing URLs to store HTML
- **Benefit:** Full visibility into reclassification logic for debugging

### Decision 2: Detection Priority Order
- **Choice:** URL patterns prioritized over JSON-LD and HTML analysis
- **Current code order:** JSON-LD > card count > HTML metadata
- **New order:** URL patterns (fastest, most reliable) > JSON-LD > HTML heuristics
- **Rationale:** URL patterns are the most reliable signal across domains; should run first
- **Impact:** Requires reordering logic in `_detect_page_type()` (lines 1034-1115)

### Decision 3: Success Metrics
- **Primary goal:** Reclassify **≥70%** of 'other' pages to detail/list (up from 50%)
- **Secondary goal:** Of reclassified pages, **≥80%** yield ≥1 resource via existing extraction logic
- **Rationale:** 70%+ hits the problem; 80%+ extraction ensures data quality improvement, not just classification change

## Requirements

**Page Type Detection — URL Patterns (Execute First)**
- R1. Add missing detail URL keywords: `/item/`, `/view/`, `/watch/` (currently only `/detail/`, `/video/`, `/article/`, `/post/`)
- R2. Improve list URL detection: extend `_LISTING_PATH_RE` to include `/updates/`, `/browse/`, `/search/`, `/archive/`
- R3. Implement URL-first precedence in `_detect_page_type()`: check URL patterns **before** JSON-LD (requires reordering lines 1034-1115)

**Page Type Detection — HTML Heuristics (Validate Existing)**
- R4. Validate existing `<article>` + `<h1>` detection (line 1106 already exists; test offline)
- R5. Validate existing `<main>` tag heuristic (line 1087 already exists; test offline)
- R6. Validate JSON-LD detail entity detection (lines 1075-1077 already exists; test offline)
- R7. For pages that fail R1-R6, use heading hierarchy heuristic: h1 + sparse elements → likely detail; multiple h2+ → likely list

**HTML Storage & Offline Validation**
- R8. Add `raw_html` column to `pages` table; backfill by re-crawling all ~22k pages
- R9. Offline validation: for each page in DB, run reclassification logic, record old_type → new_type + reason
- R10. Export reclassification audit trail: CSV (url, old_type, new_type, detection_reason) for manual inspection

**Extraction Validation (NEW)**
- R11. Sample 100 reclassified pages; run existing `_extract_detail_resource()` / `_extract_list_resources()` logic
- R12. Measure extraction success rate: % of sampled pages that yield ≥1 resource (must be ≥80%)
- R13. If extraction fails on >20% of reclassified pages, pause reindexing and debug extraction logic

**Success Criteria**
- ≥70% of 'other' pages reclassified to detail/list (new target, up from 50%)
- ≥80% of reclassified pages yield ≥1 resource via existing extraction logic
- No reclassification of already-correct detail/list/tag pages (validation must prevent false positives)
- Offline validation complete with extraction sampling before reindexing

## Scope Boundaries

**Non-Goals:**
- Do not re-run extraction on already-extracted "detail" pages (preserve existing data)
- Do not introduce ML or external APIs
- Do not modify resource extraction logic (only test it on reclassified pages)
- Do not add body-text heuristics (R8 in original brainstorm deferred to Phase 2)

**Phase 2 (Conditional):**
- If Phase 1 achieves <70% reclassification, add body-text length heuristic (>2000 chars + heading → detail)

## Key Dependencies / Assumptions

- **Assumption 1:** URL patterns are more reliable than HTML heuristics (validated by code review)
- **Assumption 2:** Existing HTML heuristics (already in code) will catch 30-50% of "other" pages when tested offline
- **Assumption 3:** Extraction logic (lines 1779-1792) works on reclassified pages without modification
- **Dependency 1:** Must have raw_html stored before running offline validation
- **Dependency 2:** Extraction sampling (R11-R13) must complete before reindexing

## Outstanding Questions

### Resolve Before Planning
- (None — all blocking questions resolved)

### Deferred to Planning
- [Technical] Exact reordering of `_detect_page_type()` to prioritize URL patterns without breaking JSON-LD detail detection
- [Technical] Implementation of heading hierarchy heuristic (R7) — how to detect "sparse" elements?
- [Technical] Schema migration strategy for `raw_html` column — backfill approach, storage implications
- [Needs research] Sample 20-50 actual "other" pages to verify URL patterns catch the majority; adjust R1-R2 based on findings

## Next Steps

Brainstorm complete. All blocking questions resolved.

**Key decisions:**
1. HTML storage: Backfill `raw_html` via full re-crawl
2. Detection priority: URL patterns first
3. Success target: 70% reclassification + 80% extraction success

→ `/ce:plan` for structured implementation planning
