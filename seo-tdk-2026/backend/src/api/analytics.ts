/**
 * Analytics Dashboard API
 *
 * Integrates P4.1-P4.4 analytics services into unified dashboard endpoints
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { AnalyticsService } from "../services/analytics/analyticsService.js";
import { RecommendationEngine } from "../services/recommendations/recommendationEngine.js";
import { cacheService } from "../services/cache/cacheService.js";
import { taskQueue } from "../services/queue/taskQueue.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { contentPlans } from "../db/schema.js";
import type { Language } from "../services/tdk/tdkRules.js";

/**
 * Create analytics router
 */
function createAnalyticsRouter() {
  const router = new Hono();

  // Require authentication on all analytics endpoints
  router.use("/*", requireAuth);

  /**
   * GET /api/projects/:projectId/analytics/overview
   *
   * Get comprehensive project analytics overview
   */
  router.get("/projects/:projectId/analytics/overview", async (c: Context) => {
    const projectId = c.req.param("projectId");
    const language = (c.req.query("language") || "en") as Language;

    if (!projectId) {
      return c.json(
        {
          success: false,
          error: {
            message: "Missing projectId",
            code: "MISSING_PARAMS",
          },
        },
        400,
      );
    }

    try {
      // Check cache first
      const cacheKey = `analytics:overview:${projectId}:${language}`;
      let analytics = cacheService.get<unknown>(cacheKey);

      if (!analytics) {
        // Fetch fresh data
        analytics = await AnalyticsService.getProjectAnalytics(
          projectId,
          language,
        );

        // Cache for 5 minutes
        cacheService.set(cacheKey, analytics, 5);
      }

      return c.json(
        {
          success: true,
          data: analytics,
        },
        200,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        {
          success: false,
          error: {
            message: errorMessage,
            code: "INTERNAL_ERROR",
          },
        },
        500,
      );
    }
  });

  /**
   * GET /api/projects/:projectId/analytics/cluster-scores
   *
   * Get cluster performance scores and recommendations
   */
  router.get(
    "/projects/:projectId/analytics/cluster-scores",
    async (c: Context) => {
      const projectId = c.req.param("projectId");
      const language = (c.req.query("language") || "en") as Language;
      const limit = parseInt(c.req.query("limit") || "20");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "Missing projectId",
              code: "MISSING_PARAMS",
            },
          },
          400,
        );
      }

      try {
        const cacheKey = `analytics:scores:${projectId}:${language}`;
        let scores = cacheService.get<unknown[]>(cacheKey);

        if (!scores) {
          scores = await AnalyticsService.getClusterScoring(
            projectId,
            language,
          );
          cacheService.set(cacheKey, scores, 5);
        }

        return c.json(
          {
            success: true,
            data: (scores as unknown[]).slice(0, limit),
          },
          200,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "INTERNAL_ERROR",
            },
          },
          500,
        );
      }
    },
  );

  /**
   * GET /api/projects/:projectId/analytics/recommendations
   *
   * Get actionable recommendations
   */
  router.get(
    "/projects/:projectId/analytics/recommendations",
    async (c: Context) => {
      const projectId = c.req.param("projectId");
      const language = (c.req.query("language") || "en") as Language;
      const type = c.req.query("type"); // Optional filter: merge|differentiate|high-value-keyword

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "Missing projectId",
              code: "MISSING_PARAMS",
            },
          },
          400,
        );
      }

      try {
        const cacheKey = `analytics:recommendations:${projectId}:${language}:${type || "all"}`;
        let recommendations = cacheService.get<unknown[]>(cacheKey);

        if (!recommendations) {
          recommendations =
            await RecommendationEngine.getProjectRecommendations(
              projectId,
              language,
            );

          // Filter by type if specified
          if (type) {
            recommendations = (recommendations as unknown[]).filter(
              (r: unknown) => (r as { type: string }).type === type,
            );
          }

          cacheService.set(cacheKey, recommendations, 10);
        }

        return c.json(
          {
            success: true,
            data: recommendations,
          },
          200,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "INTERNAL_ERROR",
            },
          },
          500,
        );
      }
    },
  );

  /**
   * GET /api/projects/:projectId/analytics/timeseries
   *
   * Get time series analytics
   */
  router.get(
    "/projects/:projectId/analytics/timeseries",
    async (c: Context) => {
      const projectId = c.req.param("projectId");
      const days = parseInt(c.req.query("days") || "30");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "Missing projectId",
              code: "MISSING_PARAMS",
            },
          },
          400,
        );
      }

      try {
        const cacheKey = `analytics:timeseries:${projectId}:${days}`;
        let stats = cacheService.get<unknown[]>(cacheKey);

        if (!stats) {
          stats = await AnalyticsService.getTimeSeriesStats(projectId, days);
          cacheService.set(cacheKey, stats, 30);
        }

        return c.json(
          {
            success: true,
            data: stats,
          },
          200,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "INTERNAL_ERROR",
            },
          },
          500,
        );
      }
    },
  );

  /**
   * GET /api/projects/:projectId/analytics/batch-tasks
   *
   * Get status of batch processing tasks
   */
  router.get(
    "/projects/:projectId/analytics/batch-tasks",
    async (c: Context) => {
      const projectId = c.req.param("projectId");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "Missing projectId",
              code: "MISSING_PARAMS",
            },
          },
          400,
        );
      }

      try {
        const allTasks = taskQueue.getAllTasks();
        const projectTasks = allTasks.filter((t) => t.projectId === projectId);

        return c.json(
          {
            success: true,
            data: projectTasks.map((task) => ({
              taskId: task.id,
              status: task.status,
              progress: task.progress,
              createdAt: task.createdAt.toISOString(),
              startedAt: task.startedAt?.toISOString(),
              completedAt: task.completedAt?.toISOString(),
              clusterCount: task.clusterIds.length,
            })),
          },
          200,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "INTERNAL_ERROR",
            },
          },
          500,
        );
      }
    },
  );

  /**
   * POST /api/projects/:projectId/analytics/invalidate-cache
   *
   * Manually invalidate analytics cache (internal use)
   */
  router.post(
    "/projects/:projectId/analytics/invalidate-cache",
    async (c: Context) => {
      const projectId = c.req.param("projectId");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "Missing projectId",
              code: "MISSING_PARAMS",
            },
          },
          400,
        );
      }

      try {
        const pattern = `analytics:*:${projectId}:*`;
        const count = cacheService.invalidate(pattern);

        return c.json(
          {
            success: true,
            data: {
              invalidatedCount: count,
            },
          },
          200,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "INTERNAL_ERROR",
            },
          },
          500,
        );
      }
    },
  );

  return router;
}

/**
 * Export router for mounting in main app
 */
export const analyticsRouter = createAnalyticsRouter();
