# Prompt Optimizer v1.0 Release

**Release Date:** April 14, 2026  
**Version:** 1.0.0  
**Status:** Production Ready

---

## Overview

Prompt Optimizer v1.0 brings enterprise-grade features including per-user rate limiting, API key authentication, webhook notifications, job tracking, and comprehensive monitoring. This is a significant milestone that transitions the service from beta to production-ready status.

### Key Features

- **Rate Limiting**: Per-user quotas with sliding window algorithm (10/hour for optimize, 30/hour for scoring)
- **API Key Authentication**: Scope-based access control (score, optimize-full, or all endpoints)
- **Webhook Notifications**: Real-time alerts when rate limits approach (< 10% remaining)
- **Job Tracking**: Async job status monitoring and cancellation for long-running optimizations
- **Response Caching**: Automatic caching by prompt hash to reduce redundant LLM calls
- **Metrics & Monitoring**: Prometheus-compatible metrics endpoint with rate limit and webhook delivery tracking
- **History API**: Full optimization history with pagination and deletion capabilities

---

## Migration Guide

### For Session-Based Users (Deprecated Path)

**Old endpoint (still works until deprecation sunset):**

```bash
curl -X POST http://localhost:3000/api/optimize-full \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt": "your prompt here"}'
```

**New endpoint (recommended):**

```bash
# 1. Generate an API key
curl -X POST http://localhost:3000/api/keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"scope": "optimize-full"}'

# 2. Use the API key
curl -X POST http://localhost:3000/api/optimize-full \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt": "your prompt here"}'
```

### Breaking Changes

None. v1.0 is fully backward compatible with existing session-based calls. Session-based authentication will be supported through the deprecation window.

### Deprecated Features (Sunset Timeline)

| Feature | Deprecated | Sunset Date | Action |
|---------|-----------|-------------|--------|
| Session-based auth (old) | April 14, 2026 | October 14, 2026 | Migrate to API key auth |
| `POST /api/score` | April 14, 2026 | October 14, 2026 | Use `/api/score` with API key |
| `POST /api/optimize-full` | April 14, 2026 | October 14, 2026 | Use `/api/optimize-full` with API key |

**Deprecation Notice**: All session-based endpoints return `X-Deprecation-Warning` header:

```
X-Deprecation-Warning: This endpoint is deprecated. Migrate to API key authentication. Session-based endpoints will sunset in 6 months.
```

### Migration Path (Step-by-Step)

1. **Phase 1 (April 14 - June 14, 2026):** Parallel Run
   - Keep existing session-based integration
   - Generate API keys for new features
   - Test API key path in staging

2. **Phase 2 (June 14 - October 14, 2026):** Full Deployment
   - Switch production traffic to API key path
   - Monitor rate limits and webhook events
   - Keep session endpoint as fallback

3. **Phase 3 (After October 14, 2026):** Cleanup
   - Remove session-based auth support
   - Decommission legacy routes
   - Full API key enforcement

---

## Service Level Agreement (SLA)

### Availability

- **Target Uptime:** 99.5% monthly
- **Planned Maintenance Window:** Sundays 2-4 AM UTC
- **Response SLA:** p99 latency < 500ms (optimization), < 200ms (scoring)

### Rate Limits

| Endpoint | Default | Adjustable | Rollout | Notes |
|----------|---------|-----------|---------|-------|
| `/api/optimize-full` | 10/hour | Yes | Per-user | Contact support to increase |
| `/api/score` | 30/hour | Yes | Per-user | Lightweight scoring |
| `/api/keys` | 5/hour | No | Per-user | API key generation |

### Support

- **Issues & Bugs:** GitHub Issues (github.com/anthropics/prompt-optimizer)
- **Rate Limit Issues:** Email support@anthropic.com
- **Security Concerns:** security@anthropic.com
- **Response Time:** 24 hours for critical issues

---

## API Reference

### Authentication

#### API Key (Recommended)

```bash
curl -X POST http://localhost:3000/api/optimize-full \
  -H "X-API-Key: pk_live_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt": "..."}'
```

#### Session Token (Deprecated)

```bash
curl -X POST http://localhost:3000/api/optimize-full \
  -H "Content-Type: application/json" \
  -d '{"raw_prompt": "..."}'
```

### Endpoints

#### 1. Optimize Full Prompt

**POST** `/api/optimize-full`

```json
Request:
{
  "raw_prompt": "Your prompt text (max 50KB)"
}

Response:
{
  "jobId": "job_123abc",
  "optimized_prompt": "...",
  "raw_score": { "clarity": 7.2, "specificity": 6.1, "total": 6.65 },
  "optimized_score": { "clarity": 8.9, "specificity": 8.4, "total": 8.65 },
  "explanation": "Specific improvements made...",
  "score_delta": { "total_delta": 2.0 }
}
```

**Headers:**
- `X-API-Key`: Your API key (optional if session authenticated)
- `X-RateLimit-Limit`: 10
- `X-RateLimit-Remaining`: 9
- `X-RateLimit-Reset`: Unix timestamp
- `X-Deprecation-Warning`: (session auth only)

#### 2. Score Prompt

**POST** `/api/score`

```json
Request:
{
  "raw_prompt": "Your prompt text"
}

Response:
{
  "clarity": 7.5,
  "specificity": 6.2,
  "total": 6.85
}
```

