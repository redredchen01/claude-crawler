import prometheus from "prom-client";

/**
 * Metrics Service - Prometheus metrics collection
 * Tracks API calls, database operations, Claude API usage, error rates
 */
export class MetricsService {
  // HTTP metrics
  private httpRequestDuration = new prometheus.Histogram({
    name: "http_request_duration_ms",
    help: "HTTP request duration in milliseconds",
    labelNames: ["method", "route", "status"],
    buckets: [10, 50, 100, 500, 1000, 5000],
  });

  private httpRequestTotal = new prometheus.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status"],
  });

  // Database metrics
  private dbQueryDuration = new prometheus.Histogram({
    name: "db_query_duration_ms",
    help: "Database query duration in milliseconds",
    labelNames: ["operation", "table"],
    buckets: [1, 5, 10, 50, 100, 500],
  });

  private dbQueryTotal = new prometheus.Counter({
    name: "db_queries_total",
    help: "Total database queries",
    labelNames: ["operation", "table", "status"],
  });

  // Claude API metrics
  private claudeTokensUsed = new prometheus.Counter({
    name: "claude_tokens_used_total",
    help: "Total tokens used from Claude API",
    labelNames: ["type", "analysisType"],
  });

  private claudeRequestDuration = new prometheus.Histogram({
    name: "claude_request_duration_ms",
    help: "Claude API request duration in milliseconds",
    labelNames: ["analysisType"],
    buckets: [100, 500, 1000, 5000, 10000],
  });

  private claudeApiCost = new prometheus.Counter({
    name: "claude_api_cost_usd",
    help: "Cumulative cost of Claude API calls in USD",
    labelNames: ["analysisType"],
  });

  // User metrics
  private activeUsers = new prometheus.Gauge({
    name: "active_users_count",
    help: "Number of active users",
  });

  private usersWithQuotaExceeded = new prometheus.Gauge({
    name: "users_quota_exceeded",
    help: "Number of users with exceeded quota",
  });

  // Job metrics
  private jobsTotal = new prometheus.Counter({
    name: "jobs_total",
    help: "Total jobs created",
    labelNames: ["status"],
  });

  private jobsProcessingTime = new prometheus.Histogram({
    name: "jobs_processing_time_ms",
    help: "Job processing time in milliseconds",
    labelNames: ["status"],
    buckets: [1000, 5000, 10000, 30000, 60000],
  });

  // Webhook metrics
  private webhookDeliveries = new prometheus.Counter({
    name: "webhook_deliveries_total",
    help: "Total webhook delivery attempts",
    labelNames: ["status"],
  });

  private webhookRetries = new prometheus.Counter({
    name: "webhook_retries_total",
    help: "Total webhook retry attempts",
  });

  // Cache metrics
  private cacheHits = new prometheus.Counter({
    name: "cache_hits_total",
    help: "Cache hit count",
    labelNames: ["key"],
  });

  private cacheMisses = new prometheus.Counter({
    name: "cache_misses_total",
    help: "Cache miss count",
    labelNames: ["key"],
  });

  // Error metrics
  private errors = new prometheus.Counter({
    name: "errors_total",
    help: "Total errors",
    labelNames: ["type", "endpoint"],
  });

  // Record HTTP request
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
  ): void {
    this.httpRequestDuration
      .labels(method, route, String(status))
      .observe(duration);
    this.httpRequestTotal.labels(method, route, String(status)).inc();
  }

  // Record database query
  recordDbQuery(
    operation: string,
    table: string,
    status: "success" | "error",
    duration: number,
  ): void {
    this.dbQueryDuration.labels(operation, table).observe(duration);
    this.dbQueryTotal.labels(operation, table, status).inc();
  }

  // Record Claude API usage
  recordClaudeUsage(
    inputTokens: number,
    outputTokens: number,
    analysisType: string,
    costUSD: number,
    duration: number,
  ): void {
    this.claudeTokensUsed.labels("input", analysisType).inc(inputTokens);
    this.claudeTokensUsed.labels("output", analysisType).inc(outputTokens);
    this.claudeApiCost.labels(analysisType).inc(costUSD);
    this.claudeRequestDuration.labels(analysisType).observe(duration);
  }

  // Update active users
  setActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  // Update users with exceeded quota
  setUsersWithQuotaExceeded(count: number): void {
    this.usersWithQuotaExceeded.set(count);
  }

  // Record job creation
  recordJobCreated(status: string): void {
    this.jobsTotal.labels(status).inc();
  }

  // Record job completion
  recordJobCompleted(status: string, duration: number): void {
    this.jobsProcessingTime.labels(status).observe(duration);
  }

  // Record webhook delivery
  recordWebhookDelivery(status: "success" | "failed"): void {
    this.webhookDeliveries.labels(status).inc();
  }

  // Record webhook retry
  recordWebhookRetry(): void {
    this.webhookRetries.inc();
  }

  // Record cache hit/miss
  recordCacheHit(key: string): void {
    this.cacheHits.labels(key).inc();
  }

  recordCacheMiss(key: string): void {
    this.cacheMisses.labels(key).inc();
  }

  // Record error
  recordError(type: string, endpoint: string): void {
    this.errors.labels(type, endpoint).inc();
  }

  // Get all metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return await prometheus.register.metrics();
  }

  // Get metric names
  getMetricNames(): string[] {
    return [
      "http_request_duration_ms",
      "http_requests_total",
      "db_query_duration_ms",
      "db_queries_total",
      "claude_tokens_used_total",
      "claude_request_duration_ms",
      "claude_api_cost_usd",
      "active_users_count",
      "users_quota_exceeded",
      "jobs_total",
      "jobs_processing_time_ms",
      "webhook_deliveries_total",
      "webhook_retries_total",
      "cache_hits_total",
      "cache_misses_total",
      "errors_total",
    ];
  }
}

// Singleton instance
export const metricsService = new MetricsService();
