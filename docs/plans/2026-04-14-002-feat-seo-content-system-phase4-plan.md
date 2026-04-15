# SEO Content System — Phase 4 Plan
**Status:** Planning phase  
**Target Completion:** 2026-04-21 (7 days iterative)  
**Scope:** Production hardening + advanced integrations

---

## Phase 4 Objectives

### Primary Goals
1. **E2E Integration Testing** — Wire frontend to real backend, validate full workflows
2. **Trend Provider Integration** — Replace heuristics with real Google Trends / SEMrush APIs
3. **Agent-Native Interfaces** — Batch processing API + webhook support for autonomous workflows
4. **Production Deployment** — Docker/K8s finalization, monitoring, health checks

### Success Criteria
- ✅ Full user workflow: project → job → clusters → content generation (frontend)
- ✅ Real trend data flowing through pipeline (not heuristics)
- ✅ Agents can submit batch keyword jobs via API
- ✅ System runs in production-ready Kubernetes cluster
- ✅ All services monitored with Prometheus + structured logging
- ✅ E2E test suite (Cypress or Playwright) covering critical paths

---

## Implementation Roadmap

### Phase 4.1: E2E Testing & API Integration (2-3 days)
**Goal:** Full workflow validation (frontend ↔ backend)

#### Unit 4.1.1: Backend API Routes
- **File:** `/backend/src/api/*.ts`
- **Work:**
  - Implement `/api/projects` (CRUD for projects)
  - Implement `/api/jobs` (create/list/get keyword jobs)
  - Implement `/api/clusters` (list clusters by project, get cluster details)
  - Implement `/api/clusters/{id}/keywords` (get keywords for cluster)
  - Implement `/api/clusters/{id}/content-plan` (get/generate content plan)
  - Implement `/api/export` (CSV/JSON export)
- **Tests:** Unit tests for each route (input validation, error handling)
- **Verification:** All routes return correct schema matching frontend expectations

#### Unit 4.1.2: Frontend API Client Hooks
- **File:** `/frontend/src/hooks/*.ts`
- **Work:**
  - `useProjects()` — CRUD operations for projects
  - `useJobs()` — Fetch/create keyword jobs
  - `useClusters()` — Fetch clusters with filtering/sorting
  - `useContentPlan()` — Generate and fetch content plans
  - `useExport()` — Trigger CSV/JSON exports
- **Tests:** Integration tests with API mocking (MSW library)
- **Verification:** Hooks properly handle loading/error states

#### Unit 4.1.3: Cypress E2E Test Suite
- **File:** `/e2e/tests/*.cy.ts`
- **Work:**
  - Test: Create project → Submit keyword job → View clusters
  - Test: Select cluster → Generate content plan → Verify brief/FAQ/links
  - Test: Export clusters to CSV/JSON
  - Test: Filter clusters by page type, priority, competition
  - Test: Network visualization interaction (click cluster → detail view)
- **Verification:** All critical workflows pass on fresh database

---

### Phase 4.2: Trend Provider Integration (2 days)
**Goal:** Replace heuristic trend labels with real data

#### Unit 4.2.1: TrendProvider Interface & Google Trends
- **File:** `/backend/src/providers/trendProvider.ts`
- **Work:**
  - Abstract `ITrendProvider` interface (language-aware)
  - Implement `GoogleTrendsProvider` using `@alkalisummer/google-trends-js`
  - Methods: `getTrend(keyword, geo?, timeframe?)` → "rising" | "stable" | "declining" | "unknown"
  - Cache results (1 week TTL)
  - Graceful fallback if API unavailable
- **Config:** Environment variable `TREND_PROVIDER=google-trends` (default)
- **Tests:** 20+ tests covering API calls, caching, fallback

#### Unit 4.2.2: Keyword Classification Pipeline Update
- **File:** `/backend/src/services/classificationService.ts` (update)
- **Work:**
  - Integrate TrendProvider into classification pipeline
  - Add trend_label to KeywordFeature based on real data
  - Update opportunity_score calculation (trend data weighs 20%)
- **Verification:** Heuristic trend labels → real trend data in database

#### Unit 4.2.3: Trend Provider Dashboard Widget
- **File:** `/frontend/src/components/TrendIndicator.tsx`
- **Work:**
  - React component showing trend direction (↑ rising, → stable, ↓ declining)
  - Color-coded badges (green/gray/red)
  - Sparkline chart (7-day trend micro)
  - Hover tooltip with trend metadata
- **Verification:** Keyword keywords show trend indicators in ClusterList

---

### Phase 4.3: Agent-Native Batch Processing (2 days)
**Goal:** Enable autonomous workflows (agents submit jobs, get results)

#### Unit 4.3.1: Batch Job Submission API
- **File:** `/backend/src/api/batch.ts`
- **Work:**
  - `POST /api/batch/jobs` — Submit batch keyword job
    ```json
    {
      "projectId": "proj-1",
      "seedKeywords": ["react", "vue"],
      "config": { "strategies": ["original", "question"], ... },
      "webhookUrl": "https://agent.com/callback"
    }
    ```
  - `GET /api/batch/jobs/{jobId}` — Poll job status
  - `GET /api/batch/jobs/{jobId}/results` — Fetch clustering results
  - Webhook POST on completion with cluster + plan data
