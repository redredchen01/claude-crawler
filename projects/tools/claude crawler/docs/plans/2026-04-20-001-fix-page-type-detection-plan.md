---
date: 2026-04-20
status: active
topic: improve-page-type-detection
---

# 改进页面类型检测 — 90% 的"Other"页面修复计划

## Problem Frame

当前爬虫有 90% 的页面被误分类为 "other"（~20k 页），导致零资源提取。通过改进页面类型检测启发式规则和离线验证，可以将正确分类率从 10% 提升到 80%+，从而恢复 20k 页的资源提取。

## Decisions (Carried Forward)

**Decision 1: HTML Storage Strategy**
- Backfill `raw_html` to database for all ~22k existing pages
- Enables offline validation without re-crawling
- Cost: One full re-crawl + storage increase (~50-100MB for ~22k pages)

**Decision 2: Detection Priority Order**
- URL patterns first (fastest, most reliable) → JSON-LD → HTML heuristics
- Reorder `_detect_page_type()` logic to check URL patterns before JSON-LD block

**Decision 3: Success Metrics**
- Primary: ≥70% of 'other' pages reclassified to detail/list
- Secondary: ≥80% of reclassified pages extract ≥1 resource
- Both metrics must be met before reindexing production

## Implementation Units

### Unit 1: Fix Syntax Error in Detail Patterns (5 min)
**Files:** `crawler/parser.py` (line 1047)

**What:** Fix malformed string in `detail_patterns` list.

**Issue:** Line 1047 reads:
```python
"/novel/", "/story/, /item/", "/view/", "/watch/"
```

Should be:
```python
"/novel/", "/story/", "/item/", "/view/", "/watch/"
```

The missing quote after `/story/` causes the string `/story/, /item/` to parse as a single token, breaking pattern matching.

**Test scenarios:**
- T1.1 (Linting): Run `python -m py_compile crawler/parser.py` → no SyntaxError (verifies fix was applied)
- T1.2 (Regression): Run `_detect_page_type()` on URL with `/story/` → should return "detail"
- T1.3 (Regression): Run `_detect_page_type()` on URL with `/item/` → should return "detail"

**Commits:** 1 commit: `fix(parser): Fix syntax error in detail_patterns list`

---

### Unit 2: Enhance Listing Path Regex with Safe Boundaries (15 min)
**Files:** `crawler/parser.py` (lines 269-274)

**What:** Add missing URL keywords to `_LISTING_PATH_RE` regex with negative lookahead to prevent false positives.

**Current:** `updates|list|search|archive|archives|category|categories|channel|channels|tag|tags|theme|themes|hot|new|recent|trending|popular|latest|page/\d+`

**Problem (Adversarial Review):** Adding broad keywords like `/browse/`, `/index/` can match detail pages too (e.g., `/browse/item/123`, `/index/456`). Without boundaries, legitimate detail pages are reclassified to 'list', hiding resources.

**Safe regex with negative lookahead (P1 Fix):**
```python
_LISTING_PATH_RE = re.compile(
    r"/(updates|list|search|archive|archives|category|categories|"
    r"channel|channels|tag|tags|theme|themes|hot|new|recent|trending|"
    r"popular|latest|page/\d+|browse|index|feed|feeds)"
    r"(?!/(?:item|view|watch|detail|article|post|video)/[a-z0-9-]+)/?",  # Negative lookahead with ID pattern
    re.I,
)
```

**Explanation:**
- Negative lookahead `(?!/(?:...|detail)/[a-z0-9-]+)` matches only if followed by detail+ID
- Prevents `/browse/item/123` but ALLOWS `/browse/detail/all` (no numeric ID)
- Edge case: `/browse-item/123` (hyphenated, no slash) bypasses regex — logged as known limitation

**Rationale:** 
- `/browse/` is common in art sites, storefronts
- `/index/` is legacy listing pattern
- `/feed/` and `/feeds/` for syndication-style pages
- Boundary guards prevent detail→list false positives while allowing listing pages using detail keywords

