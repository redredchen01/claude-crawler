/**
 * TDK Optimizer API Endpoints
 *
 * Hono routes for TDK generation and management
 * Integrated with Phase 6 contentPlans system
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { Context } from "hono";

import { db } from "../db";
import { contentPlans } from "../db/schema";
import { RuleBasedTdkGenerator } from "../services/tdk/ruleBasedTdkGenerator";
import { TdkValidatorService } from "../services/tdk/tdkValidatorService";
import { SerpComparisonService } from "../services/serp/serpComparisonService";
import { FeedbackService } from "../services/feedback/feedbackService";
import { AggregationService } from "../services/multipage/aggregationService";
import {
  CostTrackingService,
  rateLimitMiddleware,
  recordCostMiddleware,
} from "../middleware/costTracking";
import { getSerpDataProvider } from "../services/tdk/serpDataProvider";
import { requireAuth } from "../middleware/auth";
import type { Language } from "../services/tdk/tdkRules";

/**
 * Validation schemas
 */
const GenerateRequestSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(200, "Topic too long"),
  keywords: z.array(z.string()).min(0).max(20),
  contentSnippet: z.string().optional(),
  language: z.enum(["en", "zh"]).default("en"),
});

const SaveRequestSchema = z.object({
  userTdkJson: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }),
});

const GenerateRequest = GenerateRequestSchema;
const SaveRequest = SaveRequestSchema;

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
type SaveRequest = z.infer<typeof SaveRequestSchema>;

/**
 * Response types
 */
