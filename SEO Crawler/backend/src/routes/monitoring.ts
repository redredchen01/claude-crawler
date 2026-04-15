import { Hono } from "hono";
import { metricsService } from "../services/metricsService";
import { healthCheckService } from "../services/healthCheckService";
import { loggerService } from "../services/loggerService";

const router = new Hono();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * Used by Prometheus scraper or monitoring dashboards
 */
router.get("/metrics", async (c) => {
  try {
    const metrics = await metricsService.getMetrics();
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.text(metrics);
  } catch (error) {
    loggerService.logError(error as Error, "Failed to get metrics");
    return c.json({ error: "Failed to get metrics" }, 500);
  }
});

/**
 * GET /health
 * Liveness probe - Is the service alive?
 * Return 200 OK if service is running, 503 only on fatal errors
 */
router.get("/health", async (c) => {
  try {
    const alive = await healthCheckService.isAlive();
    if (alive) {
      return c.json(
        {
          status: "alive",
          timestamp: new Date().toISOString(),
        },
        200,
      );
    } else {
      return c.json(
        {
          status: "not_alive",
          timestamp: new Date().toISOString(),
        },
        503,
      );
    }
  } catch (error) {
    loggerService.logError(error as Error, "Liveness check failed");
    return c.json({ status: "error", message: "Liveness check failed" }, 503);
  }
});

/**
 * GET /ready
 * Readiness probe - Is the service ready to accept traffic?
 * Return 200 OK if ready, 503 if dependencies are unavailable
 */
router.get("/ready", async (c) => {
  try {
    const ready = await healthCheckService.isReady();
    if (ready) {
      return c.json(
        {
          status: "ready",
          timestamp: new Date().toISOString(),
        },
        200,
      );
    } else {
      return c.json(
        {
          status: "not_ready",
          timestamp: new Date().toISOString(),
        },
        503,
      );
    }
  } catch (error) {
    loggerService.logError(error as Error, "Readiness check failed");
    return c.json({ status: "error", message: "Readiness check failed" }, 503);
  }
});

/**
 * GET /status
 * Detailed health status - All system information
 * Includes uptime, memory, database, API status, and alerts
 */
router.get("/status", async (c) => {
  try {
    const health = await healthCheckService.performHealthCheck();
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;

    return c.json(
      {
        ...health,
        uptime: healthCheckService.getUptimeFormatted(),
      },
      statusCode,
    );
  } catch (error) {
    loggerService.logError(error as Error, "Health check failed");
    return c.json({ error: "Health check failed" }, 500);
  }
});

/**
 * GET /metrics/summary
 * Human-readable metrics summary
 * Shows key metrics and their current values
 */
router.get("/metrics/summary", async (c) => {
  try {
    const lastHealth = healthCheckService.getLastHealthCheck();

    return c.json(
      {
        service: "seo-crawler-backend",
        timestamp: new Date().toISOString(),
        uptime: {
          milliseconds: healthCheckService.getUptime(),
          formatted: healthCheckService.getUptimeFormatted(),
        },
        health: lastHealth || {
          status: "checking",
          message: "No recent health check",
        },
        metrics: {
          registered: metricsService.getMetricNames().length,
          categories: [
            "http_requests",
            "database_queries",
            "claude_api",
            "jobs",
            "webhooks",
            "cache",
            "errors",
          ],
        },
      },
      200,
    );
  } catch (error) {
    loggerService.logError(error as Error, "Failed to get metrics summary");
    return c.json({ error: "Failed to get metrics summary" }, 500);
  }
});

export default router;