**Headers:**
- `X-Cache`: HIT or MISS (response caching)
- `X-RateLimit-*`: Standard rate limit headers

#### 3. Job Status

**GET** `/api/optimize-full/{jobId}`

```json
Response:
{
  "id": "job_123abc",
  "status": "completed",
  "result": { ... },
  "createdAt": "2026-04-14T10:00:00Z"
}
```

#### 4. Cancel Job

**POST** `/api/optimize-full/{jobId}/cancel`

```json
Response:
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

#### 5. Optimization History

**GET** `/api/history?page=1&limit=50`

```json
Response:
{
  "records": [
    {
      "id": "rec_123",
      "raw_prompt": "...",
      "optimized_prompt": "...",
      "raw_score_total": 6.65,
      "optimized_score_total": 8.65,
      "created_at": "2026-04-14T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120
  }
}
```

#### 6. Metrics

**GET** `/api/metrics` (Prometheus format)

```
rate_limit_hits_total 42
rate_limit_reset_seconds 1200.50
webhook_delivery_success_rate 0.98
```

### Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 10           # Total requests allowed per hour
X-RateLimit-Remaining: 9        # Requests remaining in current window
X-RateLimit-Reset: 1681414800   # Unix timestamp when limit resets
Retry-After: 3600               # Seconds until next request allowed (on 429 only)
```

### Error Responses

#### Rate Limit Exceeded (429)

```json
{
  "error": "Rate limit exceeded. Try again later.",
  "status": 429
}
```

**Headers:**
- `X-RateLimit-Remaining: 0`
- `Retry-After: 3600`

#### Unauthorized (401)

```json
{
  "error": "Unauthorized. Invalid or missing API key.",
  "status": 401
}
```

#### Not Found (404)

```json
{
  "error": "Job not found",
  "status": 404
}
```

---

## Webhook Configuration

### Scopes

- `score`: Only `/api/score` rate limit warnings
- `optimize-full`: Only `/api/optimize-full` rate limit warnings
- `all`: Both endpoints

### Webhook Events

#### Rate Limit Warning

Triggered when remaining quota drops below 10%.

```json
{
  "userId": "user_123",
  "endpoint": "optimize-full",
  "limit": 10,
  "remaining": 1,
  "resetAt": "2026-04-14T11:00:00Z",
  "timestamp": "2026-04-14T10:00:00Z"
}
```

**Signature Header:** `X-Webhook-Signature` (HMAC-SHA256)

---

## Monitoring & Observability

### Key Metrics to Watch

1. **Rate Limit Hits**
   - Metric: `rate_limit_hits_total`
   - Action: If spiking, consider increasing user quotas or identifying abuse

2. **Webhook Delivery**
   - Metric: `webhook_delivery_success_rate`
   - Target: > 95% success rate
   - Action: If < 90%, check webhook endpoint health

3. **Response Latency**
   - p50: < 100ms, p99: < 500ms
   - Action: If p99 > 500ms, investigate LLM API latency

4. **Cache Hit Rate**
   - Target: > 70% on /api/score
   - Indicates: Optimization effectiveness

### Prometheus Scrape Config

```yaml
global:
  scrape_interval: 60s

scrape_configs:
  - job_name: 'prompt-optimizer'
    static_configs:
      - targets: ['localhost:3000/api/metrics']
```

---

## Troubleshooting

### I'm Getting "Rate Limit Exceeded" (429)

**Cause:** You've exceeded your hourly quota.

**Solution:**
1. Wait until `Retry-After` seconds have passed
2. Check usage with `GET /api/quotas`
3. Contact support@anthropic.com to request higher limits

### My Webhook Isn't Receiving Events

**Cause:** HMAC signature mismatch or endpoint unreachable.

**Debug:**
1. Verify webhook URL is publicly accessible
2. Check logs for signature verification errors
3. Ensure webhook endpoint returns 2xx status code within 5 seconds

**Solution:**
```bash
# Test webhook delivery manually
curl -X POST https://your-webhook.example.com \
  -H "X-Webhook-Signature: <calculated-signature>" \
  -H "X-Webhook-Event: rate_limit_warning" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "remaining": 1}'
```

### Response Cache Hits Seem Low

**Cause:** Prompts are too varied or caching disabled.

**Debug:**
1. Check `X-Cache: MISS` in response headers
2. Verify Redis is running (if enabled)
3. Ensure same prompt text (hashing is exact match)

**Solution:** Cache TTL is 24 hours by default. Identical prompts within that window will hit cache.

---

## Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/anthropics/prompt-optimizer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/anthropics/prompt-optimizer/discussions)
- **Email**: support@anthropic.com
- **Status**: [status.anthropic.com](https://status.anthropic.com)

---

## Changelog

### v1.0.0 (April 14, 2026)

**New Features:**
- Per-user rate limiting (10/hour optimize, 30/hour score)
- API key authentication with scope-based access
- Webhook notifications for rate limit warnings
- Async job tracking and cancellation
- Response caching for score endpoint
- Prometheus metrics endpoint
- Full optimization history with pagination
- PostgreSQL support for production deployments

**Improvements:**
- Improved error handling and logging
- Better observability with structured metrics
- Graceful Redis fallback when cache unavailable

**Deprecated:**
- Session-based authentication (sunset: Oct 14, 2026)
- Legacy `/api/score` endpoint (session-only, sunset: Oct 14, 2026)

---

## License

Prompt Optimizer is licensed under the MIT License.