export interface TdkGenerationResponse {
  success: boolean;
  data?: {
    primary: {
      candidate: {
        title: string;
        description: string;
        keywords: string[];
      };
      validation: {
        severity: "pass" | "warn" | "fail";
        issues: Array<{
          field: string;
          message: string;
          severity: string;
        }>;
      };
    };
    alternatives: Array<{
      candidate: {
        title: string;
        description: string;
        keywords: string[];
      };
      validation: {
        severity: "pass" | "warn" | "fail";
        issues: Array<{
          field: string;
          message: string;
          severity: string;
        }>;
      };
    }>;
    metadata: {
      generatedAt: string;
      language: Language;
      modelVersion: string;
      tokensUsed: number;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface TdkSaveResponse {
  success: boolean;
  data?: {
    contentPlanId: string;
    userTdkJson: {
      title?: string;
      description?: string;
      keywords?: string[];
      editedAt: string;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Create TDK API router
 * Uses rule-based TDK generation (no external API required)
 */
export function createTdkRouter(validator?: TdkValidatorService): Hono {
  const router = new Hono();

  // Apply authentication middleware
  router.use("/*", requireAuth);

  // Apply rate limiting middleware
  router.use("/projects/*", rateLimitMiddleware);
  router.use("/projects/*", recordCostMiddleware);

  // Initialize validator service
  const tdkValidator = validator || new TdkValidatorService();

  /**
   * POST /api/projects/:projectId/clusters/:clusterId/tdk-optimize
   *
   * Generate TDK recommendations and save to database
   */
  router.post(
    "/projects/:projectId/clusters/:clusterId/tdk-optimize",
    async (c: Context) => {
      try {
        // Parse and validate request
        const body = await c.req.json();
        const request = GenerateRequest.parse(body);

        // Extract path parameters
        const projectId = c.req.param("projectId");
        const clusterId = c.req.param("clusterId");

        if (!projectId || !clusterId) {
          return c.json(
            {
              success: false,
              error: {
                message: "projectId and clusterId are required",
                code: "MISSING_PARAMETERS",
              },
            },
            400,
          );
        }

        // Verify cluster exists
        const cluster = await db
          .select({ id: contentPlans.id })
          .from(contentPlans)
          .where(eq(contentPlans.id, clusterId))
          .get();

        if (!cluster) {
          return c.json(
            {
              success: false,
              error: {
                message: "Content plan not found",
                code: "NOT_FOUND",
              },
            },
            404,
          );
        }

        // Generate TDK using rule-based engine (no API key required)
        const generationResult = RuleBasedTdkGenerator.generateRecommendations(
          request.topic,
          request.keywords,
          request.contentSnippet,
          request.language,
        );

        // Validate each candidate
        const validationReports = tdkValidator.validateBatch(
          [generationResult.primary, ...generationResult.alternatives],
          request.contentSnippet,
          request.language,
        );

        // Save TDK to database
        const now = new Date().toISOString();
        const tdkJson = {
          primary: generationResult.primary,
          alternatives: generationResult.alternatives,
          metadata: {
            generatedAt: now,
            language: request.language,
            modelVersion: generationResult.metadata.modelVersion,
            tokensUsed: generationResult.metadata.tokensUsed,
          },
        };

        const tdkInput = {
          topic: request.topic,
          keywords: request.keywords,
          contentSnippet: request.contentSnippet,
        };

        await db
          .update(contentPlans)
          .set({
            tdkJson: JSON.stringify(tdkJson),
            tdkInputJson: JSON.stringify(tdkInput),
            tdkGeneratedAt: now,
            tdkLanguage: request.language,
            tdkGenerationCount: sql`${contentPlans.tdkGenerationCount} + 1`,
            updatedAt: now,
            updatedBy: c.get("userId"),
          })
          .where(eq(contentPlans.id, clusterId));

        // Format response
        const response: TdkGenerationResponse = {
          success: true,
          data: {
            primary: {
              candidate: generationResult.primary,
              validation: {
                severity: validationReports[0].severity,
                issues: validationReports[0].issues.map((issue) => ({
                  field: issue.field,
                  message: issue.message,
                  severity: issue.severity,
                })),
              },
            },
            alternatives: generationResult.alternatives.map(
              (candidate, idx) => ({
                candidate,
                validation: {
                  severity: validationReports[idx + 1].severity,
                  issues: validationReports[idx + 1].issues.map((issue) => ({
                    field: issue.field,
                    message: issue.message,
                    severity: issue.severity,
                  })),
                },
              }),
            ),
            metadata: {
              generatedAt: generationResult.metadata.generatedAt.toISOString(),
              language: generationResult.metadata.language,
              modelVersion: generationResult.metadata.modelVersion,
              tokensUsed: generationResult.metadata.tokensUsed,
            },
          },
        };

        return c.json(response, 200);
      } catch (error) {
        // Handle validation errors
        if (error instanceof z.ZodError) {
          return c.json(
            {
              success: false,
              error: {
                message: `Validation error: ${error.errors[0]?.message || "Invalid request"}`,
                code: "VALIDATION_ERROR",
              },
            },
            400,
          );
        }

        // Handle API errors
        if (
          error instanceof Error &&
          error.message.includes("Failed to generate")
        ) {
          return c.json(
            {
              success: false,
              error: {
                message: "Failed to generate TDK. Please try again later.",
                code: "GENERATION_ERROR",
              },
            },
            500,
          );
        }

        // Generic error
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
   * POST /api/projects/:projectId/clusters/:clusterId/tdk-save
   *
   * Save user-edited TDK
   */
  router.post(
    "/projects/:projectId/clusters/:clusterId/tdk-save",
    async (c: Context) => {
      try {
        // Parse and validate request
        const body = await c.req.json();
        const request = SaveRequest.parse(body);

        // Extract path parameters
        const projectId = c.req.param("projectId");
        const clusterId = c.req.param("clusterId");

        if (!projectId || !clusterId) {
          return c.json(
            {
              success: false,
              error: {
                message: "projectId and clusterId are required",
                code: "MISSING_PARAMETERS",
              },
            },
            400,
          );
        }

        // Verify cluster exists
        const cluster = await db
          .select({ id: contentPlans.id })
          .from(contentPlans)
          .where(eq(contentPlans.id, clusterId))
          .get();

        if (!cluster) {
          return c.json(
            {
              success: false,
              error: {
                message: "Content plan not found",
                code: "NOT_FOUND",
              },
            },
            404,
          );
        }

        // Prepare user TDK with editedAt timestamp
        const now = new Date().toISOString();
        const userTdkJson = {
          ...request.userTdkJson,
          editedAt: now,
        };

        // Update database
        await db
          .update(contentPlans)
          .set({
            userTdkJson: JSON.stringify(userTdkJson),
            updatedAt: now,
            updatedBy: c.get("userId"),
          })
          .where(eq(contentPlans.id, clusterId));

        const response: TdkSaveResponse = {
          success: true,
          data: {
            contentPlanId: clusterId,
            userTdkJson,
          },
        };

        return c.json(response, 200);
      } catch (error) {
        // Handle validation errors
        if (error instanceof z.ZodError) {
          return c.json(
            {
              success: false,
              error: {
                message: `Validation error: ${error.errors[0]?.message || "Invalid request"}`,
                code: "VALIDATION_ERROR",
              },
            },
            400,
          );
        }

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
   * GET /api/projects/:projectId/clusters/:clusterId/tdk
   *
   * Retrieve current TDK for a contentPlan
   */
  router.get(
    "/projects/:projectId/clusters/:clusterId/tdk",
    async (c: Context) => {
      try {
        const projectId = c.req.param("projectId");
        const clusterId = c.req.param("clusterId");

        if (!projectId || !clusterId) {
          return c.json(
            {
              success: false,
              error: {
                message: "projectId and clusterId are required",
                code: "MISSING_PARAMETERS",
              },
            },
            400,
          );
        }

        // Fetch from database
        const contentPlan = await db
          .select({
            id: contentPlans.id,
            tdkJson: contentPlans.tdkJson,
            userTdkJson: contentPlans.userTdkJson,
            tdkValidations: contentPlans.tdkValidations,
            tdkGeneratedAt: contentPlans.tdkGeneratedAt,
            tdkLanguage: contentPlans.tdkLanguage,
            tdkGenerationCount: contentPlans.tdkGenerationCount,
          })
          .from(contentPlans)
          .where(eq(contentPlans.id, clusterId))
          .get();

        if (!contentPlan) {
          return c.json(
            {
              success: false,
              error: {
                message: "Content plan not found",
                code: "NOT_FOUND",
              },
            },
            404,
          );
        }

        // Parse JSON fields
        const tdkJson = contentPlan.tdkJson
          ? JSON.parse(contentPlan.tdkJson)
          : null;
        const userTdkJson = contentPlan.userTdkJson
          ? JSON.parse(contentPlan.userTdkJson)
          : null;
        const tdkValidations = contentPlan.tdkValidations
          ? JSON.parse(contentPlan.tdkValidations)
          : null;

        return c.json(
          {
            success: true,
            data: {
              contentPlanId: contentPlan.id,
              tdkJson,
              userTdkJson,
              tdkValidations,
              tdkGeneratedAt: contentPlan.tdkGeneratedAt,
              tdkLanguage: contentPlan.tdkLanguage,
              tdkGenerationCount: contentPlan.tdkGenerationCount,
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

  /**
   * GET /api/projects/:projectId/clusters/:clusterId/tdk/serp-comparison
   *
   * Compare generated TDK with SERP results for the query
   */
  router.get(
    "/projects/:projectId/clusters/:clusterId/tdk/serp-comparison",
    async (c: Context) => {
      try {
        const projectId = c.req.param("projectId");
        const clusterId = c.req.param("clusterId");

        if (!projectId || !clusterId) {
          return c.json(
            {
              success: false,
              error: {
                message: "projectId and clusterId are required",
                code: "MISSING_PARAMETERS",
              },
            },
            400,
          );
        }

        // Fetch content plan with TDK
        const plan = await db
          .select({
            id: contentPlans.id,
            tdkJson: contentPlans.tdkJson,
            userTdkJson: contentPlans.userTdkJson,
            tdkLanguage: contentPlans.tdkLanguage,
          })
          .from(contentPlans)
          .where(eq(contentPlans.id, clusterId))
          .get();

        if (!plan) {
          return c.json(
            {
              success: false,
              error: {
                message: "Content plan not found",
                code: "NOT_FOUND",
              },
            },
            404,
          );
        }

        // Check if TDK has been generated
        if (!plan.tdkJson) {
          return c.json(
            {
              success: false,
              error: {
                message: "No TDK generated yet",
                code: "NO_TDK",
              },
            },
            400,
          );
        }

        // Parse TDK JSON
        const tdkJson = JSON.parse(plan.tdkJson);
        const primary = tdkJson.primary;

        // Get SERP data provider and fetch results
        const serpProvider = getSerpDataProvider();
        const serpResults = await serpProvider.querySERP(
          primary.title,
          plan.tdkLanguage || "en",
        );

        // Compare TDK with SERP results
        const comparison = SerpComparisonService.compareWithSerp(
          primary,
          serpResults.results,
          clusterId,
        );

        // Optional: Save SERP snapshot to database
        const now = new Date().toISOString();
        await db
          .update(contentPlans)
          .set({
            serpDataJson: JSON.stringify(serpResults.results),
            lastSerpFetchedAt: now,
            updatedAt: now,
            updatedBy: c.get("userId"),
          })
          .where(eq(contentPlans.id, clusterId));

        return c.json(
          {
            success: true,
            data: {
              clusterId,
              comparison,
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

  /**
   * POST /api/projects/:projectId/clusters/:clusterId/feedback
   *
   * Submit user feedback on generated TDK
   */
  router.post(
    "/projects/:projectId/clusters/:clusterId/feedback",
    async (c: Context) => {
      try {
        const projectId = c.req.param("projectId");
        const clusterId = c.req.param("clusterId");
        const userId = c.get("userId");

        if (!projectId || !clusterId) {
          return c.json(
            {
              success: false,
              error: {
                message: "projectId and clusterId are required",
                code: "MISSING_PARAMETERS",
              },
            },
            400,
          );
        }

        // Parse and validate request
        const body = await c.req.json();
        const feedbackSchema = z.object({
          type: z.enum(["positive", "negative"]),
          feedbackText: z.string().max(500).optional(),
          serpSnapshot: z.record(z.any()).optional(),
        });

        const feedback = feedbackSchema.parse(body);

        // Record feedback
        const feedbackId = await FeedbackService.record({
          contentPlanId: clusterId,
          projectId,
          type: feedback.type,
          feedbackText: feedback.feedbackText,
          serpSnapshot: feedback.serpSnapshot,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        });

        return c.json(
          {
            success: true,
            data: {
              feedbackId,
              recorded: true,
            },
          },
          200,
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json(
            {
              success: false,
              error: {
                message: `Validation error: ${error.errors[0]?.message || "Invalid request"}`,
                code: "VALIDATION_ERROR",
              },
            },
            400,
          );
        }

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
   * GET /api/projects/:projectId/feedback/stats
   *
   * Get feedback statistics for a project
   */
  router.get("/projects/:projectId/feedback/stats", async (c: Context) => {
    try {
      const projectId = c.req.param("projectId");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "projectId is required",
              code: "MISSING_PARAMETERS",
            },
          },
          400,
        );
      }

      const stats = await FeedbackService.getProjectStats(projectId);

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
  });

  /**
   * GET /api/projects/:projectId/tdk-summary
   *
   * Get summary of all clusters' TDK status for a project
   */
  router.get("/projects/:projectId/tdk-summary", async (c: Context) => {
    try {
      const projectId = c.req.param("projectId");

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "projectId is required",
              code: "MISSING_PARAMETERS",
            },
          },
          400,
        );
      }

      const clusters = await db
        .select({
          clusterId: contentPlans.clusterId,
          title: contentPlans.title,
          tdkGenerationCount: contentPlans.tdkGenerationCount,
          tdkGeneratedAt: contentPlans.tdkGeneratedAt,
          tdkLanguage: contentPlans.tdkLanguage,
          tdkJson: contentPlans.tdkJson,
        })
        .from(contentPlans)
        .where(eq(contentPlans.projectId, projectId));

      const summary = {
        projectId,
        totalClusters: clusters.length,
        clustersWithTdk: clusters.filter((c) => (c.tdkGenerationCount ?? 0) > 0)
          .length,
        clusters: clusters.map((c) => {
          const tdkData = c.tdkJson ? JSON.parse(c.tdkJson) : null;
          return {
            clusterId: c.clusterId,
            title: c.title,
            hasGenerated: (c.tdkGenerationCount ?? 0) > 0,
            generationCount: c.tdkGenerationCount ?? 0,
            generatedAt: c.tdkGeneratedAt,
            language: c.tdkLanguage,
            keywords: tdkData?.keywords || [],
            keywordCount: tdkData?.keywords?.length || 0,
          };
        }),
      };

      return c.json(
        {
          success: true,
          data: summary,
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
   * GET /api/projects/:projectId/conflict-report
   *
   * Analyze keyword conflicts across multiple clusters in a project
   */
  router.get("/projects/:projectId/conflict-report", async (c: Context) => {
    try {
      const projectId = c.req.param("projectId");
      const clusterIdsParam = c.req.query("clusterIds");
      const language = (c.req.query("language") || "en") as "en" | "zh";

      if (!projectId) {
        return c.json(
          {
            success: false,
            error: {
              message: "projectId is required",
              code: "MISSING_PARAMETERS",
            },
          },
          400,
        );
      }

      // Fetch all clusters for the project
      const allClusters = await db
        .select({
          clusterId: contentPlans.clusterId,
          title: contentPlans.title,
          tdkJson: contentPlans.tdkJson,
        })
        .from(contentPlans)
        .where(eq(contentPlans.projectId, projectId));

      // Filter by clusterIds if provided
      let clusters = allClusters;
      if (clusterIdsParam) {
        const ids = clusterIdsParam.split(",");
        clusters = allClusters.filter((c) => ids.includes(c.clusterId));
      }

      // Extract keywords from TDK data
      const contents = clusters
        .filter((c) => c.tdkJson)
        .map((c) => {
          const tdkData = JSON.parse(c.tdkJson!);
          return {
            clusterId: c.clusterId,
            keywords: tdkData.keywords || [],
          };
        });

      // Detect conflicts using AggregationService
      const detectedConflicts = AggregationService.realTimeConflictDetection(
        contents,
        language,
      );

      // Calculate topic coherence
      const coherence = AggregationService.calculateTopicCoherence(
        contents,
        language,
      );

      // Generate recommendation
      const recommendation =
        AggregationService.generateConflictRecommendation(detectedConflicts);

      // Summarize conflicts by severity
      const conflictSummary = {
        total: detectedConflicts.length,
        highSeverity: detectedConflicts.filter((c) => c.severity === "high")
          .length,
        mediumSeverity: detectedConflicts.filter((c) => c.severity === "medium")
          .length,
        lowSeverity: detectedConflicts.filter((c) => c.severity === "low")
          .length,
        details: detectedConflicts,
      };

      return c.json(
        {
          success: true,
          data: {
            projectId,
            analysisTime: new Date().toISOString(),
            language,
            clustersAnalyzed: clusters.length,
            conflictCount: detectedConflicts.length,
            conflicts: conflictSummary,
            topicCoherence: coherence,
            recommendation,
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
  });

  /**
   * GET /api/cost-summary
   *
   * Get user's API usage and cost summary
   */
  router.get("/cost-summary", async (c: Context) => {
    try {
      const userId = c.get("userId");

      if (!userId) {
        return c.json(
          {
            success: false,
            error: {
              message: "userId is required",
              code: "MISSING_USER",
            },
          },
          400,
        );
      }

      const summary = CostTrackingService.getCostSummary(userId);
      const remaining = CostTrackingService.getRemainingRequests(userId);

      return c.json(
        {
          success: true,
          data: {
            userId,
            ...summary,
            remainingRequests: remaining,
            requestsPerHour: 100,
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
  });

  return router;
}

/**
 * Export router creator function
 */
export function createDefaultTdkRouter(validator?: TdkValidatorService): Hono {
  return createTdkRouter(validator);
}
