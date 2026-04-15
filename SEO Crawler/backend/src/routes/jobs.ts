import { Hono } from "hono";
import { z } from "zod";
import { randomBytes } from "crypto";
import { flexibleAuthMiddleware, getUserId } from "../auth/middleware";
import { batchRateLimit } from "../middleware/rateLimitMiddleware";
import { jobRepository } from "../repositories/jobRepository";

// Generate unique job ID
function generateJobId(): string {
  return `job_${randomBytes(8).toString("hex")}`;
}

const router = new Hono();

// ============== Validation Schemas ==============
const CreateJobSchema = z.object({
  seed: z.string().min(1).max(500),
  sources: z.array(z.enum(["google", "bing"])).min(1),
  competitorUrls: z.array(z.string().url()).max(10).optional(),
});

const BatchJobSchema = z.object({
  seeds: z.array(z.string().min(1).max(500)).min(1).max(50),
  sources: z.array(z.enum(["google", "bing"])).min(1),
  competitorUrls: z.array(z.string().url()).max(10).optional(),
});

// ============== Single Job Submission ==============
/**
 * POST /api/jobs
 * Create a single job
 */
router.post("/", flexibleAuthMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const body = await c.req.json();

    // Validate input
    const validation = CreateJobSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: "Invalid input", details: validation.error.issues },
        400,
      );
    }

    const { seed, sources } = validation.data;
    const jobId = generateJobId();

    // Create job
    const job = await jobRepository.createJob({
      id: jobId,
      userId,
      seed,
      sources: sources.join(","),
      status: "waiting",
    });

    return c.json(
      {
        jobId: job!.id,
        status: job!.status,
        seed: job!.seed,
        sources: job!.sources,
        createdAt: job!.createdAt,
      },
      201,
    );
  } catch (error) {
    console.error("[Jobs] Single job creation error:", error);
    return c.json({ error: "Failed to create job" }, 500);
  }
});

// ============== Batch Job Submission ==============
/**
 * POST /api/jobs/batch
 * Create multiple jobs in a single request
 */
router.post("/batch", flexibleAuthMiddleware, batchRateLimit, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const body = await c.req.json();

    // Validate input
    const validation = BatchJobSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: "Invalid input", details: validation.error.issues },
        400,
      );
    }

    const { seeds, sources } = validation.data;
    const sourcesStr = sources.join(",");

    // Create jobs in batch
    const jobsData = seeds.map((seed) => ({
      id: generateJobId(),
      userId,
      seed,
      sources: sourcesStr,
      status: "waiting" as const,
    }));

    const createdJobs = await jobRepository.createJobBatch(jobsData);

    return c.json(
      {
        jobIds: createdJobs.map((j) => j.id),
        queued: createdJobs.length,
        rejected: 0,
        createdAt: new Date().toISOString(),
      },
      201,
    );
  } catch (error) {
    console.error("[Jobs] Batch job creation error:", error);
    return c.json({ error: "Failed to create batch jobs" }, 500);
  }
});

// ============== Get Job ==============
/**
 * GET /api/jobs/:jobId
 * Get job details
 */
router.get("/:jobId", flexibleAuthMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const jobId = c.req.param("jobId");
    if (!jobId) {
      return c.json({ error: "Job ID required" }, 400);
    }

    const job = await jobRepository.getJob(jobId);
    if (!job || job.userId !== userId) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      id: job.id,
      seed: job.seed,
      sources: job.sources,
      status: job.status,
      resultCount: job.resultCount,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      errorMessage: job.errorMessage,
    });
  } catch (error) {
    console.error("[Jobs] Get job error:", error);
    return c.json({ error: "Failed to get job" }, 500);
  }
});

// ============== List User Jobs ==============
/**
 * GET /api/jobs
 * List all jobs for current user
 */
router.get("/", flexibleAuthMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const limitStr = c.req.query("limit") || "50";
    const offsetStr = c.req.query("offset") || "0";

    const limit = Math.min(parseInt(limitStr), 100);
    const offset = parseInt(offsetStr);

    const jobs = await jobRepository.getUserJobs(userId, limit, offset);

    return c.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        seed: j.seed,
        sources: j.sources,
        status: j.status,
        resultCount: j.resultCount,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
      })),
      count: jobs.length,
    });
  } catch (error) {
    console.error("[Jobs] List jobs error:", error);
    return c.json({ error: "Failed to list jobs" }, 500);
  }
});

export default router;
