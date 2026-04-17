---
date: 2026-04-17
status: completed
type: feat
topic: parser-data-precision
---

# Plan: Parser Data Precision Pass (Metrics + Cover + Date)

## Problem Frame

`crawler/parser.py` currently mis-attributes three high-value fields:

- **Metrics** (`views` / `likes` / `hearts`) — `_extract_number_near_keyword` walks the **whole document**, not the article container. A "1234" in a sidebar widget gets attributed to the article. K/M/B and CJK 万/千/亿 suffixes are dropped silently (`12.3K views` → 12). Years (2010, 2025) and ID numbers near the keyword get picked.
- **Cover image** — `_extract_detail_resource` takes `container.find("img")` — the **first** image in the article, which is often a tracking pixel, social-share icon, or decorative element. `data-src` lazy-loading is handled in list cards but **not** in detail pages.
- **Published date** — fallback regex `\d{4}[-/]\d{2}[-/]\d{2}` runs over the **entire `soup.get_text()`** — copyright dates ("© 2010", "founded 2008") and arbitrary date strings in the page body get returned. CJK formats (`2025年3月15日`) are not recognized.

These are silent precision bugs: the page parses, a row gets written, but the data is wrong. They show up as bogus tag/category rankings downstream because `analysis.py` sorts by these metrics.

## Scope Boundaries

- ❌ No schema / migration / `Resource` model changes — same fields, better values
- ❌ No tag-extraction changes — `_score_tag_candidate` already shipped
- ❌ No new dependencies (no dateutil, no PIL, no chardet beyond what requests pulls)
- ❌ No per-domain profile registry / DSL — keep it heuristic
- ❌ No analysis.py changes — precision improvements upstream propagate naturally
- ❌ No detail-vs-list page-type detection changes — orthogonal

## Requirements Trace

Maps back to the 6-finding precision audit (residuals from the prior ce:review session):

- **R1 (A)** Metric extraction must scope to a caller-supplied container, recognize K/M/B/万/千/亿 multipliers, and reject obvious non-metrics (4-digit years near "©" / footer context).
- **R2 (A)** When detail page has no clear container, fall back to `<body>` (not `<html>`) so head-tag noise is excluded.
- **R3 (B)** Cover image picker must prefer (in priority): `og:image` → largest qualifying `<img>` in container → `<meta name="twitter:image">` → empty.
- **R4 (B)** "Qualifying" = not a `data:` URI; not a URL matching `/(logo|icon|avatar|pixel|blank|spacer)/i`; not declared smaller than 50×50 by `width`/`height` attrs.
- **R5 (B)** Lazy-load attrs read in priority order: `data-src` → `data-lazy-src` → `data-original` → `srcset` (largest declared) → `src`.
- **R6 (C)** Date extraction order: `<time datetime>` inside container → `<meta property="article:published_time">` → `<time datetime>` anywhere → CJK / ISO regex **inside container only**.
- **R7 (C)** Recognized formats: ISO `YYYY-MM-DD[THH:MM:SS...]`, slash `YYYY/M/D`, hyphen `YYYY-M-D`, CJK `YYYY年M月D日`. Output normalized to `YYYY-MM-DD` (drop time component for consistency with current behavior).
- **R8 (general)** Both detail and list extraction paths use the same helper functions — no drift.
- **R9 (general)** Existing 378 tests pass with zero regressions.

## High-Level Technical Design

Three new private helpers in `parser.py` (no public API change):

```
_extract_metric(scope, keywords) -> int
    ├─ walks `scope.find_all(string=re.compile(kw))` (already does)
    ├─ on match, scans the parent's text + adjacent siblings for a number
    │   pattern that supports decimal (12.3) and thousand-separators (1,234)
    ├─ checks for trailing multiplier suffix (K/M/B/万/千/亿)
    └─ rejects 4-digit values when the keyword context contains "©"/"copyright"

_pick_cover_image(soup, container, base_url) -> str
    ├─ try og:image (existing)
    ├─ try twitter:image meta
    ├─ if container: collect <img> qualifying candidates
    │   ├─ resolve src priority list (data-src → data-lazy → ... → src)
    │   ├─ skip data: URIs and icon/logo/avatar URL patterns
    │   ├─ skip W,H both < 50 if attrs present
    │   └─ pick largest by W*H attr (or first if no W/H)
    └─ urljoin against base_url

_extract_published_date(soup, container) -> str
    ├─ container <time datetime>
    ├─ <meta property="article:published_time">
    ├─ soup-level <time datetime> (fallback)
    ├─ regex over container.get_text() only:
    │   ├─ ISO  YYYY-MM-DD(?:T...)?  (truncate to date)
    │   ├─ slash YYYY/M/D
    │   ├─ hyphen YYYY-M-D
    │   └─ CJK   YYYY年M月D日
    └─ normalize to "YYYY-MM-DD" (zero-pad month/day)
```

