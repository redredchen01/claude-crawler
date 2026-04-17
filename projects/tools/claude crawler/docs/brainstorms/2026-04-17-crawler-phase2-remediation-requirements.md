---
date: 2026-04-17
topic: crawler-phase2-remediation
---

# Crawler Phase 2 Remediation — P1 + P2

## Problem Frame

Phase 2 of the crawler refactor (`refactor/crawler-concurrency`, 5 commits, 210 tests passing) shipped the three-thread-owners architecture but the post-merge code review surfaced 16 P1+P2 issues that invalidate the refactor's headline claims:

- **The concurrency primitive isn't concurrent.** `Frontier._lock` is held across blocking `writer.insert_page` Futures, so on a page with 5K links the 8-worker pool collapses to 1. The smoke-test 0.67s for 5 pages / 4 workers is a clue: theoretical lower bound was 0.25s.
- **Shutdown isn't actually inverted.** `with ThreadPoolExecutor` exits before the `finally` runs, so workers blocked on render Futures wait their full 29s timeout. Documented bound was <10s; actual worst case is ~82s.
- **Crashes are silent.** WriterThread death + persistent `SQLITE_FULL`/`CORRUPT` slip past per-message exception handling; engine reports "completed" with green UI, DB has 1% of the writes.
- **Streamlit rerun leaks Chromium.** `daemon=True` orchestrator + `daemon=False` writer/render means each mid-scan reload orphans threads + Chromium PIDs + tmpdirs.
- **Render path's per-page overhead defeats the perf target.** New browser context per page (~100ms) + `networkidle` 5s wait per page + per-row fsync in writer compound to make the JS-page throughput well below what the architecture allows.

The smoke test passes. None of the 16 issues are caught by the existing 210 tests because the test surface mocks away the failure modes. This remediation closes the gap between the green test suite and the actual production behavior the refactor was supposed to deliver.

## Requirements

**Concurrency Safety (P1)**

- R1. `Frontier.push` must NOT hold `Frontier._lock` across the blocking `writer.insert_page` Future round-trip. Single page with N discovered links must allow other workers to pop/push within milliseconds, not N×writer-roundtrip ms.
- R2. The Streamlit worker thread's lifecycle must guarantee that WriterThread + RenderThread are shut down (or made unable to leak) on Streamlit reload, browser refresh, or interpreter restart. No leaked Chromium PIDs, no leaked `/tmp/crawler-chromium-*` directories, no zombie Python interpreters.
- R3. `WriterThread` must surface a "dead writer" signal to producers within bounded time. Producers blocked on `queue.put` must observe writer death and fail fast instead of hanging forever. `shutdown()` must be guaranteed to return within its declared timeout even when the writer thread crashed during `_open_connection` or the queue is full.
- R4. Persistent writer-side errors (e.g., `SQLITE_FULL`, repeated FK violations) must escalate to scan abort, not be silently swallowed and counted as success. The engine must detect this and set `scan_jobs.status='failed'` with a clear `failure_reason`.

**Shutdown Correctness (P1)**

- R5. The "inverted shutdown" claim must be true in practice: render thread shuts down BEFORE the worker executor drains, so workers blocked on render Futures see exceptions immediately. Total engine `run_crawl` shutdown wall-clock must be **≤ 10 seconds** in the worst case, including a hung Chromium subprocess.
- R6. `RenderThread.shutdown` must be able to interrupt an in-flight render — not wait for the current `page.goto`/`browser.close` to return. SIGKILL fallback on the Chromium PID must fire when `shutdown_timeout` elapses, regardless of where Playwright is blocked.

**State Coherence (P2)**

- R7. `counters.pages_done` and `counters.resources_found` must reflect what was actually committed to the database. A worker must not increment counters for a page whose `write_page` rolled back. `scan_jobs.pages_scanned` and `COUNT(*) FROM pages WHERE status='fetched'` must match for every completed run.
- R8. `Frontier.push` must not poison `_visited` on `writer.insert_page` failure. A failed push must leave the URL eligible for re-discovery. A single failed link push must not abort iteration over the rest of the page's discovered links.

**Observability & Visibility (P2)**

- R9. `RenderThread`'s `_disabled` state (after 3 consecutive launch/render failures) must be observable by the engine. Once disabled, the engine must skip the render fallback path for the rest of the run AND surface the disabled state in a UI-visible progress event so the user knows JS rendering stopped working.
- R10. Browser-death detection must not be a fragile English-substring match. A Playwright wording change must not silently break the crash-recovery path.