- **Auth:** API key validation (from seo-content-secrets)
- **Rate Limiting:** 10 jobs/hour per project (configurable)
- **Verification:** Agent can submit, poll, receive results

#### Unit 4.3.2: Webhook Notification System
- **File:** `/backend/src/services/webhookService.ts`
- **Work:**
  - Retry logic: 3 attempts with exponential backoff
  - Signature verification (HMAC-SHA256)
  - Payload schema: { jobId, status, clustersUrl, error? }
  - Audit log: all webhook deliveries
- **Tests:** 15+ tests for retry, signature, error scenarios
- **Verification:** Agent receives webhook on job completion

#### Unit 4.3.3: Batch Results Export
- **File:** `/backend/src/api/export.ts` (add)
- **Work:**
  - `GET /api/batch/jobs/{jobId}/export?format=csv|json`
  - CSV: keyword, cluster, intent, funnel, page_type
  - JSON: full cluster graph with relationships
  - Streaming response (large batches)
- **Verification:** Agent gets structured export for content generation

---

### Phase 4.4: Production Deployment Finalization (1-2 days)
**Goal:** Ship to production with monitoring + docs

#### Unit 4.4.1: Health Checks & Readiness Probes
- **File:** `/backend/src/health.ts` (new)
- **Work:**
  - `GET /health` — Liveness check (server is up)
  - `GET /ready` — Readiness check (all dependencies OK)
    - Database: Can execute simple query?
    - Trend provider: Can reach Google Trends?
    - LLM: API key valid?
  - Return 200 OK or 503 Service Unavailable
- **K8s:** Update deployment.yaml probes (Phase 2.8)
- **Verification:** K8s rolling updates work correctly

#### Unit 4.4.2: Metrics & Observability
- **File:** `/backend/src/metrics.ts` (existing from Phase 2, enhance)
- **Work:**
  - Add metrics:
    - `job_duration_seconds` (histogram)
    - `cluster_generation_seconds` (histogram)
    - `serp_scrape_latency_seconds` (histogram)
    - `llm_token_usage_total` (counter)
    - `content_plan_generation_success_total` (counter)
  - Expose on `GET /metrics` (Prometheus format)
- **Verification:** `curl localhost:9090/metrics` returns metrics

#### Unit 4.4.3: Structured Logging
- **File:** `/backend/src/utils/logger.ts` (create)
- **Work:**
  - JSON structured logging (not plain text)
  - Fields: timestamp, level, service, jobId, clusterId, duration, error
  - Log all external calls (SERP, LLM, Trend)
  - Log schema changes
- **Verification:** `docker logs seo-content-api | jq .jobId` filters by job

#### Unit 4.4.4: Docker & K8s Finalization
- **Files:** `Dockerfile` (existing, update), `k8s/deployment.yaml` (existing, verify)
- **Work:**
  - Verify: Multi-stage build, non-root user, resource limits
  - Add: Volume mounts for /data (database), /logs
  - K8s: Rolling update strategy (maxSurge: 1, maxUnavailable: 0)
  - Verify: All secrets mounted from seo-content-secrets
- **Verification:** `kubectl apply -f k8s/` succeeds, pod is ready

#### Unit 4.4.5: Production Deployment Guide
- **File:** `/DEPLOYMENT.md` (create)
- **Work:**
  - Prerequisites: Docker, Kubernetes, secrets setup
  - Local dev: `docker-compose up`
  - Staging deploy: K8s instructions
  - Production: Monitoring dashboard links, rollback procedure
  - Troubleshooting: Common issues + solutions
- **Verification:** New team member can deploy following guide

---

## Deferred to Phase 5+

- **Multi-language support** — Use MultiLanguageService (Phase 2), add UI selector
- **SEMrush integration** — Replace/supplement Google Trends
- **Advanced clustering** — ML-based clustering (currently rule-based)
- **Real-time updates** — WebSocket for live cluster updates
- **Dashboard analytics** — Job success rate, keyword coverage, trend changes
- **Mobile app** — React Native version (after web is stable)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Google Trends API rate limits | Implement caching (1 week), fallback to heuristics |
| Agent webhook timeouts | Retry with backoff, store results for polling |
| Large batch jobs (10K+ keywords) | Pagination, streaming export, async processing |
| Database lock during clustering | Transaction isolation, read replicas (Phase 5) |
| LLM rate limits | Queue with backoff, configurable concurrency |

---

## Success Metrics

- ✅ E2E test pass rate: 100% (all critical workflows)
- ✅ Trend data present in 95%+ of keywords
- ✅ Agent batch jobs: <5s submit, <60s complete (for 100 keywords)
- ✅ Webhook delivery: 99%+ success rate
- ✅ Kubernetes deployment: 0 manual steps
- ✅ Monitoring: All key metrics visible in dashboard

---

## Estimated Effort

| Phase | Effort | Status |
|-------|--------|--------|
| 4.1: E2E Testing | 2-3 days | Planned |
| 4.2: Trend Integration | 2 days | Planned |
| 4.3: Batch API | 2 days | Planned |
| 4.4: Deployment | 1-2 days | Planned |
| **Total** | **7-9 days** | **Ready to start** |

---

**Next Action:** Implement Phase 4.1 (E2E Testing & API Routes)  
**Branch:** Continue on `feat/phase4-integrations`