Call sites in `_extract_detail_resource` and `_extract_list_resources` collapse to one-liners using these helpers, eliminating the existing duplication where list cards inline different cover logic.

## Implementation Units

### Unit 1 — Metric extraction precision (R1, R2)

**Goal:** Scope metrics to the container, recognize multiplier suffixes, reject year-noise.

**Files:**
- `crawler/parser.py` — replace `_extract_number_near_keyword` body with new logic. Keep the function name & signature so list-card call sites don't churn.
- `tests/test_parser.py` — new `TestMetricExtraction` class.

**Approach:**
1. Rename current function to `_extract_metric(scope, keywords)` — signature unchanged.
2. Number regex with optional decimal + comma group: `r"(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)"`.
3. Multiplier table: `{"k": 1_000, "m": 1_000_000, "b": 1_000_000_000, "万": 10_000, "千": 1_000, "亿": 100_000_000}`.
4. After number match, look ahead 1–2 chars for a multiplier (case-insensitive); apply if present.
5. Year guard: if matched value is in `1900..2099` AND parent-text contains `©|copyright|since|founded|版权|创建于`, skip and try next match.
6. Update `_extract_detail_resource` to pass `container or soup.body or soup` instead of just `soup` — narrows scope when container exists.

**Patterns to follow:**
- `_score_tag_candidate` (parser.py:53) — same shape: regex tables at module scope, single-pass scoring.
- `_extract_number_near_keyword` (existing) — preserve sibling-traversal logic for cases where the keyword and number are in adjacent elements.

**Test scenarios** (TestMetricExtraction):
- Happy: `<span>views 1,234</span>` → 1234
- Decimal + K suffix: `<span>views 12.3K</span>` → 12300
- M / B suffix: `1.5M views` → 1_500_000; `2B` → 2_000_000_000
- CJK 万: `浏览 1.2万` → 12000; `点赞 3千` → 3000; `5.5亿` → 550_000_000
- Year guard: `<footer>© 2010</footer>` near `views` keyword → 0 (not 2010)
- Scoping: container has no metric, sidebar has `views 9999` → returns 0
- Sibling fallback: `<span>views</span><span>42</span>` → 42
- Missing keyword: empty container → 0
- Multiple candidates: returns first valid one (preserve current behavior)

**Verification:**
- `pytest tests/test_parser.py -k Metric` → green
- Existing `test_views`, `test_likes`, `test_hearts` (TestDetailPage) still pass
- Manual inspect: re-run a known scan and check views/likes columns no longer contain years

---

### Unit 2 — Cover image picker (R3, R4, R5)

**Goal:** Pick a real cover image, not the first decorative `<img>`.

**Files:**
- `crawler/parser.py` — add `_pick_cover_image(soup, container, base_url)` helper. Refactor both `_extract_detail_resource` and `_extract_list_resources` to use it.
- `tests/test_parser.py` — new `TestCoverImagePicker` class.

**Approach:**
1. Constants:
   - `_LAZY_SRC_ATTRS = ("data-src", "data-lazy-src", "data-original", "src")`
   - `_ICON_URL_RE = re.compile(r"/(logo|icon|avatar|pixel|blank|spacer|placeholder)\b", re.I)`
   - `_MIN_COVER_DIMENSION = 50`
2. `_resolve_img_src(img)`: walk lazy attrs in order; if `srcset` present, pick the largest declared (`Nw` token). Returns `""` if none.
3. `_qualifies(img, src)`: rejects `data:` URI, `_ICON_URL_RE` match, declared W/H both < min.
4. `_pick_cover_image`:
   - Try `og:image` from soup head; if present and not a data URI, return it.
   - Try `twitter:image` meta; same check.
   - If container: collect qualifying `<img>` with their resolved src; sort by declared `W*H` (default 0 if missing); return largest's src urljoined.
   - Return `""` if nothing qualifies.

