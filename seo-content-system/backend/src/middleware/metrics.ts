import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  register,
} from "prom-client";

// Default Node.js metrics (CPU, memory, event loop lag)
collectDefaultMetrics({ prefix: "seo_" });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: "seo_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

export const httpRequestDuration = new Histogram({
  name: "seo_http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const jobsTotal = new Counter({
  name: "seo_jobs_total",
  help: "Total keyword jobs processed",
  labelNames: ["status"], // completed | failed
});

export const queueSize = new Gauge({
  name: "seo_queue_size",
  help: "Current queue size (pending + active)",
});

export const keywordsProcessedTotal = new Counter({
  name: "seo_keywords_processed_total",
  help: "Total keywords processed",
});

export { register };
