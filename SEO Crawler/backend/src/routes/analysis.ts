import { Hono } from "hono";
import { flexibleAuthMiddleware, getUserId } from "../auth/middleware";
import { getClaudeService } from "../services/claudeAnalysisService";
import { usageTracker } from "../services/usageTrackingService";
import { jobRepository } from "../repositories/jobRepository";
import { analysisRateLimit } from "../middleware/rateLimitMiddleware";

const router = new Hono();

/**
 * POST /api/analysis/:jobId/difficulty
 * Analyze keyword difficulty for a job
 */
router.post(
  "/:jobId/difficulty",
  flexibleAuthMiddleware,
  analysisRateLimit,
  async (c) => {
    try {
      const userId = getUserId(c);
      const jobId = c.req.param("jobId");

      if (!userId) {
        return c.json({ error: "User not found" }, 401);
      }

      if (!jobId) {
        return c.json({ error: "Job ID required" }, 400);
      }

      // Verify job belongs to user
      const job = await jobRepository.getJob(jobId);
      if (!job || job.userId !== userId) {
        return c.json({ error: "Job not found" }, 404);
      }

      // Check quota
      const hasQuota = await usageTracker.hasQuota(userId);
      if (!hasQuota) {
        return c.json({ error: "Monthly token quota exceeded" }, 429);
      }

      // Get results for context
      const results = await jobRepository.getJobResults(jobId, 100);
      const keywords = results.map((r) => r.normalizedKeyword);
      const sources = [...new Set(results.map((r) => r.source))];

      // Generate analysis
      const claudeService = getClaudeService();
      const analysis = await claudeService.analyzeDifficulty(
        keywords,
        sources,
        jobId,
      );

      // Track usage
      await usageTracker.recordUsage(
        userId,
        analysis.tokens.input,
        analysis.tokens.output,
        analysis.type,
      );

      // Calculate cost
      const cost = usageTracker.calculateCost(
        analysis.tokens.input,
        analysis.tokens.output,
      );

      return c.json({
        type: analysis.type,
        content: analysis.content,
        tokens: analysis.tokens,
        cost: cost.costUSD,
        model: analysis.model,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Analysis] Difficulty analysis error:", error);
      return c.json({ error: "Analysis failed" }, 500);
    }
  },
);

/**
 * POST /api/analysis/:jobId/roi
 * Analyze ROI opportunities
 */
router.post(
  "/:jobId/roi",
  flexibleAuthMiddleware,
  analysisRateLimit,
  async (c) => {
    try {
      const userId = getUserId(c);
      const jobId = c.req.param("jobId");

      if (!userId) {
        return c.json({ error: "User not found" }, 401);
      }

      if (!jobId) {
        return c.json({ error: "Job ID required" }, 400);
      }

      // Verify job belongs to user
      const job = await jobRepository.getJob(jobId);
      if (!job || job.userId !== userId) {
        return c.json({ error: "Job not found" }, 404);
      }

      // Check quota
      const hasQuota = await usageTracker.hasQuota(userId);
      if (!hasQuota) {
        return c.json({ error: "Monthly token quota exceeded" }, 429);
      }

      // Get results for context
      const results = await jobRepository.getJobResults(jobId, 100);
      const keywords = results.map((r) => r.normalizedKeyword);
      const resultCounts = new Map(
        keywords.map((k) => [
          k,
          results.filter((r) => r.normalizedKeyword === k).length,
        ]),
      );

      // Generate analysis
      const claudeService = getClaudeService();
      const analysis = await claudeService.analyzeROI(
        keywords,
        resultCounts,
        jobId,
      );

      // Track usage
      await usageTracker.recordUsage(
        userId,
        analysis.tokens.input,
        analysis.tokens.output,
        analysis.type,
      );

      // Calculate cost
      const cost = usageTracker.calculateCost(
        analysis.tokens.input,
        analysis.tokens.output,
      );

      return c.json({
        type: analysis.type,
        content: analysis.content,
        tokens: analysis.tokens,
        cost: cost.costUSD,
        model: analysis.model,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Analysis] ROI analysis error:", error);
      return c.json({ error: "Analysis failed" }, 500);
    }
  },
);

/**
 * POST /api/analysis/:jobId/competitors
 * Analyze competitor gaps
 */
router.post(
  "/:jobId/competitors",
  flexibleAuthMiddleware,
  analysisRateLimit,
  async (c) => {
    try {
      const userId = getUserId(c);
      const jobId = c.req.param("jobId");
      const body = await c.req.json();
      const { competitors } = body;

      if (!userId) {
        return c.json({ error: "User not found" }, 401);
      }

      if (!jobId) {
        return c.json({ error: "Job ID required" }, 400);
      }

      if (
        !competitors ||
        !Array.isArray(competitors) ||
        competitors.length === 0
      ) {
        return c.json({ error: "Competitors list required" }, 400);
      }

      // Verify job belongs to user
      const job = await jobRepository.getJob(jobId);
      if (!job || job.userId !== userId) {
        return c.json({ error: "Job not found" }, 404);
      }

      // Check quota
      const hasQuota = await usageTracker.hasQuota(userId);
      if (!hasQuota) {
        return c.json({ error: "Monthly token quota exceeded" }, 429);
      }

      // Get results for context
      const results = await jobRepository.getJobResults(jobId, 100);
      const keywords = results.map((r) => r.normalizedKeyword);

      // Generate analysis
      const claudeService = getClaudeService();
      const analysis = await claudeService.analyzeCompetitorGaps(
        keywords,
        competitors,
        jobId,
      );

      // Track usage
      await usageTracker.recordUsage(
        userId,
        analysis.tokens.input,
        analysis.tokens.output,
        analysis.type,
      );

      // Calculate cost
      const cost = usageTracker.calculateCost(
        analysis.tokens.input,
        analysis.tokens.output,
      );

      return c.json({
        type: analysis.type,
        content: analysis.content,
        tokens: analysis.tokens,
        cost: cost.costUSD,
        model: analysis.model,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Analysis] Competitor analysis error:", error);
      return c.json({ error: "Analysis failed" }, 500);
    }
  },
);

/**
 * GET /api/analysis/usage
 * Get current usage stats
 */
router.get("/usage", flexibleAuthMiddleware, async (c) => {
  try {
    const userId = getUserId(c);

    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const usage = await usageTracker.getMonthlyUsage(userId);
    const pricing = usageTracker.getPricing();

    return c.json({
      usage,
      pricing,
      report: await usageTracker.getUserReport(userId),
    });
  } catch (error) {
    console.error("[Analysis] Usage error:", error);
    return c.json({ error: "Failed to get usage" }, 500);
  }
});

/**
 * GET /api/analysis/health
 * Check Claude API connectivity
 */
router.get("/health", async (c) => {
  try {
    const claudeService = getClaudeService();
    const healthy = await claudeService.healthCheck();

    return c.json({
      status: healthy ? "healthy" : "unhealthy",
      model: claudeService.getModel(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Analysis] Health check error:", error);
    return c.json({ status: "error", message }, 500);
  }
});

export default router;
