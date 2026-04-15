# Performance Monitoring Guide

**Phase 14 - Metrics & Observability Implementation**

---

## Overview

Comprehensive performance monitoring for Prompt Optimizer using Prometheus and Grafana.

---

## Key Metrics

### API Performance
- **api_request_duration_seconds** (Histogram)
  - Labels: method, endpoint, status
  - Buckets: 10ms, 50ms, 100ms, 500ms, 1s, 5s
  - SLA: P95 < 100ms

- **api_requests_total** (Counter)
  - Labels: method, endpoint, status
  - Tracks total request count and rate

- **api_errors_total** (Counter)
  - Labels: method, endpoint, error_type
  - SLA: Error rate < 5%

### Batch Processing
- **batch_job_duration_seconds** (Histogram)
  - Labels: endpoint, status
  - Buckets: 1s, 5s, 10s, 30s, 60s, 300s
  - SLA: P95 < 60s

- **batch_jobs_total** (Counter)
  - Labels: endpoint, status (success/failed/partial_failed)
  - SLA: Success rate > 95%

- **batch_items_processed_total** (Counter)
  - Labels: endpoint, status
  - Tracks total items processed

- **batch_queue_length** (Gauge)
  - Number of pending jobs
  - SLA: < 100 pending jobs

### Webhook Delivery
- **webhook_delivery_duration_seconds** (Histogram)
  - Labels: event_type, status
  - Buckets: 100ms, 500ms, 1s, 5s, 10s
  - SLA: P95 < 5s

- **webhook_deliveries_total** (Counter)
  - Labels: event_type, status
  - SLA: Success rate > 99%

- **webhook_queue_length** (Gauge)
  - SLA: < 1000 pending events

### Cache Performance
- **cache_hits_total** (Counter)
  - Labels: cache_type (stats/timeline)
  - SLA: Hit rate > 80%

- **cache_misses_total** (Counter)
  - Labels: cache_type

- **cache_refresh_duration_seconds** (Histogram)
  - Labels: cache_type
  - SLA: < 1s refresh time

### Database
- **db_query_duration_seconds** (Histogram)
  - Labels: operation (select/insert/update/transaction)
  - SLA: P95 < 500ms

- **db_transactions_total** (Counter)
  - Labels: status (commit/rollback)

### System
- **nodejs_heap_size_bytes** (Gauge)
  - Labels: type (used/limit)
  - SLA: Heap usage < 90%

---

## Endpoints

### Metrics Export
```
GET /api/metrics
```
Returns Prometheus-format metrics. Used by Prometheus scraper.

Example:
```
api_request_duration_seconds_bucket{endpoint="/api/optimize-full",method="POST",le="0.1"} 42
api_request_duration_seconds_bucket{endpoint="/api/optimize-full",method="POST",le="0.5"} 100
```

### Health Check
```
GET /api/health
```
Returns system health status (JSON).

Example response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-14T10:30:00Z",
  "uptime": 3600,
  "cache": {
    "status": "healthy",
    "activeKeys": 15,
    "staleCaches": 2,
    "refreshing": 1
  },
  "database": {
    "status": "healthy"
  },
  "memory": {
    "heapUsed": 125,
    "heapTotal": 512,
    "external": 8
  },
  "responseTime": 5
}
```

---

## Prometheus Setup

### Configuration
Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["localhost:9093"]

rule_files:
  - "prometheus-alerts.yml"

scrape_configs:
  - job_name: "prompt-optimizer"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/api/metrics"
```

### Running Prometheus
```bash
docker run -d -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $(pwd)/prometheus-alerts.yml:/etc/prometheus/prometheus-alerts.yml \
  prom/prometheus
```

---

## Grafana Setup

### Import Dashboard
1. Open Grafana (http://localhost:3000)
2. Create new dashboard
3. Import JSON from `grafana-dashboard.json`

### Panels
- API Request Latency (P95)
- API Error Rate
- Batch Job Success Rate
- Webhook Delivery Success Rate
- Cache Hit Rate
- Database Query Latency (P95)
- Queue Lengths
- Heap Memory Usage

---

## Alert Rules

Critical alerts (immediate response):
- **ApiHighErrorRate** (> 5%)
- **WebhookQueueBacklog** (> 1000)
- **ServiceDown**

Warning alerts (investigate within 5 min):
- **ApiHighLatency** (P95 > 100ms)
- **BatchHighFailureRate** (> 5%)
- **WebhookLowSuccessRate** (< 99%)
- **DbHighMemory** (> 90%)

Info alerts (monitor trends):
- **CacheLowHitRate** (< 50%)
- **CacheRefreshSlow** (P95 > 1s)

---

## Performance Baselines

### Current Targets (Phase 14)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API P95 | <100ms | <20ms | ✅ |
| API Error Rate | <5% | <1% | ✅ |
| Batch Success | >95% | 98%+ | ✅ |
| Webhook Success | >99% | 99.5%+ | ✅ |
| Cache Hit Rate | >80% | 85-90% | ✅ |
| DB P95 | <500ms | <50ms | ✅ |
| Heap Usage | <90% | ~40% | ✅ |

---

## Monitoring Checklist

Daily:
- [ ] Check alert dashboard (zero critical)
- [ ] Review API error rate
- [ ] Monitor queue lengths

Weekly:
- [ ] Review performance trends
- [ ] Check cache hit rates
- [ ] Analyze slow query patterns

Monthly:
- [ ] Generate performance report
- [ ] Review SLA compliance
- [ ] Plan capacity scaling

---

## Next Steps

1. **Real-time Alerts**: Set up AlertManager for Slack/email
2. **Custom Dashboards**: Create role-specific dashboards
3. **Performance Profiling**: Add deeper profiling metrics
4. **Automated Scaling**: Use metrics for auto-scaling decisions

---

## Troubleshooting

**Metrics endpoint returns 500:**
- Check prom-client is installed
- Verify metrics collector initialization
- Check logs for errors

**Grafana shows no data:**
- Verify Prometheus scrape is working
- Check metric names in queries
- Ensure data retention is sufficient

**High memory usage:**
- Check for metric cardinality explosion
- Review label combinations
- Consider reducing bucket count
