# ce:review Run Artifact — Final Pass Autofix

**Date:** 2026-04-17
**Mode:** autofix
**Base:** `27af2d7` (Phase C end; pre-prior-autofix)
**Plan:** `docs/plans/2026-04-17-003-refactor-crawler-phase2-remediation-plan.md`
**Reviewers:** correctness, testing, maintainability, project-standards, adversarial, kieran-python (6 agents)

## Scope

8 files / ~141 inserts / ~96 deletes — entirely the autofix-of-Phase-B+C-findings commit.

## Critical Finding: Self-Inflicted Regression Caught

The PRIOR autofix routed the failure paths (robots-blocked, fetch-failed) through `_write_and_count` for "consistency". Adversarial review caught that this was actually a regression: failure paths now blocked workers up to 10s on writer reply when they previously returned instantly — and failure paths increment counters by 0 anyway, so the await delivered no behavioral benefit. On hostile sites with high failure rates, this would collapse worker throughput.

## Applied Fixes (6)

1. **Split `_write_and_count` into success vs failure variants:**
   - `_write_success_and_count` — keeps reply Future + counter coherence (B1's actual contract)
   - `_write_failure_and_count` — fire-and-forget; counters increment on submit success since failure rows have no resources to count
   - Justification documented in the failure helper's docstring

2. **`_write_success_and_count` derives `resources_added` from `request.parse_result`** instead of accepting a kwarg the caller must remember to pass. Removes a silent counter-drift footgun.

3. **`_write_success_and_count` asserts `request.reply is None`** to fail-fast on misuse.

4. **Drop `WRITE_REPLY_TIMEOUT = WRITER_REPLY_TIMEOUT` alias** — non-load-bearing (single in-module caller) and broke runtime patches via `patch("crawler.config.WRITER_REPLY_TIMEOUT")`. Helper now uses `WRITER_REPLY_TIMEOUT` directly.

5. **C1 double assignment annotated** — the `handle.context = None; handle.context = handle.browser.new_context()` pattern is intentional (leaves None on rebuild failure for next-render retry). Added inline comment explaining why.

6. **`render_disabled_warned` race comment compressed** from 6 lines to 3.

## Tests

256 passing; same count, same coverage. No new regressions.
End-to-end smoke (20 pages / 4 workers / localhost): **1.52s**, status=completed, pages_scanned=20.

## Residual Findings (deferred — not blocking)

| ID | Severity | Title | Reason for deferral |
|---|---|---|---|
| FP-RES-001 | P2 | B2 revert: pending_batch never re-flushed at shutdown → end-of-crawl writer failure can lose URLs | Requires final-flush-on-shutdown design + tests; out of autofix scope |
| FP-RES-002 | P3 | C1 `new_context()` failure escapes try/except; doesn't trigger crash circuit breaker | Requires `_is_browser_dead_error` extension or explicit re-raise wrapping — design call |
| FP-RES-003 | P3 | `_make_frontier` shim ossification risk — TODO marker without tracking ticket | Phase B7 / cleanup PR |
| FP-RES-004 | P3 | Test coverage gaps: C1 rebuild path, `_write_success_and_count` failure-skip, B2 multi-thread race | Speculative additions not justified by current bug surface |
| Pre-existing | P3 | README.md and CHANGELOG.md missing | Plan documentation deferral, tracked across all reviews |

Plus the unaddressed Phase A residuals (RES-001 wedged-but-alive writer heartbeat, RES-003 watchdog PID-reuse, RES-004 Windows SIGKILL).

## Verdict

**Ready to ship** ✅ — the autofix-of-autofix caught and reverted a real performance regression I introduced in the prior autofix, plus 5 quality cleanups. Remaining findings are advisory-tier residuals appropriate for a follow-up "Phase D — hardening" PR.

The code review pipeline did its job: each pass surfaced new findings the prior pass introduced or missed, demonstrating the value of iteration even when the underlying intent was correct.
