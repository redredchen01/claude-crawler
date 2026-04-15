/**
 * Clusters API Routes
 * Phase 4.1: Retrieve and manage clusters, generate content plans
 */

import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  keywordClusters,
  clusterMembers,
  keywordCandidates,
  keywordFeatures,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { LLMContentAutomationService } from "../services/llmContentAutomationService.js";
import { contentPlanRepository } from "../services/contentPlanRepository.js";
import { WebhookDeliveryService } from "../services/webhookDeliveryService.js";
import type { Cluster, KeywordFeature } from "../types/index.js";

const router = new Hono();

/**
 * GET /api/clusters?projectId={id}
 * List all clusters for a project
 */
router.get("/", async (c) => {
  try {
    const projectId = c.req.query("projectId");

    if (!projectId) {
      return c.json({ error: "Missing projectId parameter" }, 400);
    }

    const clusters = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.jobId, projectId));

    // Map database results to API response format
    const apiClusters = clusters.map((c) => ({
      id: c.id,
      name: c.cluster_name,
      pillarKeyword: c.pillar_keyword,
      keywords: [], // Will be populated separately if needed
      keywordIds: [],
      memberCount: c.keywords_count || 0,
      pageType: c.page_type,
      priority: c.priority_score || 0,
      createdAt: c.created_at,
      averageSearchVolume: c.avg_search_volume,
      competitionScore: c.avg_competition || 0,
      confidenceScore: 0.85,
    }));

    return c.json({
      clusters: apiClusters,
      total: apiClusters.length,
    });
  } catch (error) {
    console.error("Failed to list clusters:", error);
    return c.json({ error: "Failed to list clusters" }, 500);
  }
});

/**
 * GET /api/clusters/:id
 * Get cluster details
 */
router.get("/:id", async (c) => {
  try {
    const clusterId = c.req.param("id");

    const cluster = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.id, clusterId))
      .limit(1);

    if (cluster.length === 0) {
      return c.json({ error: "Cluster not found" }, 404);
    }

    const clusterData = cluster[0];

    return c.json({
      cluster: {
        id: clusterData.id,
        name: clusterData.cluster_name,
        pillarKeyword: clusterData.pillar_keyword,
        keywords: [],
        keywordIds: [],
        memberCount: clusterData.keywords_count || 0,
        pageType: clusterData.page_type,
        priority: clusterData.priority_score || 0,
        createdAt: clusterData.created_at,
        averageSearchVolume: clusterData.avg_search_volume,
        competitionScore: clusterData.avg_competition || 0,
        confidenceScore: 0.85,
      },
    });
  } catch (error) {
    console.error("Failed to get cluster:", error);
    return c.json({ error: "Failed to get cluster" }, 500);
  }
});

/**
 * GET /api/clusters/:id/keywords
 * Get keywords for a cluster
 */
router.get("/:id/keywords", async (c) => {
  try {
    const clusterId = c.req.param("id");

    // Get cluster members
    const members = await db
      .select()
      .from(clusterMembers)
      .where(eq(clusterMembers.cluster_id, clusterId));

    const keywordIds = members.map((m) => m.keyword_id);

    if (keywordIds.length === 0) {
      return c.json({ keywords: [] });
    }

    // Get keyword features
    const features = await db
      .select()
      .from(keywordFeatures)
      .where(
        and(...keywordIds.map((id) => eq(keywordFeatures.keyword_id, id))),
      );

    const apiKeywords = features.map((f) => ({
      id: f.id,
      raw_keyword: f.raw_keyword || "",
      normalized_keyword: f.normalized_keyword,
      word_count: f.word_count,
      intent_primary: f.intent_primary,
      intent_secondary: f.intent_secondary,
      funnel_stage: f.funnel_stage,
      keyword_type: f.keyword_type,
      content_format_recommendation: f.content_format,
      trend_label: f.trendLabel,
      trend_confidence: f.trendConfidence,
      trend_direction: f.trendDirection,
      competition_score: f.competition_score,
      opportunity_score: f.opportunity_score,
    }));

    return c.json({ keywords: apiKeywords });
  } catch (error) {
    console.error("Failed to get cluster keywords:", error);
    return c.json({ error: "Failed to get cluster keywords" }, 500);
  }
});

/**
 * GET /api/clusters/:id/content-plan
 * Get stored content plan for cluster
 */
router.get("/:id/content-plan", async (c) => {
  try {
    const clusterId = c.req.param("id");

    const plan = await contentPlanRepository.get(clusterId);
    return c.json({
      brief: plan?.brief ?? null,
      faq: plan?.faq ?? null,
      links: plan?.links ?? null,
      status: plan?.status ?? "pending",
      generatedAt: plan?.generatedAt ?? null,
      isUserEdited: plan?.isUserEdited ?? false,
      editedAt: plan?.editedAt ?? null,
      publishedUrl: plan?.publishedUrl ?? null,
      publishedAt: plan?.publishedAt ?? null,
      notes: plan?.notes ?? null,
    });
  } catch (error) {
    console.error("Failed to get content plan:", error);
    return c.json({ error: "Failed to get content plan" }, 500);
  }
});

/**
 * PATCH /api/clusters/:id/content-plan
 * Update user edits and publishing fields for content plan
 */