**Test scenarios:**
- T2.1: URL `/browse/all` with ≥6 thumbnails → should return "list" ✓
- T2.2: URL `/browse/item/123` with ≥6 thumbnails → should return "detail" (negative lookahead rejects listing pattern; recovery: JSON-LD entity, h1+article structure, or heading heuristic must catch it) ✓
- T2.3: URL `/index` with ≥6 thumbnails → should return "list" ✓
- T2.4: URL `/feed` with ≥6 thumbnails → should return "list" ✓
- T2.5: URL `/browse/detail/all` with ≥6 thumbnails → should return "list" (lookahead allows, no numeric ID) ✓
- T2.6: URL `/browse-item/123` (hyphenated, no slash) → should return "list" (lookahead doesn't apply, threshold ≥6 catches) ✓ [Known limitation: regex relies on / separator]

**Recovery Guarantee (P1 FIX):**
When negative lookahead rejects a URL (e.g., `/browse/item/123`), the page must have a recovery signal to be classified as detail:
- JSON-LD detail entity (VideoObject, Article, etc.)
- `<article>` + `has_numeric_id` pattern
- Heading hierarchy heuristic (Unit 4): h1==1 + h2≤3 + body >500 chars

If recovery signals fail and page stays "other", this is a known false negative (acceptable for sites without semantic structure).

**Commits:** 1 commit: `enhancement(parser): Add missing listing path keywords with safe boundaries`

---

### Unit 3: Diagnose Root Cause of 90% Misclassification (15 min, Investigation-First)
**Files:** `crawler/parser.py` + `tests/test_parser.py`

**CRITICAL CONTEXT:** Code inspection shows listing-before-JSON-LD order is ALREADY implemented (lines 1063-1077). Unit 3 is NOT about reordering code; it's about diagnosing WHY 90% of pages are 'other' despite correct architecture.

**What:** 
1. Trace through _detect_page_type() on 10 real 'other' pages from production
2. Identify which heuristic(s) are FAILING to reclassify them (URL patterns not catching domain? Missing keywords? Heading heuristic returns None?)
3. Determine: is the problem missing keywords (Unit 2 fix)? Wrong thresholds (Unit 3.5 fix)? Or something else?

**Investigation steps:**
- Load 10 'other' pages from database (WHERE page_type='other')
- For each page: run _detect_page_type() with debug logging to trace decision order
- Log: which signals were evaluated, which matched, which skipped, why returns "other"
- Group by root cause (missing URL pattern, no JSON-LD entity, heading heuristic returns None, card count too low, etc.)
- Calculate recovery rate if Unit 2 (regex keywords) and Unit 4 (heading heuristic) are implemented

**Success Criteria:**
- **Outcome A (Likely):** Diagnosis shows Units 2 + 4 would recover >60% of sampled 'other' pages → SKIP Unit 3, proceed to Units 3.5-4
- **Outcome B (Unlikely):** Diagnosis shows current detection order IS the problem → Document exact failure case, KEEP Unit 3 ordering task
- **Outcome C (Risk):** Diagnosis inconclusive or root cause is external (data quality, page parsing, HTML truncation) → Escalate to stakeholder before proceeding to Units 3.5+

**Test scenarios:**
- T3.1: Load 10 'other' pages, trace detection logic, log decision order → diagnosis document
- T3.2: Categorize failures by root cause → distribution (% from regex, % from heading heuristic, % from other)
- T3.3: Estimate recovery rate if Units 2+4 implemented

**Commits:** 1 commit: `docs(investigation): Root cause diagnosis for 90% 'other' pages` (if needed, documents findings)

**Critical Recovery Tree & Checkpoint (P1 FIX #4 & #15):**
```
CHECKPOINT: After Unit 3 investigation completes, stakeholder/reviewer MUST confirm
outcome (A/B/C) before proceeding to Unit 3.5. Decision is NOT automatic.

Unit 3 DECISION CRITERIA (Explicit Thresholds — P1 FIX #4):

IF diagnosis shows ≥60% of failures are due to:
  - Missing URL keywords (Unit 2 regex catches them)
  - Wrong heading thresholds (Unit 4 heuristic would fix them)
  → OUTCOME A: Units 2+4 will fix the problem
  → Action: SKIP Unit 3 reordering, proceed directly to Unit 3.5
  → Save: 15 min on critical path
  
ELSE IF diagnosis shows current code order is WRONG:
  - JSON-LD block is checked BEFORE listing URL check
  - (Contradicts line 111 "order is ALREADY implemented" — verify by code inspection)
  → OUTCOME B: Code reordering required
  → Action: KEEP Unit 3 reordering, implement fix
  → Cost: +15 min to critical path
  
ELSE (cannot definitively determine root cause):
  - <60% of failures are from keywords/thresholds
  - Code order check is inconclusive
  - >40% of failures are from external causes (HTML truncation, JS rendering, missing metadata)
  → OUTCOME C: Inconclusive or external root cause detected
  → Action: ESCALATE to stakeholder
  → Options: (a) continue with reduced target (60% reclassification + 70% extraction), (b) defer to Phase 2, (c) investigate further
  → BLOCKS all downstream units (3.5, 4, 6, 8) until stakeholder decision
  → Resolution time: 30 min stakeholder sync (does NOT count against 4-hour debugging budget)

Approval Gate Format (P1 FIX #15):
1. Share Unit 3 diagnosis document in PR comment or GitHub issue
2. Stakeholder replies: "Outcome A (skip Unit 3)" OR "Outcome B (keep Unit 3)" OR "Outcome C (escalate)" + rationale
3. Document approval in commit message before proceeding to Unit 3.5
```

**Implementation Gate:** Do not start Unit 3.5 without written confirmation (GitHub comment or email) from stakeholder on Unit 3 outcome.

---

### Unit 3.5: Threshold Discovery on Sample Data (45 min)
**Files:** `crawler/scripts/discover_heading_thresholds.py` (new)

**What:** Empirically derive heading hierarchy thresholds before implementing Unit 4.

**Problem:** Unit 4's thresholds (h1==1, h2≤3 for detail; h2>8 for list) are assumed, not validated. Real domains may have detail pages with many h2 subheadings or list pages with sparse h2. Running Unit 4 with wrong thresholds causes silent misclassification.

**Solution:** Analyze real 'other' pages to compute F1 scores for different threshold combinations.

**Script behavior:**
1. Query 50-100 'other' pages from production (WHERE page_type='other' AND raw_html != '')
2. For each page:
   - Extract h1_count, h2_plus_count, body_length via BeautifulSoup
   - Manually inspect 10-20 pages to determine correct_type (detail or list or other)
   - Store: (url, h1_count, h2_plus_count, body_length, correct_type)
3. Compute F1 scores for candidate thresholds:
   - Threshold set A: h1==1 ∧ h2≤3 ∧ body>500 → detail; h2>8 → list
   - Threshold set B: h1==1 ∧ h2≤5 ∧ body>800 → detail; h2>6 → list
   - Threshold set C: h1≤1 ∧ h2≤2 ∧ body>1000 → detail; h2>10 → list
4. Report F1 score for each set; select set with highest precision (>70%)
5. Output: recommended thresholds with confidence score

**Test scenarios:**
- T3.5.1: Script runs on 50 test pages with valid raw_html
- T3.5.2: Manual inspection on 10 pages is recorded (correct_type field)
- T3.5.3: F1 scores computed for 3+ threshold sets
- T3.5.4: Recommended thresholds have ≥70% precision

**Output:** JSON with recommended thresholds + validation report

```json
{
  "threshold_sets": [
    {
      "name": "Set A",
      "h1_max": 1,
      "h2_max": 3,
      "body_min": 500,
      "h2_list_min": 8,
      "h1_list_min": 2,
      "f1_score": 0.73,
      "precision": 0.75,
      "recall": 0.72
    },
    {
      "name": "Set B",
      "h1_max": 1,
      "h2_max": 5,
      "body_min": 800,
      "h2_list_min": 6,
      "h1_list_min": 2,
      "f1_score": 0.70,
      "precision": 0.70,
      "recall": 0.71
    }
  ],
  "recommended_set": "Set A",
  "best_precision": 0.75,
  "samples_evaluated": 100
}
```

**Data Flow to Unit 4 (P1 Fix — Field Naming Alignment):**
Unit 3.5 JSON field names **must match** Unit 4 Python constant names for clean integration. Mapping:
- JSON: `h1_max` → Python: `HEADING_DETAIL_H1_MAX`
- JSON: `h2_max` → Python: `HEADING_DETAIL_H2_MAX`
- JSON: `body_min` → Python: `HEADING_DETAIL_BODY_MIN`
- JSON: `h2_list_min` → Python: `HEADING_LIST_H2_MIN`
- JSON: `h1_list_min` → Python: `HEADING_LIST_H1_MIN`

Unit 4 implementation reads Unit 3.5 output:
```python
# In Unit 4 _heading_hierarchy_signal():
# Load thresholds from Unit 3.5 JSON output
import json
with open('threshold_discovery_output.json') as f:
    thresholds = json.load(f)
    recommended = thresholds['recommended_set']
    HEADING_DETAIL_H1_MAX = recommended['h1_max']           # Match field names
    HEADING_DETAIL_H2_MAX = recommended['h2_max']
    HEADING_DETAIL_BODY_MIN = recommended['body_min']
    HEADING_LIST_H2_MIN = recommended['h2_list_min']
    HEADING_LIST_H1_MIN = recommended['h1_list_min']
```

**Integration Gate (P1):** Before committing Unit 4, implementer confirms all threshold values in code match Unit 3.5 recommended_set JSON. No silent mismatches allowed.

**Commits:** 1 commit: `tool(scripts): Add threshold discovery for heading hierarchy heuristic`

---

### Unit 4: Implement Heading Hierarchy Heuristic (30 min)
**Files:** `crawler/parser.py` (new function + integration into `_detect_page_type()`)

**What:** Add heading hierarchy heuristic to distinguish detail vs list pages when other signals fail.

**Rationale:** 
- Detail pages: single h1 + sparse content (few h2/h3)
- List pages: many h2+ headings (card titles)

**New function `_heading_hierarchy_signal()` (lines 1000-1033):**

Uses thresholds derived from Unit 3.5 threshold discovery.

```python
def _heading_hierarchy_signal(soup: BeautifulSoup) -> str:
    """Infer page type from heading structure.
    
    Detail pages: single h1 + few h2/h3 + reasonable body
    List pages: many h2+ headings (card titles) or no h1
    Returns: 'detail', 'list', or None if inconclusive.
    
    Thresholds from Unit 3.5 discovery (empirically validated on production).
    """
    h1_count = len(soup.find_all("h1"))
    h2_plus_count = len(soup.find_all(["h2", "h3", "h4"]))
    body_text = soup.get_text(strip=True)
    body_length = len(body_text)
    
    # Config thresholds (from Unit 3.5 threshold discovery)
    HEADING_DETAIL_H1_MAX = 1          # Single h1 for detail
    HEADING_DETAIL_H2_MAX = 3          # Few h2+ for detail
    HEADING_DETAIL_BODY_MIN = 500      # Minimum body length
    HEADING_LIST_H2_MIN = 8            # Many h2+ for list
    HEADING_LIST_H1_MIN = 2            # Multiple h1 for list
    
    # No h1 at all → unclear, likely list or missing structure
    # NOTE: This is a special case not covered by Unit 3.5 thresholds.
    # Acceptable as edge case (rare); if domains show h1=0 + detail patterns,
    # Unit 3.5 will capture in next iteration by adding h1=0_threshold.
    if h1_count == 0:
        return "list" if h2_plus_count > 5 else None
    
    # Single h1 + sparse h2+ + reasonable body → detail
    if h1_count <= HEADING_DETAIL_H1_MAX and h2_plus_count <= HEADING_DETAIL_H2_MAX and body_length > HEADING_DETAIL_BODY_MIN:
        return "detail"
    
    # Many h2+ relative to h1 → likely list grid with h2 card titles
    if h2_plus_count >= HEADING_LIST_H2_MIN:
        return "list"
    
    # Multiple h1 (unusual) → list-like
    if h1_count >= HEADING_LIST_H1_MIN:
        return "list"
    
    return None
```

**Threshold Validation:** All constants are derived from Unit 3.5 and must be validated before committing

**Integration into `_detect_page_type()` (before final "other" fallback):**
- Location: Insert between line 1113 (end of moderate list signals) and line 1115 (return "other")
- Call `_heading_hierarchy_signal(soup)` as last heuristic before returning "other"
- Only use if no other signals matched
- New code flow:
  ```python
  if len(articles) > 3 or len(dotcards) > 3:
      return "list"
  if len(link_cards) > 5:
      return "list"
  
  # NEW: Heading hierarchy heuristic (Unit 4)
  hierarchy_signal = _heading_hierarchy_signal(soup)
  if hierarchy_signal is not None:
      return hierarchy_signal
  
  return "other"
  ```

**Test scenarios:**
- T4.1: Single h1 + 2 h2 + 1000 chars body → return "detail"
- T4.2: Single h1 + 12 h2 (card titles) → return "list"
- T4.3: No h1 + 10 h2 → return "list"
- T4.4: No headings at all → return None (inconclusive)

**Commits:** 1 commit: `feat(parser): Add heading hierarchy heuristic for page type inference`

---

### Unit 5: Add raw_html Column to Schema & Implement Backfill (90 min total, Phase 2 only)

**SCOPE CLARIFICATION (P1 FIX #11):** Unit 5A+5B both defer to Phase 2 (production schema changes). Phase 1 uses in-memory test fixtures for raw_html validation.

**Part A: Schema Migration (15 min, Phase 2)**

**Files:** `crawler/storage.py`

**What:** Add `raw_html` TEXT column to `pages` table to store full HTML for offline validation.

**Current schema (lines 32-42):**
```sql
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id),
    url TEXT NOT NULL,
    page_type TEXT NOT NULL DEFAULT 'other',
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    fetched_at TIMESTAMP,
    failure_reason TEXT NOT NULL DEFAULT '',
    UNIQUE(scan_job_id, url)
);
```

**New column:**
```sql
ALTER TABLE pages ADD COLUMN raw_html TEXT DEFAULT '';
```

**Location:** Add migration function `_migrate_pages_add_raw_html()` to `crawler/storage.py` (following existing pattern from lines 106-185)

**Implementation:**
```python
def _migrate_pages_add_raw_html(conn: sqlite3.Connection) -> None:
    """Add raw_html column to pages table for offline validation."""
    conn.execute("ALTER TABLE pages ADD COLUMN raw_html TEXT DEFAULT ''")
```

Call from `init_db()` after existing migrations (around line 101).

---

**Part B: Backfill Strategy (75 min, PHASE 1 VALIDATION USES SAMPLES ONLY)**

**Files:** `crawler/scripts/backfill_raw_html.py` (new)

**Pre-Implementation Check (5 min, REQUIRED BEFORE UNIT 5B STARTS):**
Before proceeding, inspect original crawler code to determine rendering strategy:
```bash
grep -r "playwright\|Playwright\|pyppeteer" crawler/ | head -5
grep -r "requests\|urllib" crawler/ | head -5
# Check: does crawler use Playwright for JS rendering, or requests HTTP only?
```

**Decision Based on Rendering Strategy:**
- **If Playwright:** Check if rendered HTML is cached. If cached, skip re-crawl (use cache). If not cached, plan to re-crawl with Playwright in Part B (not plain requests).
- **If requests-only:** Proceed as planned (Unit 5B uses plain requests). Note: JS-heavy sites may have degraded HTML.
- **If mixed:** Determine which strategy applies to your target sites.

**Critical Decision:** Unit 6 (offline validation) requires raw_html to be populated. Two approaches:

**Approach 1 (Recommended):** Backfill from production database
- Download ~22k URLs from existing scan_jobs
- Re-crawl each URL, capture HTML, batch-insert to raw_html column
- Time: 45-60 min (network bound, 10 URLs/sec ≈ 40 min for 22k)
- Resume capability: only process pages WHERE raw_html='' (empty)

**Approach 2 (Alternative):** Backfill from existing HTML cache
- If crawler stores fetched HTML in filesystem or cache, load from there
- Time: 15-20 min (disk I/O)
- Requires existing cache; may not cover all pages

**Chosen Approach:** Approach 1 (re-crawl subset)

**Script:**
```python
# backfill_raw_html.py
# Load pages WHERE raw_html='' from database
# For each page (limit 100 for initial validation):
#   - Fetch URL via requests (with timeout, retries)
#   - Store HTML in raw_html column
#   - Log: url, success/failure, size, fetch_time
# Report: N backfilled, M failed, avg size, total time

# Flags:
#   --limit 100       # Backfill only first 100 pages (for validation)
#   --resume          # Only backfill empty rows (can re-run safely)
#   --output csv      # Log results to CSV
```

**Test scenarios:**
- T5.1: Schema migration applies without error
- T5.2: Old pages have raw_html='' (empty)
- T5.3: Backfill script on 10 test URLs succeeds
- T5.4: Backfill resume mode only processes empty rows

**Critical Definition (P1 Fix):**
- Success = raw_html column populated WITH VALID HTML (≥500 chars + valid HTML markers: <!DOCTYPE, <html>, <head>, or <body>)
- NOT just "HTTP 200 response" (truncated responses must be validated)
- If >20% of backfilled pages have truncated/invalid HTML, abort full backfill and investigate fetch method (plain requests vs. Playwright)

**Gates:**
- Backfill must complete ≥80% of requested URLs **WITH VALID HTML** before proceeding to Unit 6
- If <80% valid: pause, debug failures (network timeout? Truncation?), decide: (a) retry with longer timeout, (b) switch to Playwright for JS rendering, (c) accept partial backfill and proceed with disclaimer
- Validation: Unit 5B script logs success_rate_by_failure_reason (timeout, 404, truncated, parsing_error, etc.)

**Commits:** 
1. `schema(migration): Add raw_html column to pages table` (Part A)
2. `tool(scripts): Add backfill_raw_html script for offline validation` (Part B)

**Test scenarios:**
- T5.1: Migration applies without error
- T5.2: Old pages have raw_html='' (empty)
- T5.3: New pages can write raw_html with fetched HTML
- T5.4: Backfill script resumes on empty rows

---

### Unit 6: Offline Validation — Reclassify Existing Pages (45 min)
**Files:** `crawler/scripts/offline_reclassify.py` (new)

**What:** Script to re-run page type detection on all stored HTML, record old_type → new_type + reason.

**Script behavior:**
1. Query all pages in database (WHERE scan_job_id = ?) with raw_html not empty
2. Validate raw_html integrity (CRITICAL FIX from review):
   - Check minimum length: ≥500 chars (truncated HTML is unreliable)
   - Check valid HTML markers: `<!DOCTYPE` or `<html` or `<head` present
   - Skip pages with invalid/truncated HTML; log reason
3. For each page with valid raw_html:
   - Parse HTML via BeautifulSoup
   - Run `_detect_page_type(raw_html, url, soup)` to get new_type
   - Compare: old_type vs new_type
   - Log: (url, old_type, new_type, detection_reason)
4. Write results to in-memory list
5. Report: N processed, M skipped (invalid), P reclassified, Q unchanged
6. Success gate: (P + Q) / N ≥ 80% (at least 80% of pages had valid HTML for processing)

**NOTE:** Unit 6 performs reclassification only. Extraction validation is Unit 8's responsibility.

**Flags:**
- `--scan-job-id <id>`: Reclassify only one job (for testing)
- `--sample-size <n>`: Limit to first N pages (e.g., 100 for validation)
- `--output <path>`: Write results JSON to path

**Example usage:**
```bash
python crawler/scripts/offline_reclassify.py --scan-job-id 1 --sample-size 100 --output /tmp/reclass_sample.json
```

**Return structure:**
```json
{
  "total": 100,
  "reclassified": 68,
  "unchanged": 32,
  "results": [
    {
      "url": "...",
      "old_type": "other",
      "new_type": "detail",
      "reason": "url_pattern:/detail/",
      "confidence": 0.95
    }
  ]
}
```

**Test scenarios:**
- T6.1: Script runs on test database with 10 pages
- T6.2: Detects reclassifications (other → detail, other → list)
- T6.3: Preserves already-correct pages (detail → detail)
- T6.4: Outputs JSON with correct structure
- T6.5: Sample mode (--sample-size) limits to N pages

**Commits:** 1 commit: `tool(scripts): Add offline_reclassify script for page type validation`

---

### Unit 7: CSV Export & Confidence Filtering (10 min)
**Files:** `crawler/scripts/offline_reclassify.py` (extend from Unit 6)

**What:** Export reclassification results as CSV, with automatic filtering by confidence tier.

**Scope Reduction (Scope-Guardian Review):** CSV export was 20 min as separate unit. Actually 5-10 lines of code. Merge into Unit 6 as optional `--export-csv` flag with inline pandas.to_csv() call.

**Format (CSV with header):**
```
url,old_type,new_type,reason,confidence
https://example.com/detail/123,other,detail,url_pattern:/detail/,0.95
https://example.com/video/456,other,detail,jsonld_entity,0.85
https://example.com/browse,other,list,listing_path,0.90
```

**Columns:**
- `url`: Full URL
- `old_type`: Previous classification (detail, list, tag, other)
- `new_type`: New classification
- `reason`: Detection signal (url_pattern:/detail/, heading_hierarchy, jsonld_entity, etc.)
- `confidence`: Confidence score [0-1]

**Output tiers (Adversarial Review fix — manual review infeasible):**
- Generate 3 CSV files by confidence tier:
  - `tier_high.csv`: confidence ≥ 0.90 (no review needed, auto-accept)
  - `tier_medium.csv`: 0.70-0.90 (spot-check, <200 rows)
  - `tier_low.csv`: < 0.70 (require manual review, pause if >100 rows)

**Example usage:**
```bash
python crawler/scripts/offline_reclassify.py \
  --scan-job-id 1 \
  --export-csv /tmp/reclassifications \
  --limit 500
```

Output: `/tmp/reclassifications_tier_high.csv`, `/tmp/reclassifications_tier_medium.csv`, `/tmp/reclassifications_tier_low.csv`

**Test scenarios:**
- T7.1: CSV exports with correct header
- T7.2: All reclassified pages distributed to correct tier
- T7.3: Confidence scores are numeric [0-1]
- T7.4: High-confidence tier is largest; low-confidence tier is smallest

**Commits:** (Merged into Unit 6 — no separate commit)

---

### Unit 8: Extraction Validation Sampling — Stratified (45 min)
**Files:** `crawler/scripts/validate_extraction.py` (new)

**What:** Sample reclassified pages with stratification, run extraction logic, verify ≥80% yield resources AND track false positives.

**Critical Issues Fixed (from review):**
- Uniform sampling may miss hard cases; use stratified sampling by page_type + detection_signal
- Need false positive gate: prevent detail→list misclassifications that hide resources
- Sample size 100 may be excessive; use 50 with stratification (confidence interval ~±7%)

**Extraction Success Definition (P1 Fix):**
- **Detail extraction success:** Resource with non-empty title AND non-empty url (both required)
- **List extraction success:** ≥1 Resource, each with non-empty title AND non-empty url
- **Extraction failure:** Exception (timeout, parse error, etc.) OR resource with empty title/url

**Script behavior:**
1. Load reclassifications from Unit 6 output
2. Stratified sampling: bucket by (new_type, detection_signal):
   - 15 pages: new_type='detail', detection_signal='url_pattern'
   - 15 pages: new_type='detail', detection_signal='heading_hierarchy'
   - 10 pages: new_type='detail', detection_signal='jsonld'
   - 10 pages: new_type='list', detection_signal='url_pattern'
   - Totals: ~50 pages (not 100); increase to 75-80 if results are marginal (75-85% success rate)
3. For each sampled page:
   - Retrieve raw_html from database
   - Run `_extract_detail_resource()` or `_extract_list_resources()` based on new_type
   - Evaluate success by definition above
   - Catch exceptions (timeout, parsing error, etc.) and log: extraction_error_reason
4. Calculate metrics:
   - extraction_success_rate = (successful extractions) / (sample_size) [gate: ≥80%]
   - extraction_success_by_stratum = success rate per (new_type, detection_signal) pair [gate: all strata ≥70%]
   - false_positive_rate = (detail→list reclassifications where extraction failed) / (total detail→list) [gate: <5%]
   - Per-signal FP breakdown = how many FPs came from Unit 2 (listing_path) vs Unit 4 (heading_hierarchy)
4. Calculate metrics:
   - extraction_success_rate = successful_extractions / sample_size (gate: ≥80%)
   - false_positive_rate = pages reclassified FROM detail→list / total_reclass (gate: <5%)
5. Report: pass if success_rate ≥ 80% AND false_positive_rate < 5%, fail otherwise

**Flags:**
- `--sample-size <n>`: Default 50 (with stratification)
- `--scan-job-id <id>`: Which scan job to validate
- `--output <path>`: Write results JSON

**Return structure:**
```json
{
  "stratified_sample": {
    "detail_url_pattern": {"total": 15, "successful": 13},
    "detail_heading": {"total": 15, "successful": 11},
    "detail_jsonld": {"total": 10, "successful": 8},
    "list_url_pattern": {"total": 10, "successful": 9}
  },
  "sample_size": 50,
  "successful": 41,
  "failed": 9,
  "success_rate": 0.82,
  "false_positive_rate": 0.03,
  "pass": true,
  "failures": [
    {
      "url": "...",
      "new_type": "detail",
      "detection_signal": "heading_hierarchy",
      "extraction_error": "no_title_extracted",
      "reason": "page has no <h1> or <title>"
    }
  ]
}
```

**Success gates:** 
1. success_rate ≥ 80% (extraction works on reclassified pages)
2. false_positive_rate < 5% (don't hide detail resources by reclassifying to list)
3. All strata have ≥70% success (no detection signal is consistently failing)

**Test scenarios:**
- T8.1: Stratified sample runs correctly on 50 test pages
- T8.2: Calculate success rate correctly per stratum
- T8.3: Report extraction failures with detection_signal breakdown
- T8.4: Pass gate when ≥80% successful AND <5% false positive
- T8.5: Fail gate when <80% successful OR >5% false positive (requires debug/iteration)

**Commits:** 1 commit: `tool(scripts): Add stratified extraction validation sampling`

---

### Unit 9: Gate Validation Tests (20 min)
**Files:** `tests/test_page_detection_improved.py` (new)

**Scope Reduction (Scope-Guardian Review):** Changed from "comprehensive 100% line coverage" to focused gate validation. This plan is about validation, not feature shipping. Tests should verify gates pass, not coverage metrics.

**What:** Integration tests that validate the three success gates:
1. Unit 1-2: Syntax fix + regex patterns work
2. Unit 3.5: Threshold discovery succeeds
3. Unit 6: Offline reclassification achieves ≥70%
4. Unit 8: Extraction validation achieves ≥80%

**Test file structure:**

```python
# Gate 1: Syntax fix + regex
def test_detail_patterns_fixed():
    """Verify /story/, /item/, /view/ are recognized."""
    assert _detect_page_type(...with /item/...) == "detail"
    
def test_listing_regex_safe_boundaries():
    """Verify /browse/item/123 stays detail, not list."""
    assert _detect_page_type(...url=/browse/item/123...) == "detail"

# Gate 2: Threshold discovery
def test_threshold_discovery_script():
    """Threshold discovery runs on 20 test pages, outputs F1 scores."""
    result = run_threshold_discovery(sample_size=20)
    assert result['best_f1'] >= 0.70
    assert result['precision'] >= 0.70

# Gate 3: Offline reclassification
def test_offline_reclassify_sample():
    """Offline validation on 20 test pages with raw_html."""
    result = offline_reclassify(sample_size=20)
    assert result['processed'] >= 16  # 80% of pages had valid HTML
    assert result['reclassified'] >= 14  # ≥70% of 20

# Gate 4: Extraction validation
def test_extraction_validation_stratified():
    """Extraction validation on stratified 20-sample achieves ≥80%."""
    result = validate_extraction(sample_size=20)
    assert result['success_rate'] >= 0.80
    assert result['false_positive_rate'] < 0.05

# Integration: All gates pass
def test_full_validation_pipeline():
    """End-to-end: syntax → thresholds → reclassification → extraction."""
    assert test_detail_patterns_fixed()
    assert test_threshold_discovery_script()
    assert test_offline_reclassify_sample()
    assert test_extraction_validation_stratified()
```

**Coverage targets:**
- Focus on gate validation (3 success metrics must pass)
- Verify each unit's test scenarios (T1.1-T9.5)
- No line-coverage metrics; focus on behavior coverage

**Test data:**
- Use 20-50 real 'other' pages from production (pre-selected with raw_html)
- Include edge cases: no h1, many h2, malformed HTML, extraction failures

**Commits:** 1 commit: `test(detection): Gate validation tests for page type detection improvements`

---

### Unit 10: Documentation & Finalization (30 min)
**Files:** 
- `docs/DETECTION_IMPROVED.md` (new)
- `crawler/parser.py` docstrings
- CHANGELOG

**What:** Document improvements, rationale, and validation results.

**docs/DETECTION_IMPROVED.md structure:**
- Overview: what was wrong (90% misclassification)
- Solution: URL patterns first, heading heuristics, offline validation
- Results: reclassification stats (70%+), extraction success (80%+)
- Detection order (ASCII diagram)
- Examples: before/after on real URLs
- Validation results: 100 sampled pages, extraction success rates

**Docstring updates:**
- Update `_detect_page_type()` docstring with new priority order
- Add `_heading_hierarchy_signal()` full docstring
- Document detection signals and confidence levels

**CHANGELOG entry:**
```
## [0.X.0] - 2026-04-20

### Fixed
- Fixed syntax error in detail_patterns list (missing quote after /story/)
- Improved page type detection from 10% to 70%+ accuracy (90% miscl. issue)

### Added
- URL pattern prioritization in page type detection
- Heading hierarchy heuristic for fallback classification
- raw_html column for offline validation
- Offline reclassification script with CSV audit trail
- Extraction validation sampling script

### Changed
- Reordered page type detection to check URL patterns before JSON-LD
- Enhanced listing path regex with /browse/, /index/, /feed/
```

**Test scenarios:**
- T10.1: docs/DETECTION_IMPROVED.md readable and complete
- T10.2: Docstrings present and accurate
- T10.3: CHANGELOG updated

**Commits:** 1 commit: `docs(detection): Document improvements and validation results`

---

## System-Wide Impact

| Component | Impact | Mitigation |
|-----------|--------|-----------|
| **Database** | +1 column (raw_html), ~50-100MB storage for ~22k pages | Backfill during re-crawl, compress if needed |
| **Parser module** | Line reordering, new heading heuristic function | Fully backward compatible, all existing tests pass |
| **Extraction paths** | No changes to extraction logic (only tested on reclassified pages) | Validation sampling gates against bad classifications |
| **Storage writes** | Writers now populate raw_html when crawling | Default '' for existing rows, gradual backfill |
| **Scripts** | New offline_reclassify.py, validate_extraction.py | Standalone, no integration required yet |
| **Performance** | Heading heuristic adds ~1-2ms per page (DOM scanning) | Minimal, runs only when other signals fail |

---

## Success Metrics & Acceptance Criteria (REVISED — P1 CLARIFICATION)

**CRITICAL ASSUMPTION (must validate before Unit 4 execution):**
This plan assumes: correct page type → resources exist on the page. However, some pages may be correctly identified as "detail" but have zero extractable content (JS rendering, sparse HTML, content removal). Unit 8 will catch extraction failures, but pre-validation confirms this assumption.

**Pre-Unit-4 Validation Gate (5 min, BLOCKS downstream if fails):**
Before implementing Unit 4 (heading heuristic), manually inspect 20 of the 90% 'other' pages:
- For each page, check: does it have extractable content (title, URL, or metadata)? Count pages with extractable content.
- **Pass gate if:** ≥15 of 20 pages (≥75%) have extractable content
- **Fail gate if:** <15 of 20 pages have extractable content → escalate. Options: (a) continue with reduced success target (60% reclassification), (b) defer detection fix to Phase 2, (c) investigate content audit

This prevents optimizing page type detection on pages with no resources to extract.

**Primary Goals (Decision 3) — Authoritative (assumes above gate passes):**
- ✅ **Gate 1 (Reclassification):** ≥70% of current 'other' pages reclassified to detail/list (offline validation, measured as: reclassified_count / valid_pages_processed)
- ✅ **Gate 2 (Extraction Success):** ≥80% of reclassified pages extract ≥1 resource (extraction validation on stratified 50-sample)
- ✅ **Gate 3 (False Positives):** <5% false positive rate (detail→list misclassifications hiding resources)

**Related Metrics (Not Primary Gates):**
- Unit 5B: ≥80% of requested URLs backfilled with **valid raw_html** (≥500 chars + HTML markers) — *Prerequisite for Unit 6, not reclassification success rate*
- Unit 3 Investigation: Outcome A/B/C determines downstream sequencing (not a success metric)

**Validation Gates (In Sequence) — Precise Denominators (P1 FIX #2):**

**DENOMINATORS CLARIFIED:**
- **Gate 1 (Reclassification):** ≥70% measured as: `reclassified_pages / pages_with_valid_html`
  - Numerator: pages reclassified from "other" to detail/list
  - Denominator: pages with valid raw_html (≥500 chars + HTML markers), i.e., Unit 6 processed pages (not all requested)
  - Example: 1000 'other' pages requested → 800 with valid HTML → 560 reclassified = 560/800 = 70% ✓

1. **Unit 3 Investigation:** If listing-before-JSON-LD order is already correct, skip Unit 3 reordering task (reduce path by 15 min). Outcomes A/B determine Unit 3.5 path.
2. **Unit 3.5 Threshold Discovery:** Threshold set has ≥70% precision on real 'other' pages
3. **Unit 5 Backfill (Phase 2):** ≥80% of requested URLs backfilled with valid raw_html (≥500 chars, valid HTML markers) [Phase 2 gate, not Phase 1]
4. **Unit 6 Offline Reclassification:** ≥70% of valid_pages_processed reclassified to detail/list (Gate 1 primary metric); false_positive_rate <5%
5. **Unit 8 Extraction Validation (Stratified):** ≥80% extraction success across all strata (Gate 2 primary metric) + false_positive_rate <5% (Gate 3)
6. **Unit 9 Gate Tests:** All 4 gate tests pass; if any fail, pause and debug

**Failure Recovery & Escalation (P1 Fix):**
- **Iteration Budget:** 4 hours maximum for all recovery/debugging combined
- **If Unit 3 investigation returns Outcome C (inconclusive):** ESCALATE to stakeholder immediately; blocks all units until resolved
- **If Unit 3.5 precision < 70%:** Adjust threshold candidates, re-run with larger sample (cost: +30-45 min). If second run still <70%, escalate for alternate approach
- **If Unit 5B backfill < 80% valid HTML:** (a) Retry with longer timeout on failed URLs (+variable time), OR (b) Switch to Playwright for JS rendering (+75 min), OR (c) Accept partial backfill <80% and proceed with disclaimer. Pick option before exceeding 1 hour investigation.
- **If Unit 6 reclassification < 70%:** Analyze via confidence tiers (unit 7 breakdown). If majority of failures are from Unit 4 (heading_heuristic), re-run Unit 3.5 with adjusted thresholds (cost: +30 min). If majority from Unit 2 (regex), revert regex and accept lower reclassification target.
- **If Unit 8 extraction < 80%:** Check stratum-specific failures via report. If all strata fail equally (~70-75%), extraction logic itself is the problem (separate Phase 2 plan). If one stratum fails <70%, debug Unit 2 or Unit 4 for that signal type.
- **If Unit 8 false positives > 5%:** FP breakdown report shows per-signal rate. If all FPs from Unit 2 (listing_path), tighten regex ([regex revision: add more specific boundary checks]. If from Unit 4 (heading_hierarchy), adjust thresholds (cost: +30 min).
- **Escalation Trigger:** Total debugging time >4 hours without resolution → STOP and escalate to stakeholder. Options: (a) pivot to alternative approach (ML, rule engine), (b) defer to Phase 2, (c) accept lower success targets (60% reclassification + 75% extraction)

**Non-Goals (Scope Boundaries):**
- Do NOT re-extract on already-correct detail pages
- Do NOT introduce ML or external APIs
- Do NOT modify extraction logic itself (Unit 8 gates extraction on reclassified pages, doesn't debug extractor bugs)

---

## Dependencies & Sequencing (P1 CRITICAL FIX)

**Unit 3 Investigation Outcomes & Branching:**

Unit 3 has 3 possible outcomes that determine the rest of the critical path:

- **Outcome A (Likely, ~70%):** Root cause is missing keywords in Unit 2 regex OR wrong thresholds in Unit 4 → SKIP formal Unit 3 reordering, proceed directly to Unit 3.5
- **Outcome B (Unlikely, ~20%):** Code order is the problem (JSON-LD checked before listing URL) → KEEP Unit 3 reordering as formal unit
- **Outcome C (Risk, ~10%):** Root cause inconclusive or external → ESCALATE to stakeholder; blocks all downstream units until resolved

**Dependency Table (Dynamic Based on Unit 3 Outcome):**

| Unit | Depends On | Outcome A Path | Outcome B Path |
|------|-----------|-----------------|-----------------|
| 1 (Syntax fix) | None | Parallel to 2, 3 | Parallel to 2, 3 |
| 2 (Listing regex) | None | Parallel to 1, 3 | Parallel to 1, 3 |
| 3 (Investigation) | 1, 2 outputs | **→ SKIP** (save 15 min) | **→ KEEP** (add 15 min) |
| 3.5 (Thresholds) | None | Parallel to 1-2 if Unit 3 skipped | Sequential after Unit 3 |
| 4 (Heading) | 3.5 | Follows 3.5 | Follows 3.5 (after Unit 3) |
| 5A (Schema) | None | Parallel to 3-4 | Parallel to 3-4 |
| 5B (Backfill) | 5A | Parallel to 3-4 (async) | Parallel to 3-4 (async) |
| 6 (Validation) | Unit 3 outcome + 4, 5B | After 4, during 5B | After Unit 3 + 4 |
| 7 (CSV) | 6 (inline) | Merged into 6 | Merged into 6 |
| 8 (Extraction) | 6 | After 6 | After 6 |
| 9 (Tests) | 1, 2, 3.5, 4, 6, 8 | All must complete | All must complete |
| 10 (Docs) | 9 | Parallel to 9 | Parallel to 9 |

**Critical Path Calculation:**

**Outcome A (Likely):**
- Parallel group: 1 (5min) + 2 (15min) + 3 (15min) = max 15min
- Sequential: 3.5 (45min) → 4 (30min) → 6 (45min) → 8 (45min) = 165min
- Parallel: 5A (15min) + 5B (90min) = 90min (can run alongside 3-4)
- Effort total: ~12 hours sequential
- **Wall-clock with parallelization: ~3.5-4 hours** (Units 5B runs async while 3.5-4-6-8 proceed)

**Outcome B (Unlikely):**
- Parallel group: 1 + 2 + 3 = max 15min
- Then: 3 (15min) → 3.5 (45min) → 4 (30min) → 6 (45min) → 8 (45min) = 180min sequential
- Parallel: 5A + 5B = 90min (async)
- Effort total: ~14 hours sequential
- **Wall-clock with parallelization: ~4-4.5 hours**

**Outcome C (Risk):**
- BLOCKS all downstream units until resolved
- Escalation decision required before proceeding

**Parallelizable groups:**
- Group A: Units 1, 2 (syntax + regex) — independent
- Group B: Unit 5 (schema migration) — independent
- Group C: Units 6-8 (validation scripts) — sequential but after 3-4

---

## Risks & Mitigation (REVISED)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Unit 3.5 thresholds are still suboptimal** | P1 | Threshold discovery runs on 50-100 pages; if precision <70%, iterate with adjusted candidates. Configurable thresholds in Unit 4 allow tuning post-launch. |
| **raw_html backfill takes >2 hours** | P1 | Backfill script supports resume mode (only process empty rows). Run on sample 100 pages first (45 min), full run async. |
| **Heading heuristic adds latency** | P2 | Runs only when other signals fail (~5-10% of pages in practice). Benchmark in Unit 9; optimize via early-exit if p95 > 5ms. |
| **Database growth (50-100MB)** | P2 | Store in raw_html TEXT column; if bloated, compress with gzip. Can be purged post-validation. |
| **Old tests break due to reordering (Unit 3)** | P1 | Unit 3 is now investigation-first: verify root cause before reordering code. Audit existing tests before changes. |
| **Reclassification has false positives (detail→list)** | P0 | Unit 2 regex uses negative lookahead to prevent detail URLs matching list pattern. Unit 8 explicitly gates false_positive_rate <5%. |
| **Extraction validation samples don't represent full population** | P1 | Unit 8 uses stratified sampling by page_type + detection_signal (not uniform random). Checks all strata independently. |
| **Manual CSV review is infeasible (5000+ rows)** | P2 | Unit 7 filters by confidence tier; low-confidence (<70%) tier requires review only if >100 rows (pause and debug). Auto-accept high-confidence (≥90%) tier. |
| **Extraction failures are pre-existing, not detection bugs** | P2 | Unit 8 tracks extraction_error reason; if all failures are parsing errors (not classification), flags as extractor issue, not detection issue. Separate follow-up plan. |

---

## Open Questions (Resolved or Deferred)

### Resolved During Planning Refinement ✅

1. **[Technical] Exact heading hierarchy thresholds** → RESOLVED: Unit 3.5 (Threshold Discovery) runs empirically on 50-100 'other' pages, computes F1 scores for candidate thresholds, selects set with ≥70% precision before Unit 4 implementation.

2. **[Technical] Heading heuristic integration point** → RESOLVED: Unit 4 specifies exact placement (lines 1113-1115), calls `_heading_hierarchy_signal()` as last heuristic before "other" fallback.

3. **[Architecture] raw_html backfill strategy** → RESOLVED: Unit 5 Part B implements backfill script with resume mode (only processes empty rows), 80% success gate before proceeding to validation.

4. **[Technical] raw_html integrity validation** → RESOLVED: Unit 6 now checks minimum length (≥500 chars) and valid HTML markers (<!DOCTYPE or <html>) before processing; skips truncated pages with reason logged.

5. **[Architecture] Stratified sampling for extraction validation** → RESOLVED: Unit 8 uses stratified sampling by page_type + detection_signal (50 pages, not uniform 100), tracks success per stratum, gates on both extraction_success (≥80%) and false_positive_rate (<5%).

### Deferred to Implementation (Open, But Supported By Gates)

1. **[Performance]** raw_html storage size and compression needs (Answer: benchmark during Unit 5B backfill; if avg >5MB/page, add gzip compression)

2. **[Debugging]** If extraction validation fails (<80%), is it a reclassification bug or extraction logic bug? (Answer: Unit 8 tracks extraction_error reason; if parsing errors dominate, flags as extractor issue; separate follow-up plan)

3. **[Process]** If Unit 6 shows <70% reclassification, what adjustment to Unit 4 thresholds? (Answer: Supported by failure recovery path; iterate with Unit 3.5 to adjust thresholds, re-run Unit 6)

---

## Implementation Phases (Scope Clarification — P1 Fix)

This plan has **two distinct phases** with different scopes and approval gates:

### **PHASE 1: VALIDATION (Units 1-4, 6, 8, 9) — ~8 hours**
**Goal:** Prove that 70% reclassification + 80% extraction success is achievable on samples

**Units:**
- Unit 1: Syntax fix (5 min)
- Unit 2: Regex enhancement (15 min)
- Unit 3: Root cause diagnosis (15 min) — outcomes A/B/C determine path
- Unit 3.5: Threshold discovery (45 min)
- Unit 4: Heading heuristic (30 min)
- Unit 6: Offline reclassification on samples (~100 pages) (45 min)
- Unit 8: Extraction validation sampling (45 min)
- Unit 9: Gate validation tests (20 min)

**Success Criteria:**
- Unit 6: ≥70% of 100 sample pages reclassified to detail/list
- Unit 8: ≥80% extraction success on stratified 50-page sample
- Unit 8: <5% false positive rate
- All gate tests pass (Unit 9)

**Output:** CSV audit trail (reclassifications) + test results proving the fix works

**Approval Decision:** "Proceed to Phase 2" if all validation gates pass

---

### **PHASE 2: DEPLOYMENT (Units 5A+5B, 7, 10, Production Rollout) — ~4-5 hours**
**Goal:** Ship validated detection improvements to production. Moves Unit 5A (schema migration) from Phase 1 to Phase 2 for data safety (no schema changes until validation succeeds).

**Units:**
- Unit 5A: Schema migration (15 min) — production database only
- Unit 5B (full): Complete raw_html backfill for all ~22k pages (75 min)
- Unit 7: Confidence-tier CSV filtering + manual review gates (10 min)
- Unit 10: Documentation, CHANGELOG, deployment checklist (30 min)
- Production deployment: Blue-green rollout, monitoring setup, rollback plan (1.5-2 hours) ← adjusted from 1-2h

**Production Deployment Gate (REQUIRED — P1 FIX):**
"Deploy to production" is approved ONLY if:
1. ✅ Phase 1 validation gates all pass (70% reclassification, 80% extraction, <5% false positives)
2. ✅ Unit 5B full backfill completes (≥95% of 22k pages have valid raw_html)
3. ✅ Unit 7 confidence tiers reviewed: tier-low <100 rows OR manual review completed
4. ✅ Stakeholder (Product/Engineering) signed off on production schedule
5. ✅ Rollback plan documented: (a) revert detection thresholds, (b) restore previous page_type values, (c) rollback timeline <30 min

**Deployment Strategy:**
- Blue-green: Deploy detection changes to canary set (10% of scan jobs) for 24 hours
- Monitor: Track reclassification_rate, extraction_success_rate, false_positive_rate every hour
- If canary metrics pass: roll out to 100% over 2 hours
- If canary metrics degrade (extraction <75%, false_positives >8%): rollback immediately

**Success Criteria (Phase 2):**
- Full backfill completes
- Canary deployment succeeds (metrics stable for 24 hours)
- Production rollout completes (100% adoption over 2 hours)

**Approval Decision:** "Deploy to production" only after Phase 1 passes AND Phase 2 gates met (see above 5 requirements)

**Note:** Phase 2 execution assumes Phase 1 validation gates passed. If Phase 1 fails (reclassification <70%), Phase 2 is deferred pending root-cause fixes.

---

## Next Steps

✅ **Phase 1 approval**: Review Units 1-4, 6, 8, 9; confirm sequencing and dependencies
✅ **Phase 1 execution**: Run validation pipeline (~8 hours)
✅ **Phase 1 gate review**: Verify 70% reclassification + 80% extraction + <5% false positives
→ **Decision checkpoint**: If Phase 1 gates pass, proceed to Phase 2. Otherwise, debug and iterate.
✅ **Phase 2 execution** (conditional): Backfill all 22k pages, confidence filtering, documentation
✅ **Phase 2 deployment** (conditional): Production rollout with monitoring

---

## Appendix A: ASCII Detection Flow Diagram

```
_detect_page_type(html, url, soup)
│
├─ 1. Tag detection (/tag/, /tags/)
│  └─ RETURN "tag"
│
├─ 2. Detail URL patterns (/detail/, /item/, /view/, /watch/, /video/, /article/, /post/)
│  └─ RETURN "detail"
│
├─ 3. Listing URL + thumbnails (is_listing_path + cards ≥ 6)
│  └─ RETURN "list"
│
├─ 4. JSON-LD detail entity (VideoObject, Article, NewsArticle, BlogPosting)
│  └─ RETURN "detail"
│
├─ 5. Strong list signal (cards ≥ 12)
│  └─ RETURN "list"
│
├─ 6. HTML structure (article + main + h1 heuristics)
│  ├─ <article> + has_numeric_id → RETURN "detail"
│  ├─ <h1> + og:title → RETURN "detail"
│  └─ <article> + <h1> → RETURN "detail"
│
├─ 7. Moderate list signals (articles > 3 OR cards > 3)
│  └─ RETURN "list"
│
├─ 8. Heading hierarchy heuristic (NEW in Unit 4)
│  ├─ single h1 + h2≤3 + body > 500 → RETURN "detail"
│  ├─ h2 > 8 OR multiple h1 → RETURN "list"
│  └─ h1=0 + h2 > 5 → RETURN "list"
│
└─ 9. Fallback
   └─ RETURN "other"
```

---

## Appendix B: Test Data References

**Real URLs from production (for manual sampling):**
- `/video/detail/123` → should be detail (currently other)
- `/av/updates/` → should be list (currently other)
- `/browse/all` → should be list (currently other)
- `/category/fiction` → should be list (may be correct)
- `/detail/456` → should be detail (likely correct)

**Mock HTML snippets for Unit 9 tests:**
- Single h1 + 2 h2 + 800 char body (detail_case)
- No h1 + 10 h2 titles + 8 div.card (list_case)
- Multiple articles + <main> tag (structure_case)
