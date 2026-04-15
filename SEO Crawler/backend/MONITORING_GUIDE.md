# Phase 9.4 - Monitoring & Observability Guide

## Overview

Complete monitoring and observability system with Prometheus metrics, structured logging, health checks, and performance monitoring.

## Architecture

### 1. Metrics Service (`metricsService.ts`)

Prometheus metrics collection across all system layers:

```typescript
// HTTP metrics
- http_request_duration_ms: Histogram of request duration
- http_requests_total: Counter of total requests by method/route/status

// Database metrics
- db_query_duration_ms: Histogram of query duration
- db_queries_total: Counter of queries by operation/table/status

// Claude API metrics
- claude_tokens_used_total: Counter of tokens by type
- claude_request_duration_ms: Histogram of API call duration
- claude_api_cost_usd: Counter of cumulative API costs

// Application metrics
- active_users_count: Gauge of current active users
- users_quota_exceeded: Gauge of users with exceeded quota
- jobs_total: Counter of jobs created
- jobs_processing_time_ms: Histogram of job processing time
- webhook_deliveries_total: Counter of webhook attempts
- webhook_retries_total: Counter of retries
- cache_hits_total: Counter of cache hits
- cache_misses_total: Counter of cache misses
- errors_total: Counter of errors by type/endpoint
```

### 2. Logger Service (`loggerService.ts`)

Structured logging with Winston for queryable, contextual logs:

```typescript
loggerService.logRequest(method, path, userId)
loggerService.logResponse(method, path, status, duration, userId)
loggerService.logDbOperation(operation, table, duration, meta)
loggerService.logClaudeApiCall(analysisType, inputTokens, outputTokens, costUSD, duration, userId)
loggerService.logJobEvent(jobId, event, status, userId, meta)
loggerService.logWebhookEvent(webhookId, event, status, duration, meta)
loggerService.logAuthEvent(event, userId, status, meta)
loggerService.logQuotaEvent(userId, event, meta)
loggerService.logError(error, context, userId, meta)
loggerService.logPerformanceWarning(operation, duration, threshold, meta)
```

### 3. Health Check Service (`healthCheckService.ts`)

System health monitoring with detailed status reporting:

- **Liveness Probe** (`GET /health`) - Is the service alive?
- **Readiness Probe** (`GET /ready`) - Ready to accept traffic?
- **Status Endpoint** (`GET /status`) - Detailed health with latencies
- **Metrics Summary** (`GET /metrics/summary`) - Human-readable metrics overview

Health checks monitor:
- Database connectivity and latency
- Claude API connectivity and latency
- Memory usage (warning at 75%, critical at 90%)
- Service uptime

### 4. Monitoring Middleware (`monitoringMiddleware.ts`)

Automatic request/response metrics and logging:
- Records all HTTP requests with duration
- Tracks response status codes
- Logs slow requests (>5 seconds)
- Records errors with stack traces

### 5. Monitoring Routes (`monitoring.ts`)

Four monitoring endpoints:

```
GET /metrics           - Prometheus format metrics (for Prometheus scraper)
GET /health           - Liveness probe (is service alive?)
GET /ready            - Readiness probe (ready for traffic?)
GET /status           - Detailed health status with all checks
GET /metrics/summary  - Human-readable metrics summary
```

## Usage

### Starting the Server

```bash
npm start              # Production server
npm run dev           # Development with auto-reload
```

Server logs on startup:
```
🚀 SEO Crawler Backend v1.0.0
📊 Metrics: http://localhost:3001/metrics
❤️  Health: http://localhost:3001/health
📋 Status: http://localhost:3001/status
🔐 Auth: POST http://localhost:3001/auth/register
```

### Health Checks

**Kubernetes/Orchestration:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
```

**Manual Health Check:**
```bash
curl http://localhost:3001/health
# Response: { "status": "alive", "timestamp": "2026-04-15T..." }

curl http://localhost:3001/ready
# Response: { "status": "ready", "timestamp": "2026-04-15T..." }

curl http://localhost:3001/status
# Response: Detailed health check with all metrics
```

### Prometheus Integration

**Configure Prometheus scraper:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'seo-crawler'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

**Useful Prometheus queries:**
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# p95 request latency
histogram_quantile(0.95, http_request_duration_ms)

# Claude API costs
rate(claude_api_cost_usd[24h])

# Database query performance
histogram_quantile(0.95, db_query_duration_ms)
```