**Render Efficiency (P2)**

- R11. The render thread must not allocate a fresh `browser.new_context()` per page. One context per browser handle, recycled with `clear_cookies()`/`clear_permissions()` between pages, is sufficient for the single-domain crawl model. Lifecycle: lazy-create on first render, recreate only on browser teardown/restart.
- R12. The `wait_for_load_state("networkidle")` cap must be configurable and default low enough that long-poll/WebSocket pages don't always burn the full 5s. Acceptable default: drop networkidle entirely and rely on `domcontentloaded`, OR ≤ 1500ms cap.
- R13. The render thread's request queue must be bounded so `force_playwright=True` scans on slow sites apply natural back-pressure to workers instead of growing a queue of expired Future requests.

**Storage Throughput (P2)**

- R14. `writer.insert_page` must not trigger one fsync per discovered URL. Either batch insertions (one `BEGIN IMMEDIATE` per N URLs / per push-burst) or drop to `PRAGMA synchronous=NORMAL` on the writer connection (durable in WAL mode across crashes, sacrifices only in-flight transactions on power loss). Throughput target: 200-page scan with avg fan-out 50 finishes in **< 60s at 5 req/s** (the original Plan Unit 7 target).

**Maintainability (P2)**

- R15. The Frontier 2-tuple/3-tuple polymorphism and engine's `if len(item) == 3` branch must be eliminated. Engine never constructs writer-less Frontier in production; the dual mode adds reader confusion without runtime benefit.

**Test Coverage (P2)**

- R16. The R6a zero-resource retry test must be a real positive assertion that fires every time, not an `if resources:` no-op. Coverage of the R6a code path must be observable via `mock_render.call_count >= 1`.
- R17. The remediation must add new tests that would have caught each P1 finding when it was introduced. Specifically: (a) a load test exercising Frontier push contention with 5K-link page, (b) a writer-death/SQLITE_FULL test, (c) an engine shutdown-bound test that asserts `run_crawl` returns within 10s when render is hung, (d) a daemon-orphan reproduction (or proof that the chosen mitigation prevents it).

## Success Criteria

