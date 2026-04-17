# ce:review Run Artifact — Phase B+C Autofix

**Date:** 2026-04-17
**Mode:** autofix
**Base:** `e926378` (post-Phase-A autofix, start of Phase B)
**Plan:** `docs/plans/2026-04-17-003-refactor-crawler-phase2-remediation-plan.md`
**Reviewers spawned:** correctness, testing, maintainability, reliability, performance, adversarial, kieran-python, project-standards (7 agents)

## Scope

10 changed files / ~764 inserted lines covering Phase B (B1-B6) + Phase C (C1-C4).

## Applied Fixes (12)

### Critical correctness revert

1. **Revert B2 `_visited.discard` change** in `crawler/core/frontier.py` — the original Phase B fix removed staged URLs from `_visited` on flush failure to enable re-discovery, but cross-reviewer analysis (correctness + adversarial) showed this creates a real double-process race: a concurrent worker can re-stage the same URL between the rollback and a successful retry, leading to two queue entries with the same page_id and counter inflation. Reverted to "URLs stay in `_visited`; pending_batch retry path is the sole recovery channel". Test renamed and inverted to match.

### Correctness fixes (P1/P2)

2. **B1 failed-page paths now use reply Future** — robots-blocked and fetch-failed `write_page` calls now route through a new `_write_and_count` helper that awaits the writer ack and only increments counters on commit confirmation. Closes the gap where the success path was coherent but failure paths were still fire-and-forget.

3. **C1 stale-broken-context recovery** — when `clear_cookies()` / `clear_permissions()` raises, `_real_render` now closes and rebuilds the context instead of charging on with a corrupted one. Prevents 3-retry waste per render until the crash circuit-breaker trips.

### Style + organization (P3)

4. **`engine.py`**: dropped redundant `(WriterUnavailableError, Exception)` tuple, dead `except TypeError cancel_futures` fallback (already in Phase A autofix carry-over).

5. **Tunables moved to `config.py`**: `RENDER_QUEUE_SIZE`, `RENDER_SUBMIT_TIMEOUT`, `WRITER_REPLY_TIMEOUT`. Render module now imports them; engine keeps a short alias.

6. **`render_disabled_warned` race** — added a comment acknowledging the harmless duplicate-emit race (cheaper than adding a Lock for cosmetic dedup).

7. **`TestPhaseBRegressions` → `TestHighFanoutAndWriterDeathRegressions`** — drop plan-phase nomenclature from test class name.

8. **`_make_frontier` shim docstring expanded** — explains it preserves pre-batch test ergonomics; new tests should use real Frontier API (TestFrontierWriterMode pattern).

9. **`Frontier.seed_existing` / `mark_visited` docstrings expanded** — documents that they're resume-only.

10. **`writer.py` `except BaseException` annotated** — comment explains the SystemExit/KeyboardInterrupt rationale.

11. **B4 typed-import comment** — flags `playwright._impl._errors.TargetClosedError` as private API; documents removal criterion.

12. **Cleanup**: dropped unused `FuturesTimeoutError` import in test_render.py; removed duplicate inline `Future` / `patch` imports in test_writer.py; `typing.Callable` → `collections.abc.Callable` in render.py.

## Tests

256 passing — same count as pre-review (no regressions; one test renamed/inverted to match the B2 revert).
End-to-end smoke (20 pages / 4 workers / localhost): 1.47s, status=completed, pages_scanned=20.

## Residual P1/P2 (manual / future PR)

| ID | Severity | Title |
|---|---|---|
| BC-RES-001 | P2 | `WRITE_REPLY_TIMEOUT` (10s) untested; slow-but-alive writer can leave counter < DB |
| BC-RES-002 | P2 | C2 `RENDER_WAIT_NETWORKIDLE_MS=0` default is silent regression for hydration-heavy SPAs (no warning) |
| BC-RES-003 | P2 | C3 render-queue saturation invisible to engine + UI (workers stall up to 60s with no progress signal) |
| BC-RES-004 | P2 | R17d daemon-orphan subprocess test still missing (defer to follow-up "Phase D — hardening" PR) |
| BC-RES-005 | P2 | B6 R17b uses `is_alive()` patch instead of plan-spec `save_resource_with_tags` fault injection — narrows the test's coverage |

Plus the unaddressed Phase A residuals (RES-001 wedged-but-alive writer, RES-003 watchdog PID-reuse, RES-004 Windows SIGKILL).

## Verdict

**Ready with fixes** — Phase B+C's load-bearing changes are correct, with one critical revert (B2 _visited rollback was over-eager). The autofix pass closed 12 issues including the most important correctness regression. Branch is safe to push as the complete plan delivery once the residuals are tracked into a follow-up.