### Structured Logs

Logs are written to:
- **Console** - Development (colorized)
- **logs/error.log** - Error level and above
- **logs/combined.log** - All logs

Log format (JSON in production):
```json
{
  "timestamp": "2026-04-15 17:30:45",
  "level": "info",
  "message": "HTTP POST /api/analysis/123/difficulty 200",
  "type": "http_response",
  "method": "POST",
  "path": "/api/analysis/123/difficulty",
  "status": 200,
  "duration": 1234,
  "userId": 42
}
```

### Performance Thresholds

Default thresholds trigger warnings:
- **Slow Requests** - > 5 seconds
- **Database Latency** - > 1 second
- **Claude API Latency** - > 5 seconds
- **Memory Usage** - Warning at 75%, Critical at 90%

Customize via environment variables:
```bash
LOG_LEVEL=debug      # default: 'info' (dev: 'debug')
```

## Metrics Collection Examples

### Recording HTTP Requests

The middleware automatically records all requests:
```typescript
// In monitoringMiddleware
metricsService.recordHttpRequest(method, path, status, duration)
```

### Recording Claude API Usage

```typescript
// In analysis.ts
metricsService.recordClaudeUsage(
  inputTokens,
  outputTokens,
  analysisType,
  costUSD,
  duration
)
loggerService.logClaudeApiCall(
  analysisType,
  inputTokens,
  outputTokens,
  costUSD,
  duration,
  userId
)
```

### Recording Job Events

```typescript
metricsService.recordJobCreated(status)
metricsService.recordJobCompleted(status, duration)
loggerService.logJobEvent(jobId, event, status, userId)
```

### Recording Errors

```typescript
metricsService.recordError(errorType, endpoint)
loggerService.logError(error, context, userId)
```

## Deployment Checklist

- [ ] Ensure `/logs` directory is writable
- [ ] Configure LOG_LEVEL for environment
- [ ] Set up Prometheus scraper (if using)
- [ ] Configure monitoring dashboard (Grafana recommended)
- [ ] Set up alerting rules for thresholds
- [ ] Monitor disk space for log files
- [ ] Implement log rotation (daily/weekly)
- [ ] Set up log aggregation (if in distributed environment)

## Monitoring Best Practices

1. **Health Check Frequency**
   - Liveness: Every 10 seconds
   - Readiness: Every 5 seconds

2. **Metrics Collection**
   - Prometheus scrape interval: 15-30 seconds
   - High-cardinality labels: Keep bounded (method, route, status)

3. **Logging**
   - Structure all logs as JSON in production
   - Include correlation IDs for request tracing
   - Monitor log file sizes to prevent disk issues

4. **Alerting**
   - Alert on error rate > 1% for any endpoint
   - Alert on p95 latency > threshold
   - Alert on service unavailability (health check fails)
   - Alert on memory usage > 85%

5. **Performance Monitoring**
   - Track Claude API cost per day/month
   - Monitor job processing times
   - Track cache hit ratio
   - Monitor database query performance

## Troubleshooting

### Health checks failing

Check:
```bash
curl -v http://localhost:3001/health
curl -v http://localhost:3001/ready
curl -v http://localhost:3001/status
```

### Missing metrics

Verify:
- Endpoints are being hit
- Metrics middleware is registered
- Prometheus scraper configuration

### High memory usage

Check:
```bash
curl http://localhost:3001/status | jq '.checks.memory'
```

Monitor with:
```bash
ps aux | grep node
```

### Slow requests

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

Monitor latencies:
```bash
curl http://localhost:3001/status | jq '.checks'
```

## Next Steps

- Phase 10: Database optimization and query analysis
- Phase 11: Caching strategy and Redis integration
- Phase 12: Rate limiting and quota enforcement enhancements
- Phase 13: Advanced alerting and automated responses

---

**Status:** ✅ Phase 9.4 Complete  
**Files:**
- `backend/src/services/metricsService.ts` - Prometheus metrics
- `backend/src/services/loggerService.ts` - Structured logging
- `backend/src/services/healthCheckService.ts` - Health checks
- `backend/src/middleware/monitoringMiddleware.ts` - Request monitoring
- `backend/src/routes/monitoring.ts` - Monitoring endpoints

**Version:** 1.0.0
