/**
 * Prometheus Metrics Collection
 * Track performance, errors, and operational metrics
 */

import { register, Counter, Histogram, Gauge } from "prom-client";
import logger from "@/lib/logger";

// Default metrics (built-in)
export { register };

// ============ API Metrics ============

export const apiRequestDuration = new Histogram({
  name: "api_request_duration_seconds",
  help: "API request duration in seconds",
  labelNames: ["method", "endpoint", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
});

export const apiRequestCounter = new Counter({
  name: "api_requests_total",
  help: "Total API requests",
  labelNames: ["method", "endpoint", "status"],
});

export const apiErrorCounter = new Counter({
  name: "api_errors_total",
  help: "Total API errors",
  labelNames: ["method", "endpoint", "error_type"],
});

// ============ Batch Processing Metrics ============

export const batchJobDuration = new Histogram({
  name: "batch_job_duration_seconds",
  help: "Batch job processing duration in seconds",
  labelNames: ["endpoint", "status"],
  buckets: [1, 5, 10, 30, 60, 300],
});

export const batchJobCounter = new Counter({
  name: "batch_jobs_total",
  help: "Total batch jobs processed",
  labelNames: ["endpoint", "status"],
});

export const batchItemCounter = new Counter({
  name: "batch_items_processed_total",
  help: "Total items processed in batches",
  labelNames: ["endpoint", "status"],
});

export const batchQueueLength = new Gauge({
  name: "batch_queue_length",
  help: "Number of pending batch jobs",
});

// ============ Webhook Metrics ============

export const webhookDeliveryDuration = new Histogram({
  name: "webhook_delivery_duration_seconds",
  help: "Webhook delivery duration in seconds",
  labelNames: ["event_type", "status"],
  buckets: [0.1, 0.5, 1.0, 5.0, 10.0],
});

export const webhookDeliveryCounter = new Counter({
  name: "webhook_deliveries_total",
  help: "Total webhook deliveries",
  labelNames: ["event_type", "status"],
});

export const webhookQueueLength = new Gauge({
  name: "webhook_queue_length",
  help: "Number of pending webhook events",
});

// ============ Cache Metrics ============

export const cacheHitCounter = new Counter({
  name: "cache_hits_total",
  help: "Total cache hits",
  labelNames: ["cache_type"],
});

export const cacheMissCounter = new Counter({
  name: "cache_misses_total",
  help: "Total cache misses",
  labelNames: ["cache_type"],
});

export const cacheRefreshDuration = new Histogram({
  name: "cache_refresh_duration_seconds",
  help: "Cache refresh duration in seconds",
  labelNames: ["cache_type"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0],
});

// ============ Database Metrics ============

export const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});

export const dbConnectionCount = new Gauge({
  name: "db_connections_active",
  help: "Active database connections",
});

export const dbTransactionCounter = new Counter({
  name: "db_transactions_total",
  help: "Total database transactions",
  labelNames: ["status"],
});

// ============ Helper Functions ============

export function recordApiRequest(
  method: string,
  endpoint: string,
  status: number,
  duration: number,
) {
  apiRequestDuration
    .labels(method, endpoint, status.toString())
    .observe(duration);
  apiRequestCounter.labels(method, endpoint, status.toString()).inc();

  if (status >= 400) {
    apiErrorCounter.labels(method, endpoint, `http_${status}`).inc();
  }
}

export function recordBatchJob(
  endpoint: string,
  status: "success" | "failed" | "partial_failed",
  duration: number,
) {
  batchJobDuration.labels(endpoint, status).observe(duration);
  batchJobCounter.labels(endpoint, status).inc();
}

export function recordBatchItems(
  endpoint: string,
  successCount: number,
  failedCount: number,
) {
  if (successCount > 0) {
    batchItemCounter.labels(endpoint, "success").inc(successCount);
  }
  if (failedCount > 0) {
    batchItemCounter.labels(endpoint, "failed").inc(failedCount);
  }
}

export function recordWebhookDelivery(
  eventType: string,
  status: "success" | "failed" | "retry",
  duration: number,
) {
  webhookDeliveryDuration.labels(eventType, status).observe(duration);
  webhookDeliveryCounter.labels(eventType, status).inc();
}

export function recordCacheHit(cacheType: string) {
  cacheHitCounter.labels(cacheType).inc();
}

export function recordCacheMiss(cacheType: string) {
  cacheMissCounter.labels(cacheType).inc();
}

