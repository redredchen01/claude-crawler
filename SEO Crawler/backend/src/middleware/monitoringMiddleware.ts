import { Context, Next } from "hono";
import { metricsService } from "../services/metricsService";
import { loggerService } from "../services/loggerService";
import { getUserId } from "../auth/middleware";

/**
 * Monitoring Middleware - Collect metrics and logs for all HTTP requests
 */
export async function monitoringMiddleware(
  c: Context,
  next: Next,
): Promise<void> {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const userId = getUserId(c);

  // Log incoming request
  loggerService.logRequest(method, path, userId ?? undefined);

  try {
    // Process request
    await next();

    // Get response status
    const status = c.res.status;
    const duration = Date.now() - startTime;

    // Record metrics
    metricsService.recordHttpRequest(method, path, status, duration);

    // Log response
    loggerService.logResponse(
      method,
      path,
      status,
      duration,
      userId ?? undefined,
    );

    // Alert on slow requests (>5 seconds)
    loggerService.logPerformanceWarning(`${method} ${path}`, duration, 5000, {
      userId,
      status,
    });
  } catch (error) {
    // Handle errors
    const status = 500;
    const duration = Date.now() - startTime;

    metricsService.recordHttpRequest(method, path, status, duration);
    metricsService.recordError(
      error instanceof Error ? error.constructor.name : "UnknownError",
      path,
    );

    loggerService.logError(
      error as Error,
      `HTTP ${method} ${path}`,
      userId ?? undefined,
      {
        duration,
        status,
      },
    );

    throw error;
  }
}
