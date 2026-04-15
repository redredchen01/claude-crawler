# Phase 11: Admin Batch Monitoring Dashboard

**Status:** Planning  
**Base:** Phase 10 shipped (all 5 units merged to main)  
**Scope:** Admin-only dashboard for batch job monitoring + performance optimization

---

## Context

Phase 10 delivered batch job management and analytics. Phase 11 adds:
1. Real-time admin dashboard for monitoring 1000+ batch jobs
2. Performance optimizations for large batches
3. Advanced filtering & export capabilities

---

## Implementation Units

### Unit A: Dashboard Backend API (NEW ENDPOINTS)
**Goal:** Expose aggregated batch metrics for dashboard consumption

**Endpoints:**
- GET `/api/admin/batches/stats` — total jobs, avg processing time, throughput
- GET `/api/admin/batches/timeline` — jobs by status over time (hourly)
- GET `/api/admin/batches?filter=status,teamId&limit=50&offset=0` — paginated list with filtering
- GET `/api/admin/batches/{id}/timeline` — job progress events for single batch

**Files:**
- `app/api/admin/batches/stats/route.ts` (NEW)
- `app/api/admin/batches/timeline/route.ts` (NEW)
- `app/api/admin/batches/route.ts` (NEW)
- `lib/adminDashboard.ts` (NEW) — query service layer

---

### Unit B: Dashboard Frontend Components
**Goal:** React dashboard UI for admin batch monitoring

**Components:**
- `app/components/admin/BatchStatsCard.tsx` — KPI cards (total, completed, failed, avg time)
- `app/components/admin/BatchTimeline.tsx` — time-series chart (recharts)
- `app/components/admin/BatchList.tsx` — filterable table with sorting
- `app/components/admin/BatchDetail.tsx` — job progress & logs modal

**Pages:**
- `app/admin/batches/page.tsx` (NEW) — dashboard entry point

**Files:**
- `app/components/admin/BatchStatsCard.tsx` (NEW)
- `app/components/admin/BatchTimeline.tsx` (NEW)
- `app/components/admin/BatchList.tsx` (NEW)
- `app/components/admin/BatchDetail.tsx` (NEW)
- `app/admin/batches/page.tsx` (NEW)

---

### Unit C: Performance Optimization — Large Batch Handling
**Goal:** Optimize batch processing for 1000+ item batches

**Optimizations:**
1. **Chunked Processing** — process 100 items/chunk instead of 5/worker
2. **Parallel Chunk Uploads** — stream results to S3 (if applicable) during processing
3. **Memory Pooling** — reuse worker objects instead of recreating
4. **Database Connection Pooling** — increase pool size for concurrent writes
5. **Index Tuning** — add composite indexes on (status, createdAt) for dashboard queries

**Files:**
- `lib/batchProcessor.ts` (MODIFY) — chunking, pool management
- `prisma/schema.prisma` (MODIFY) — add indexes

**Benchmark:**
- 1000-item batch: current ~45 sec → target ~15 sec (3x improvement)

---

### Unit D: Admin Authorization & Audit
**Goal:** Restrict dashboard access, log admin actions

**Changes:**
- Add `requireAdminAuth()` middleware for `/api/admin/*`
- Log all admin dashboard access to audit trail
- Add `ADMIN_EMAILS` env var for admin whitelist

**Files:**
- `lib/rbac.ts` (MODIFY) — add requireAdminAuth()
- `app/api/admin/batches/route.ts` (includes audit logging)

---

### Unit E: Tests
**Files:**
- `__tests__/api/admin/batches/stats.test.ts` (NEW)
- `__tests__/api/admin/batches/timeline.test.ts` (NEW)
- `__tests__/api/admin/batches/route.test.ts` (NEW)
- `__tests__/components/admin/BatchStatsCard.test.tsx` (NEW)
- `__tests__/lib/adminDashboard.test.ts` (NEW)
- `__tests__/lib/batchProcessor.test.ts` (UPDATE — add performance tests)

**Test scenarios:**
- Admin can view aggregated stats
- Non-admin cannot access `/api/admin/*`
- Dashboard filters work correctly
- Performance: 1000-item batch processes within SLA
- Pagination handles large result sets

---

## Performance Baseline (Phase 10)

| Metric | Phase 10 | Target (Phase 11) |
|--------|----------|-------------------|
| 100-item batch | ~5 sec | ~2 sec |
| 1000-item batch | ~45 sec | ~15 sec |
| Dashboard stats query | — | <500ms |
| Concurrent workers | 5 | 8-10 (tunable) |
| DB connections | default | pooled (20+) |

---

## Execution Strategy

1. **Unit A (Backend)** — query service + API routes (2 hours)
2. **Unit C (Optimization)** — chunking + pooling (2 hours) — **run in parallel with Unit A**
3. **Unit B (Frontend)** — dashboard components (2 hours)
4. **Unit D (Auth)** — RBAC + audit (30 min)
5. **Unit E (Tests)** — test suite (2 hours)

**Total:** ~8-10 hours (3 days if part-time)

---

## Critical Success Factors

1. ✅ **Backward compatible** — Phase 10 batch API unchanged
2. ✅ **Admin-only** — no user-facing changes
3. ✅ **Measurable perf** — 3x faster on 1000-item batches
4. ✅ **Real-time capable** — WebSocket optional for Phase 11.1

---

## Out of Scope (Phase 11.1+)

- Real-time WebSocket updates
- Custom dashboard filters (role-based views)
- Batch job cancellation from dashboard
- Export to CSV/Excel
- Prometheus metrics integration

---

## Notes

- Use existing `batchOptimizationJob` table — no schema changes needed beyond indexes
- Dashboard queries cached in memory (60s TTL) to avoid DB thrashing
- Admin emails configured via `ADMIN_EMAILS=admin1@example.com,admin2@example.com`
