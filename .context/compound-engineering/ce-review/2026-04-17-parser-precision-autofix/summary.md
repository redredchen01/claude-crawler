# ce:review Run Artifact — Parser Precision Autofix

**Date:** 2026-04-17
**Mode:** autofix
**Base:** HEAD~5 (pre-Unit-1)
**Plan:** `docs/plans/2026-04-17-004-feat-parser-data-precision-plan.md` (explicit)
**Reviewers:** correctness/edge-case, adversarial/python, testing/maintainability (3 parallel)

## Scope

5 commits / 3 files (parser.py, test_parser.py, plan doc) — Units 1+2+3 of the precision pass plus an interleaved JSON-LD commit that arrived between Units 1 and 2.

## Findings Summary

| Severity | Count | Disposition |
|---|---|---|
| P0 | 1 | safe_auto applied |
| P1 | 4 | safe_auto applied |
| P2 | 9 | 7 safe_auto applied, 2 deferred (test refactors not justifying scope) |
| P3 | 4 | 2 safe_auto applied (type hints, density descriptors), 2 advisory |

## Critical P0

**`_extract_metric` same-parent collision** — `<span>views 1234 likes 5678 hearts 12</span>` returned 1234 for ALL three keywords. Get_text flattened the parent and the keyword anchor was thrown away. **Fixed:** slice parent_text around the keyword's match position (after-then-before). Test: `TestExtractMetricSharedParentBug`.

## Applied Fixes (11)

1. **P0** Same-parent metric collision — keyword-anchored slicing
2. **P1** Sibling year_guard recomputed per sibling
3. **P1** `_ICON_URL_RE` tightened to path-segment boundaries
4. **P1** `_resolve_img_src` srcset moved before plain `src`
5. **P1** JSON-LD `0` no longer overridden by DOM
6. **P2** `_DATE_ISO_RE` trailing `\b` dropped
7. **P2** Sibling traversal capped at `_METRIC_SIBLING_CAP = 3`
8. **P2** Cover zero-area tie-break: prefer last image
9. **P2** Date floor 1990 → 1970
10. **P2** Dead `_extract_number_near_keyword` alias removed
11. **P2** Test imports hoisted to top + boundary tests use constants
12. **P3** `_pick_cover_image` type hints added
13. **P3** srcset `2x`/`3x` density descriptors handled

## Tests

468 → 486 (+18 regression tests), 100% green.

## Residual / Deferred

| ID | Severity | Title | Deferral reason |
|---|---|---|---|
| RES-001 | P3 | Module split: parser.py at 983 lines mixes 8 concerns | Single-file convention established; defer until next parser touch |
| RES-002 | P3 | Helper extraction: detail/list call patterns share keyword arrays | Premature DRY for two callers; fix when third lands |
| RES-003 | P2 | `_extract_metric` keyword-arg drift between detail (`浏览量`) and list (no `浏览量`) | Already noted in plan; fix in follow-up |

## Plan Requirements Verification

All R1–R9 from `2026-04-17-004-feat-parser-data-precision-plan.md` met. Implementation matches the plan exactly. The autofix pass strengthened the implementation against bugs the plan didn't anticipate (same-parent collision was a genuine new finding, not a missed requirement).

## Verdict

**Ready to merge** ✅ — All P0/P1 fixed, 9 of 13 P2/P3 fixed, residuals are advisory-tier deferrals appropriate for a follow-up refactor PR.