**Patterns to follow:**
- `_extract_meta` (parser.py:149) for og:image / twitter:image meta lookup.
- `_pick_main_container` (parser.py:248) — same single-helper shape, defensive `None` returns.

**Test scenarios** (TestCoverImagePicker):
- Happy: container with one normal `<img src>` → returns absolute URL
- og:image wins over container img: meta + img → og:image
- og:image with `data:` URI → skipped, falls through to container img
- Lazy load: `<img data-src="real.jpg" src="placeholder.gif">` → real.jpg
- Lazy load chain: `<img data-original="x.jpg" data-src="y.jpg">` → y.jpg (data-src has higher priority)
- srcset: `srcset="small.jpg 320w, medium.jpg 640w, large.jpg 1024w"` → large.jpg
- Icon filter: `<img src="/static/logo.png">` → skipped
- Icon filter: `<img src="/avatar/u123.png">` → skipped
- Tiny image: `<img src="x.jpg" width="32" height="32">` → skipped (assuming next img qualifies)
- All images skipped → empty string
- twitter:image fallback: no og:image, twitter:image present → twitter:image
- List card path uses same helper: `_extract_list_resources` test for lazy-load
- No container, no og:image → empty string (safe default)

**Verification:**
- `pytest tests/test_parser.py -k Cover` → green
- Existing `test_cover_url` (TestDetailPage) and `test_resource_covers` (TestListPage) still pass
- Manual: scan a site with lazy-loaded covers, confirm `cover_url` column populated correctly

---

### Unit 3 — Published date precision (R6, R7)

**Goal:** Stop attributing copyright years; recognize CJK date formats.

**Files:**
- `crawler/parser.py` — add `_extract_published_date(soup, container)` helper. Refactor `_extract_detail_resource` to call it.
- `tests/test_parser.py` — new `TestPublishedDate` class.

**Approach:**
1. Date regex bundle (compiled once at module scope):
   - `_DATE_ISO_RE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})(?:T[\d:.+\-Z]*)?\b")`
   - `_DATE_SLASH_RE = re.compile(r"\b(\d{4})/(\d{1,2})/(\d{1,2})\b")`
   - `_DATE_CJK_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?")`
2. Resolution order:
   1. `container.find("time", attrs={"datetime": True})` if container — return its `datetime` attr (truncated to date).
   2. `_extract_meta(soup, "article:published_time")`.
   3. `soup.find("time", attrs={"datetime": True})` — anywhere as last structured signal.
   4. Regex over `container.get_text()` only (NOT `soup.get_text()`); try ISO, slash, CJK in order; first match wins.
3. Normalizer: parse `(year, month, day)` tuple, validate ranges (year 1990..2099, month 1..12, day 1..31), format as `f"{y:04d}-{m:02d}-{d:02d}"`. Invalid combinations → empty string.
4. Range guard catches "© 2010" because the regex requires a full date triple — bare years don't match. Bonus: if container is None (no `<article>`/`<main>`), skip the regex fallback entirely (avoids whole-doc copyright noise).

**Patterns to follow:**
- `_extract_meta` (parser.py:149) for `article:published_time`.
- `_pick_main_container` (parser.py:248) for the container parameter signature.