export function recordCacheRefresh(cacheType: string, duration: number) {
  cacheRefreshDuration.labels(cacheType).observe(duration);
}

export function recordDbQuery(operation: string, duration: number) {
  dbQueryDuration.labels(operation).observe(duration);
}

export function recordDbTransaction(status: "commit" | "rollback") {
  dbTransactionCounter.labels(status).inc();
}

export function updateDbConnections(count: number) {
  dbConnectionCount.set(count);
}

export function updateBatchQueueLength(count: number) {
  batchQueueLength.set(count);
}

export function updateWebhookQueueLength(count: number) {
  webhookQueueLength.set(count);
}

export function updateSystemMetrics() {
  const memUsage = process.memoryUsage();
  heapUsage.labels("used").set(memUsage.heapUsed);
  heapUsage.labels("limit").set(memUsage.heapTotal);
}

const heapUsage = new Gauge({
  name: "nodejs_heap_size_bytes",
  help: "Node.js heap size in bytes",
  labelNames: ["type"],
});

export async function getMetricsString(): Promise<string> {
  updateSystemMetrics();
  return register.metrics();
}

// ============ Test-Friendly Metrics Collector ============

interface MetricsState {
  rateLimitHits: number;
  rateLimitResets: number[]; // Array of reset times in milliseconds from now
  webhookDeliveries: { success: number; failed: number };
}

class MetricsCollector {
  private state: MetricsState = {
    rateLimitHits: 0,
    rateLimitResets: [],
    webhookDeliveries: { success: 0, failed: 0 },
  };

  recordRateLimitHit(userId: string, endpoint: string, resetAt: Date): void {
    this.state.rateLimitHits++;
    const now = Date.now();
    const resetMs = Math.max(0, resetAt.getTime() - now);
    this.state.rateLimitResets.push(resetMs);
  }

  recordWebhookDelivery(success: boolean): void {
    if (success) {
      this.state.webhookDeliveries.success++;
    } else {
      this.state.webhookDeliveries.failed++;
    }
  }

  getRateLimitHitsTotal(): number {
    return this.state.rateLimitHits;
  }

  getWebhookSuccessRate(): number {
    const total =
      this.state.webhookDeliveries.success +
      this.state.webhookDeliveries.failed;
    if (total === 0) return 1.0; // Default to 1.0 when no deliveries
    return this.state.webhookDeliveries.success / total;
  }

  getAverageRateLimitResetSeconds(): number {
    if (this.state.rateLimitResets.length === 0) return 0;
    const sum = this.state.rateLimitResets.reduce((a, b) => a + b, 0);
    return sum / this.state.rateLimitResets.length / 1000; // Convert ms to seconds
  }

  formatPrometheus(): string {
    const lines: string[] = [];

    // Rate limit hits
    lines.push("# HELP rate_limit_hits_total Total rate limit hits");
    lines.push("# TYPE rate_limit_hits_total counter");
    lines.push(`rate_limit_hits_total ${this.state.rateLimitHits}`);
    lines.push("");

    // Rate limit reset seconds
    const avgReset = this.getAverageRateLimitResetSeconds();
    lines.push(
      "# HELP rate_limit_reset_seconds Average seconds until rate limit reset",
    );
    lines.push("# TYPE rate_limit_reset_seconds gauge");
    lines.push(`rate_limit_reset_seconds ${avgReset.toFixed(2)}`);
    lines.push("");

    // Webhook success rate
    lines.push(
      "# HELP webhook_delivery_success_rate Webhook delivery success rate",
    );
    lines.push("# TYPE webhook_delivery_success_rate gauge");
    lines.push(
      `webhook_delivery_success_rate ${this.getWebhookSuccessRate().toFixed(2)}`,
    );
    lines.push("");

    return lines.join("\n");
  }

  getSnapshot(): {
    timestamp: number;
    rateLimitHits: number;
    webhookSuccessRate: number;
  } {
    return {
      timestamp: Date.now(),
      rateLimitHits: this.state.rateLimitHits,
      webhookSuccessRate: this.getWebhookSuccessRate(),
    };
  }

  reset(): void {
    this.state = {
      rateLimitHits: 0,
      rateLimitResets: [],
      webhookDeliveries: { success: 0, failed: 0 },
    };
  }
}

export const metricsCollector = new MetricsCollector();

logger.info("Metrics collector initialized");
