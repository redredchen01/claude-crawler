# Phase 8: Per-User Rate Limiting — Optimization Plan P2-P4

**Project:** Prompt Optimizer  
**Phase:** 8 (Internal Quotas)  
**Base:** v0.1.2 + P1 Code Quality  
**Status:** P2-P4 Planning

---

## Phase 8 P1: Code Quality ✅

**Completed:**
- Route consolidation: routeHelpers.ts (117 LOC)
  - `formatRateLimitHeaders()` — X-RateLimit-* header formatting
  - `buildRateLimitErrorResponse()` — 429 response builder
  - `buildErrorResponse()` — Generic error handler with logging
  - `validatePromptInput()` — Prompt validation (null, type, length, whitespace)
- Eliminated 100+ LOC of duplication across routes
- Added 24 boundary tests for input validation and rate limiting
- All 186 tests passing

---

## Phase 8 P2: Performance & Persistence

**Goal:** Upgrade in-memory scoring limit to persistent, distributed rate limiting

### Approach

**2.1 PostgreSQL FTS for History Search**
- Use existing OptimizationRecord table
- Add GIN index on `raw_prompt` with tsvector
- Query: `SELECT COUNT(*) WHERE userId = $1 AND created_at > now() - interval '1 hour'`
- Benefit: Accurate limits across restarts and instances

**2.2 Redis Rate Limit Cache (optional)**
- Cache recent user counts in Redis with TTL
- Reduce DB queries per request
- Fallback to DB if Redis unavailable
- Benefit: <1ms lookups for high-traffic users

**2.3 Caching Strategy**
- GET /api/score: Cache responses by (userId, prompt_hash) for 5 minutes
- GET /api/history: Paginate OptimizationRecord with 50-item page size
- Invalidate on DELETE / PATCH operations

### Verification
- Rate limits enforced across multiple server instances
- Restart safety: limits survive server restart
- Load test: 100 concurrent users, verify limit enforcement
- Cache hit rate: >80% for repeated prompts

---

## Phase 8 P3: Admin & User Experience

**Goal:** Webhooks, quota dashboard, job control

### 3.1 Webhook Notifications
- POST /api/webhooks/rate-limit-event
- Payload: `{userId, endpoint, limit, remaining, resetAt}`
- Trigger: When remaining < 10% of limit
- Benefit: Users get advance warning before hitting limit

### 3.2 API Key Management
- Generate API keys per user
- Scope keys to specific endpoints (e.g., "score" only)
- Track key usage per endpoint
- Revoke compromised keys
- Benefit: Fine-grained access control, audit trail

### 3.3 Batch Job Cancellation
- POST /api/optimize-full/cancel/{jobId}
- Requires user ownership of job
- Status endpoint: GET /api/optimize-full/{jobId}
- Benefit: Stop long-running optimizations mid-flight

### 3.4 Quota Dashboard
- GET /api/user/quotas
- Response: `{score: {limit, remaining, resetAt}, optimize: {limit, remaining, resetAt}}`
- Personal usage graph (7-day rolling window)
- Benefit: Users understand their rate limit status

### Verification
- Webhook POSTs succeed with valid payload
- API keys enforce endpoint scoping
- Cancelled jobs stop processing within 5 seconds
- Dashboard reflects real-time usage

---

## Phase 8 P4: Roadmap to v1.0

**Goal:** Consolidate P1-P3, plan Phase 9

### 4.1 Deprecation Warnings
- Add `X-Deprecation-Warning` header for beta endpoints
- List: /api/score, /api/optimize-full (pre v1.0)
- Warn users to migrate to keyed endpoints

### 4.2 Metrics & Monitoring
- Prometheus metrics:
  - `rate_limit_hits_total` (counter, by endpoint, by user)
  - `rate_limit_reset_seconds` (gauge, percentile latency)
  - `webhook_delivery_success_rate` (gauge)
- Grafana dashboards:
  - "Rate Limit Overview" (global usage, top users)
  - "API Health" (endpoint latency, error rate)

### 4.3 v1.0 Release Planning
- Stabilize all P1-P3 APIs
- Complete migration of existing users from session → API key auth
- Tag v1.0, announce SLA
- Sunset session-based endpoints in 6 months

### 4.4 Phase 9 Candidates
- User-level quotas (separate limits per plan tier)
- Team quotas (shared pool for team members)
- Usage export (CSV, JSON, Parquet)
- Billing integration (Stripe, charge per 1000 requests)

### Verification
- v1.0 tagged and released
- All P1-P3 features in 90% of requests
- Zero breaking changes vs. P3 release
- SLA document signed by users

---

## Implementation Sequence

| Phase | Units | Est. Days | Dependencies |
|-------|-------|-----------|--------------|
| **P1** | Route consolidation, boundary tests | 1 | — |
| **P2** | FTS indexing, Redis cache, caching | 3-4 | P1 ✅ |
| **P3** | Webhooks, API keys, job control, dashboard | 4-5 | P2 |
| **P4** | Metrics, v1.0 release, Phase 9 planning | 2-3 | P3 |

**Total:** ~10-13 days (end of Phase 8)

---

## Environment Variables (P2-P4)

```env
# P2: Persistence
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=300

# P3: Webhooks & Keys
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_MAX=3
API_KEY_VALIDITY_DAYS=90

# P4: Monitoring
PROMETHEUS_PUSH_GATEWAY=http://localhost:9091
METRICS_EXPORT_INTERVAL_MINUTES=5
```

---

## Git Workflow

All changes land via PR to `main` with:
- ✅ All tests passing (target: 200+ tests by P4)
- ✅ Coverage ≥90% for new/changed code
- ✅ Code review approval
- ✅ Pre-landing integration test run

Tags:
- `v0.2.0` — P1 complete (route consolidation)
- `v0.3.0` — P2 complete (persistence)
- `v0.4.0` — P3 complete (webhooks, keys, dashboard)
- `v1.0.0` — P4 complete (release-ready)

---

## Success Criteria

**By end of Phase 8:**
- ✅ Users cannot DOS endpoints via unlimited requests
- ✅ Limits enforced reliably across server restarts & instances
- ✅ Users aware of quota status (dashboard, webhooks)
- ✅ Admin can revoke access (API key management)
- ✅ v1.0 release ready with SLA

**Metrics:**
- Zero rate limit bypass attempts (security audit)
- 99.9% uptime for /api/quotas (status endpoint)
- <100ms p99 latency for rate limit check
- <5% webhook delivery failure rate

---

## Deferred (Post-v1.0)

- OAuth2 / SAML integration (enterprise)
- Usage-based billing (stripe integration)
- Multi-tenant quotas (team/org level)
- Rate limit trading (unused quota → carryover)