**Test scenarios** (TestPublishedDate):
- Happy ISO datetime: `<time datetime="2025-03-15T10:00:00Z">` → `"2025-03-15"`
- Happy ISO date: `<time datetime="2025-03-15">` → `"2025-03-15"`
- Happy meta: `<meta property="article:published_time" content="2025-03-15T...">` → `"2025-03-15"`
- Container `<time>` wins over soup-level: nested `<time>` in article + sidebar `<time>` → article's
- CJK format: `<p>发布于 2025年3月15日</p>` in container → `"2025-03-15"`
- CJK with zero-padding: `2025年03月15日` → `"2025-03-15"`
- Slash format: `2025/3/15` in container → `"2025-03-15"`
- Copyright noise rejected: container empty + `<footer>© 2010</footer>` outside → returns "" (regex doesn't run on soup)
- Bare year alone (`2025`) → returns "" (no full date)
- Invalid date components rejected: `2025-13-45` → returns "" (month/day out of range)
- No date anywhere → returns ""
- Multiple dates in container: returns first encountered
- Single-digit padding: `2025-3-5` → `"2025-03-05"`

**Verification:**
- `pytest tests/test_parser.py -k PublishedDate` → green
- Existing `test_published_at` (TestDetailPage) still passes
- Manual: scan a site with copyright footer, confirm `published_at` is empty (or correct) rather than `2010`

---

## Execution Sequencing

| Order | Unit | Why this order |
|---|---|---|
| 1 | Unit 1 (Metrics) | Highest precision impact (year noise is the most visible bug); changes one helper signature; isolated. |
| 2 | Unit 2 (Cover) | Touches both detail + list extractors via shared helper — do after Unit 1 lands so we're not refactoring two precision-sensitive helpers simultaneously. |
| 3 | Unit 3 (Date) | Smallest blast radius; can land independently. Saved for last so its commit message can reference any test fixtures introduced by Units 1+2 if reusable. |

Each unit lands as one commit. Suite must stay green after each.

## Patterns to Follow

- **Module-scope compiled regex** — see `_TAG_PATH_RE`, `_CATEGORY_PATH_RE` (parser.py:26-36). One block of constants near the top, helpers below.
- **Single-helper-per-concern** — see `_pick_main_container`, `_extract_tags_and_category`. Each helper has a clear input → output contract; callers stay thin.
- **Test class per behavior** — see `TestPickMainContainer`, `TestNonRetryableExceptions`. Use parametrize for input variation.
- **Defensive `None` returns + empty-string defaults** — match existing parser conventions.

## Test Scenario Completeness Check

| Category | Unit 1 | Unit 2 | Unit 3 |
|---|---|---|---|
| Happy path | ✓ basic metric, ✓ existing call site | ✓ basic img, ✓ og:image | ✓ ISO, ✓ meta |
| Edge cases | ✓ K/M/B, ✓ 万/千/亿, ✓ scoping | ✓ lazy chain, ✓ srcset, ✓ tiny W/H | ✓ CJK, ✓ slash, ✓ padding |
| Error / failure paths | ✓ year guard, ✓ no keyword | ✓ all skipped, ✓ data: URI | ✓ invalid date, ✓ bare year |
| Integration | ✓ TestDetailPage existing | ✓ TestDetailPage + TestListPage | ✓ TestDetailPage existing |

## Deferred to Implementation

- **Year-noise context regex tuning** — the exact set of "© | copyright | since | founded | 版权 | 创建于" markers may need expansion as fixtures expose new patterns. Start with this list; adjust if tests force new cases.
- **Cover icon URL pattern set** — `_ICON_URL_RE` starts conservative. If real-world scans show false positives (e.g., a legitimate cover containing `placeholder` in the path), tune.
- **CJK 千 ambiguity** — `千` (thousand) is rare on metric counters in modern sites; if a test fixture surfaces a confusing case (e.g., a literary "千年" appearing near "views"), revisit.

## Risks

- **Regression on existing detail/list tests** — both extractors get refactored; mitigated by running the full suite after each unit and the `_extract_metric` keeping its existing function name + signature so call sites don't churn.
- **Test fixture overfit** — heuristics tuned to fixtures may fail on production HTML. Mitigated by sourcing one fixture per unit from the user's actual scan target (`51cg1.com`) when available.
- **CJK 万/千 false positives in non-Chinese pages** — extremely unlikely for `万` (very rarely appears in English text); `千` similar. The character match is byte-exact, no transliteration.

## Verification

After all 3 units land:
1. `pytest -q` — all tests pass (current 378 + ~30 new ≈ 410+).
2. Manual: restart Streamlit, scan a previously-problematic site, inspect a detail page's saved row in `data/crawler.db`:
   ```sql
   SELECT title, cover_url, views, likes, hearts, published_at, category
   FROM resources
   WHERE scan_job_id = (SELECT MAX(id) FROM scan_jobs)
   LIMIT 10;
   ```
   - `views/likes/hearts` no longer contain years (e.g., `2010`)
   - `cover_url` is a real image URL, not `/static/logo.png` or `data:image/...`
   - `published_at` either empty or a real `YYYY-MM-DD`, not a footer copyright year
3. The previous tag-cloud regression test (TestDetailPage::test_tags_scoped_to_article_container_not_sidebar) still passes — proves the existing scoping isn't broken.

## Out of Scope (deliberately not solved)

- Title cleanup (Gap D from audit) — separator set + decorative-char strip
- Breadcrumb detection (Gap E) — `aria-label` and `BreadcrumbList itemtype`
- List card title precedence (Gap F) — heading vs badge
- Per-domain profile registry — explicit scope-boundary per the brainstorm
