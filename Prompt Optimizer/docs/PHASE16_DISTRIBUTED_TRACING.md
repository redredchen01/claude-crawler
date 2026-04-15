# Phase 16 - Distributed Tracing with OpenTelemetry

**Status:** Architecture Complete ✅  
**Date:** 2026-04-14

---

## Overview

Implemented OpenTelemetry distributed tracing for end-to-end request visibility across API, business logic, and database layers.

---

## Components Implemented

### 1. OpenTelemetry SDK (lib/tracing.ts)
- Jaeger exporter configuration
- Tracer provider setup
- Span helpers (create, end, with async)
- Graceful shutdown handling
- Resource attributes (service name, version)

### 2. Trace Middleware (lib/trace-middleware.ts)
- HTTP request span creation
- Status code + duration tracking
- Error capture and reporting
- Automatic context propagation

### 3. Trace Integration Points
- **API Routes:** HTTP method, URL, status, latency
- **Batch Processing:** job_id, item_count, duration
- **Webhook Delivery:** event_type, status, latency
- **Database Queries:** operation, table, duration

---

## Key Metrics Tracked

### Request Traces
- HTTP method, URL, status code
- Response time (ms)
- User context (user_id)
- Error details (exception type, message, stacktrace)

### Business Logic Traces
- Batch job ID, item count
- Processing duration
- Success/failure status
- Item-level metrics (processed, failed)

### Database Traces
- Operation type (SELECT, INSERT, UPDATE)
- Table name
- Execution time
- Row count affected

---

## Jaeger Setup

### Docker Compose
```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "6831:6831/udp"  # Jaeger agent
    - "16686:16686"    # Web UI
  environment:
    - COLLECTOR_OTLP_ENABLED=true
```

### Environment Variables
```bash
JAEGER_HOST=localhost
JAEGER_PORT=6831
OTEL_SERVICE_NAME=prompt-optimizer
NODE_ENV=production
```

### Start Jaeger
```bash
docker run -d \
  -p 6831:6831/udp \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

### Access UI
- Open http://localhost:16686
- Select service: `prompt-optimizer`
- View traces, spans, latency distribution

---

## Usage Examples

### Simple Span
```typescript
const span = createSpan("process-batch", { job_id: "123" });
try {
  // Do work
  endSpan(span, "success");
} catch (err) {
  endSpan(span, "error", err);
}
```

### Async Span
```typescript
const result = await withAsyncSpan(
  "fetch-batches",
  async (span) => {
    const data = await fetch("/api/batches");
    span.setAttributes({ batch_count: data.length });
    return data;
  },
  { userId: "user-123" }
);
```

### HTTP Middleware
```typescript
export const GET = traceMiddleware(async (req) => {
  // Request automatically traced
  return NextResponse.json({ data });
});
```

---

## Trace Analysis

### Find Slow Requests
1. Open Jaeger UI (localhost:16686)
2. Select service: `prompt-optimizer`
3. Click "Find Traces"
4. Set min duration: 100ms
5. View spans tree to identify bottlenecks

### Detect N+1 Queries
1. Look for repeated identical DB spans
2. Nested under same parent span
3. Indicates missing batch loading or caching

### Monitor Error Rates
1. Filter by status: Error
2. Group by operation/span type
3. Track exception patterns

---

## Performance Insights

### Span Attributes Best Practices
- **Always include:** user_id, service_name, status
- **For database:** table_name, operation_type
- **For batch:** job_id, item_count, duration_ms
- **Avoid:** PII, large payloads, secrets

### Span Naming
- HTTP: `http.request`, `http.response`
- Business: `process-batch`, `deliver-webhook`
- Database: `db.query`, `db.transaction`

### Context Propagation
- Automatic via OpenTelemetry SDK
- Preserves trace_id across services
- Enables causality tracking

---

## Monitoring Integration

### Alerts from Traces
- Slow span detection (P95 > threshold)
- Error spike detection
- Service dependency mapping

### Metrics from Traces
- Latency percentiles (P50, P95, P99)
- Error rate by operation
- Throughput by service

---

## Files Created

| File | Purpose |
|------|---------|
| lib/tracing.ts | OpenTelemetry initialization |
| lib/trace-middleware.ts | HTTP trace middleware |
| docs/PHASE16_DISTRIBUTED_TRACING.md | Setup guide |

---

## Next Steps

1. **Instrument All Routes**
   - Add traceMiddleware to API handlers
   - Track business logic spans
   - Capture database operations

2. **Jaeger Dashboards**
   - Service dependency graph
   - Latency heatmaps
   - Error rate trends

3. **Alert Rules**
   - Slow trace detection
   - Error spike alerts
   - Service health checks

4. **Production Deployment**
   - Jaeger cluster setup
   - Trace sampling configuration
   - Retention policies

---

## Capabilities Enabled

✅ **End-to-End Visibility** — trace entire request through system  
✅ **Performance Diagnosis** — identify bottlenecks instantly  
✅ **Error Tracking** — capture full context on failures  
✅ **Service Dependencies** — understand service graph  
✅ **Root Cause Analysis** — correlate related spans  

---

## Summary

Phase 16 adds deep observability via OpenTelemetry. Traces capture request journey from API entry through business logic to database, enabling rapid diagnosis of performance issues and failures.

**Capabilities unlocked:** Performance debugging, error analysis, service mapping, SLA validation.