- A 200-page localhost scan at default settings (8 workers, 5 req/s, no force_playwright) completes in **< 60 seconds** (Plan Unit 7's stated target).
- A 5K-link seed page scan saturates all 8 workers (no single worker holds Frontier exclusively for more than ~10ms at a time, observable via thread profiling or a contention metric).
- Killing `run_crawl` mid-scan with SIGTERM completes within **10 seconds** including Chromium teardown, regardless of Playwright state. No leaked Chromium PIDs after process exit.
- Streamlit reload mid-scan (edit `app.py`, observe auto-reload, OR refresh browser) leaves no orphaned threads, no leaked Chromium processes, no leaked `/tmp/crawler-chromium-*` tmpdirs.
- Injecting a writer-side persistent failure (e.g., `monkeypatch save_resource_with_tags` to always raise) causes `run_crawl` to abort with `scan_jobs.status='failed'` within 5 seconds, not run silently to "completion" with empty DB.
- For every completed scan: `scan_jobs.pages_scanned == COUNT(*) FROM pages WHERE status='fetched' AND scan_job_id=?`. Verified by an integration test that injects a write_page rollback mid-stream.
- The R6a test verifies `mock_render.call_count >= 1` and `len(resources) >= 1` unconditionally — no defensive `if resources:` escape hatch.
- All existing 210 tests stay green; new tests bring the count to **≥ 230**. CI runtime stays under 60s.

## Scope Boundaries

- **Out of scope**: P3 findings (entry_url normalization on resume, dead `use_playwright` kwarg, `Optional[X]` vs `X | None` style, `_ChromiumHandle` `Any` types, render_failed_pages bypassing storage, missing pages index, etc.). Tracked separately for a follow-up cleanup PR.
- **Out of scope**: real-Playwright integration smoke test in CI (gated `pytest.mark.skipif`). Useful but separable; CI cost concerns.
- **Out of scope**: changes to the brainstorm/plan/requirements docs themselves — protected artifacts.
- **Out of scope**: GitHub push and tag v0.2.0 — they happen *after* remediation lands.
- **Out of scope**: re-architecting away from SQLite, away from sync Playwright, or to a multi-process model. Three-thread-owners stays.
- **Out of scope**: a per-page retry budget or per-domain failure circuit breaker. Useful but not part of the review's P1+P2 set.
- **Out of scope**: any P3 cosmetic / type-hint / style cleanup. Either ship after the remediation PR, or roll into a separate "Phase 2.5 cleanup" PR.

## Key Decisions

- **Bundle into ≤ 3 logical phases, ship as ≤ 3 PRs.** The 16 items split naturally:
  - **Phase A — Safety net (P1)**: R1, R2, R3, R4, R5, R6. Cannot ship to production without these.
  - **Phase B — State + visibility (P2 correctness)**: R7, R8, R9, R10, R15, R16, R17. Restores coherence and adds the missing tests.
  - **Phase C — Render + storage throughput (P2 perf)**: R11, R12, R13, R14. Delivers the original perf target.
  Phases land in order; each phase keeps the suite green.
- **Phase A blocks GitHub push.** Don't push the orphan branch until Phase A merges.
- **Prefer "fix the design" over "patch the symptom."** R1's batch-insert and R3's writer-health-check are bigger surgery than a `put_nowait` band-aid would be, but they kill the class of bug rather than masking it. The Plan locked the architecture; this remediation finishes it.
- **R5's 10s shutdown bound is non-negotiable.** Streamlit users hitting "Stop" cannot wait 82s. If the architecture can't deliver this, we revisit the architecture, not the bound.
- **R7's counter-coherence requires `write_page` to be synchronous (Future-backed) OR a writer→engine completion-signal channel.** Pick one in planning; both deliver the invariant.

## Dependencies / Assumptions

- Phase 1 work (URL normalization, schema migration, thread-safe Frontier, token bucket, N+1 fix) is already in `main`'s upstream and stays.
- No new external dependencies. The fixes use stdlib threading/queue + existing Playwright surface.
- Streamlit version stays current; we don't migrate to a different UI framework.
- `playwright>=1.40` continues to expose `chromium.executable_path`, `connect_over_cdp`, `browser.close`, `context.clear_cookies`. R10 explicitly notes string-match brittleness here.
- Local SQLite stays the storage tier (per Phase 2 plan's scope boundary).

## Outstanding Questions

### Resolve Before Planning

(None — all product decisions are settled by the review's findings and the user's choice of scope = P1+P2.)

### Deferred to Planning

- [Affects R1][Technical] **Batch shape for `insert_page`**: a single `InsertPagesBatchRequest` carrying `[(url, depth), ...] → [page_id, ...]`, OR move `insert_page` outside the lock and patch `page_id` back via post-lock writer call. Pick whichever produces simpler test scenarios.
- [Affects R2][Technical] **Daemon-flip strategy**: (a) make WriterThread+RenderThread `daemon=True` and accept lost in-flight writes on hard kill, (b) keep `daemon=False` and register an `atexit` shutdown, (c) use a `threading.Event` cancellation surface that Streamlit can set on session-state cleanup. Each has different reload-behavior trade-offs; planning picks one.
- [Affects R3][Technical] **Writer-health surface**: `writer.is_alive()` polled by engine before each push, OR PageWriteRequest carrying an optional Future the engine samples periodically, OR exception escalation through `last_exception` checked in the orchestrator's wait loop. All deliver the invariant; planning picks the cleanest.
- [Affects R5, R6][Technical] **Hard shutdown mechanism**: a watchdog thread that SIGKILLs Chromium PID at deadline, OR an external signal-handler-based shutdown. Whichever guarantees the 10s bound regardless of Playwright internals.
- [Affects R7][Technical] **Counter-coherence mechanism**: synchronous Future-backed `write_page`, OR async confirmation channel. Planning measures the throughput cost of each before picking.
- [Affects R14][Needs research] **`PRAGMA synchronous=NORMAL` vs batch-insert**: which delivers the throughput target with less complexity? Quick benchmark during planning will tell us.
- [Affects R11][Needs research] **Context-per-handle vs context-per-batch**: confirm via Playwright API docs that `context.clear_cookies()` is sufficient state isolation for our use case (no auth, no per-page cookie state). One-paragraph confirmation suffices.
- [Affects R12][User decision deferrable to planning] Default `wait_for_load_state` value: drop it, or 1500ms cap? Planning picks based on quick measurement against the test fixtures.

## Next Steps

→ `/ce:plan` for structured implementation planning, with this requirements doc as the origin
