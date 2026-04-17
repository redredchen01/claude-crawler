# ce:review Run Artifact — Phase A Autofix

**Date:** 2026-04-17
**Mode:** autofix
**Base:** `4dc1ad2` (last pre-Phase-A commit on `refactor/crawler-concurrency`)
**Plan:** `docs/plans/2026-04-17-003-refactor-crawler-phase2-remediation-plan.md`
**Reviewers spawned:** correctness, testing, maintainability, reliability, adversarial, kieran-python, project-standards (7 agents)

## Scope

8 changed files / ~957 inserted lines covering Phase A units A1-A6 (writer health surface, daemon flip, inverted shutdown, watchdog, Frontier batching, engine writer-health monitoring).

## Applied Safe-Auto Fixes (10)

1. **engine.py** — Drop redundant `(WriterUnavailableError, Exception)` tuple → `except Exception` (5 reviewers flagged).
2. **engine.py** — Drop dead `except TypeError` `cancel_futures` fallback (Python 3.10+ pinned in pyproject).
3. **engine.py** — Snapshot `counters.pages_done`/`resources_found` under `counters_lock` at finalize (race fix).
4. **engine.py** — `_direct_finalize_scan_job` uses `contextlib.closing` to actually close the connection.
5. **engine.py** — Drop unused `WriterUnavailableError` import.
6. **frontier.py** — `Optional[int]` → `int | None` (consistency with rest of codebase).
7. **frontier.py** — Delete unused `_normalize` deprecated shim (zero callers).
8. **writer.py** — Update `shutdown` docstring to reflect bounded-put behavior added in A1.
9. **writer.py** — **Chunk `_insert_pages_batch` SELECT IN by 500** to stay under SQLite `SQLITE_MAX_VARIABLE_NUMBER=999` on stock builds. P1 finding from correctness + adversarial.
10. **render.py** — `atexit.unregister` in `RenderThread.shutdown` to prevent handler accumulation in long-lived processes.

## New Tests (2)

- `tests/test_writer.py::TestInsertPagesBatch::test_batch_chunks_large_url_lists` — 2000-item batch succeeds (would fail without chunking on stock libsqlite3).
- `tests/test_writer.py::TestInsertPagesBatch::test_batch_preserves_input_order_with_mixed_new_and_existing` — resume-path correctness regression.

## Test Outcome

239 → 241 passing.

## Residual Manual Findings (deferred to next phase / future PR)

| ID | Severity | Title |
|---|---|---|
| RES-001 | P1 | Wedged-but-alive writer defeats `is_alive()` check — needs heartbeat mechanism |
| RES-002 | P1 | Worker silently swallows `WriterUnavailableError` mid-write; pages dropped without engine abort |
| RES-003 | P1 | Watchdog PID-reuse race — should snapshot `(Popen, pid)` and verify start_time before SIGKILL |
| RES-004 | P1 | `signal.SIGKILL` Windows incompatibility — declare Unix-only in pyproject classifiers OR use `proc.kill()` |
| RES-005 | P2 | Source-pattern tests in `TestEngineShutdownBound` and `TestEngineWriterHealth` are brittle; replace with behavioral tests |
| RES-006 | P2 | Missing integration test: writer dies mid-scan → engine aborts within 5s, status='failed' |
| RES-007 | P2 | Missing integration test: render `_real_teardown` blocks → watchdog SIGKILLs Chromium within timeout |
| RES-008 | P2 | Missing test: engine happy-path does NOT invoke `_direct_finalize_scan_job` |
| RES-009 | P3 | Frontier `flush_batch` failure leaves URLs in `_visited` but not in `pages` table — silent in-scan loss if writer recovers |
| RES-010 | P3 | Terminal scan_job UPDATE SQL duplicated between `WriterThread._update_scan_job` and `engine._direct_finalize_scan_job` |
| RES-011 | P3 | `discovery_cap = max_pages*10` magic constant — should move to config |
| RES-012 | P3 | Frontier `push`/`flush_batch` naming non-parallel — consider `stage`/`commit_pending` rename |

## Routing Notes

- All P1 residuals are concurrency/integration concerns that require behavioral tests rather than mechanical fixes — surfacing as todos rather than auto-applying.
- Plan's Phase B (B1, B6) explicitly addresses RES-002 (counter coherence via Future-on-PageWriteRequest), RES-006/007/008 (regression test suite), so these are on-schedule.
- RES-001/003/004/005 are net-new findings from this review and should be tracked into Phase B's planning OR a separate hardening PR.

## Verdict

**Ready with fixes** — Phase A's load-bearing changes are correct and tested; safe_auto fixes applied close 10 lower-severity issues. Remaining P1 residuals are real but are either (a) in-scope for Phase B, or (b) require manual judgment that exceeds autofix scope.

The branch is **safe to push to GitHub** as Phase A once these residuals are tracked.