router.patch("/:id/content-plan", async (c) => {
  try {
    const clusterId = c.req.param("id");

    // Check cluster exists
    const cluster = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.id, clusterId))
      .limit(1);

    if (cluster.length === 0) {
      return c.json({ error: "Cluster not found" }, 404);
    }

    // Check plan exists and get current status
    const existingPlan = await contentPlanRepository.get(clusterId);
    if (!existingPlan) {
      return c.json({ error: "Content plan not found" }, 404);
    }

    // Don't allow updates while generating
    if (existingPlan.status === "generating") {
      return c.json({ error: "Cannot update plan while generating" }, 409);
    }

    // Parse request body
    const body = await c.req.json();

    // Update plan with user edits
    const updatedPlan = await contentPlanRepository.updateUserEdits(clusterId, {
      brief: body.brief,
      faq: body.faq,
      publishedUrl: body.publishedUrl,
      publishedAt: body.publishedAt,
      notes: body.notes,
    });

    return c.json(
      {
        brief: updatedPlan?.brief ?? null,
        faq: updatedPlan?.faq ?? null,
        links: updatedPlan?.links ?? null,
        status: updatedPlan?.status ?? "pending",
        generatedAt: updatedPlan?.generatedAt ?? null,
        isUserEdited: updatedPlan?.isUserEdited ?? false,
        editedAt: updatedPlan?.editedAt ?? null,
        publishedUrl: updatedPlan?.publishedUrl ?? null,
        publishedAt: updatedPlan?.publishedAt ?? null,
        notes: updatedPlan?.notes ?? null,
      },
      200,
    );
  } catch (error) {
    console.error("Failed to update content plan:", error);
    return c.json({ error: "Failed to update content plan" }, 500);
  }
});

/**
 * POST /api/clusters/:id/generate-content
 * Generate content plan for cluster using LLM
 */
router.post("/:id/generate-content", async (c) => {
  try {
    const clusterId = c.req.param("id");

    // Get cluster
    const cluster = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.id, clusterId))
      .limit(1);

    if (cluster.length === 0) {
      return c.json({ error: "Cluster not found" }, 404);
    }

    const clusterData = cluster[0];

    // Get related clusters for link generation
    const allClusters = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.jobId, clusterData.jobId))
      .limit(10);

    // Map to Cluster type for LLM service
    const clusterForLLM: any = {
      id: clusterData.id,
      name: clusterData.cluster_name,
      pillarKeyword: clusterData.pillar_keyword,
      keywords: [],
      keywordIds: [],
      memberCount: clusterData.keywords_count || 0,
      pageType: clusterData.page_type,
      priority: clusterData.priority_score || 0,
      createdAt: clusterData.created_at,
    };

    const relatedClusters = allClusters
      .filter((c) => c.id !== clusterId)
      .map((c) => ({
        id: c.id,
        name: c.cluster_name,
        pillarKeyword: c.pillar_keyword,
        keywords: [],
        keywordIds: [],
        memberCount: c.keywords_count || 0,
        pageType: c.page_type,
        priority: c.priority_score || 0,
        createdAt: c.created_at,
      }));

    // Generate content using LLM service
    const llmService = new LLMContentAutomationService({
      enableBriefGeneration: true,
      enableFaqGeneration: true,
      enableInternalLinkOptimization: true,
    });

    // Check cache first (< 24h)
    const force = c.req.query("force") === "true";
    if (!force) {
      const existing = await contentPlanRepository.get(clusterId);
      if (
        existing?.status === "completed" &&
        existing.generatedAt &&
        Math.floor(Date.now() / 1000) - existing.generatedAt < 86400
      ) {
        return c.json(
          {
            brief: existing.brief,
            faq: existing.faq,
            links: existing.links,
          },
          200,
        );
      }
    }

    // Mark as generating
    await contentPlanRepository.markGenerating(clusterId);

    // Generate content using LLM service
    const result = await llmService.automateClusterContent(
      clusterForLLM,
      relatedClusters,
    );

    // Persist result
    await contentPlanRepository.save(clusterId, {
      brief: result.automatedBrief ?? null,
      faq: result.automatedFaq ?? null,
      links: result.optimizedLinks ?? null,
      modelVersion: "claude-3-5-sonnet-20241022",
    });

    // Dispatch webhook event for successful generation
    const userId = c.get("userId") as string;
    if (userId) {
      setImmediate(() => {
        WebhookDeliveryService.dispatch(
          "content_plan.generated",
          {
            clusterId,
            status: "generated",
          },
          userId,
        ).catch((err) => console.error("Webhook dispatch error:", err));
      });
    }

    return c.json(
      {
        brief: result.automatedBrief || null,
        faq: result.automatedFaq || null,
        links: result.optimizedLinks || null,
      },
      201,
    );
  } catch (error) {
    await contentPlanRepository.markFailed(clusterId, error.message);

    // Dispatch webhook event for failed generation
    const userId = c.get("userId") as string;
    if (userId) {
      setImmediate(() => {
        WebhookDeliveryService.dispatch(
          "content_plan.failed",
          {
            clusterId,
            error: error instanceof Error ? error.message : String(error),
          },
          userId,
        ).catch((err) => console.error("Webhook dispatch error:", err));
      });
    }

    console.error("Failed to generate content:", error);
    return c.json({ error: "Failed to generate content" }, 500);
  }
});

export default router;
