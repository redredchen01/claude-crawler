/**
 * Keyword Jobs API Routes
 * Endpoints for creating and managing keyword processing jobs
 */

import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  projects,
  keywordJobs,
  keywordCandidates,
  keywordFeatures,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { JobWorkerService } from "../services/jobWorkerService.js";
import { ExportService } from "../services/exportService.js";
import { queue } from "../queue/index.js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const router = new Hono();

// Validation schemas
const createJobSchema = z.object({
  seedKeywords: z.array(z.string().min(1).max(100)).min(1).max(100),
  config: z
    .object({
      expandDepth: z.number().int().min(1).max(3).optional(),
      maxCandidatesPerStrategy: z.number().int().min(1).max(500).optional(),
      totalMaxCandidates: z.number().int().min(1).max(10000).optional(),
      strategies: z.array(z.string()).optional(),
      enableSerpAnalysis: z.boolean().optional(),
      enableTrendDetection: z.boolean().optional(),
      deduplication: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /projects/:projectId/jobs
 * Create a new keyword processing job
 */
router.post("/:projectId/jobs", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Validate request body
    const body = await c.req.json();
    const validation = createJobSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: "Invalid request",
          details: validation.error.errors,
        },
        400,
      );
    }

    const { seedKeywords, config } = validation.data;

    // Create job record
    const jobId = uuidv4();
    const configJson = JSON.stringify(config || {});

    await db.insert(keywordJobs).values({
      id: jobId,
      projectId,
      seedKeywords: JSON.stringify(seedKeywords),
      status: "pending",
      configJson,
      checkpointCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Enqueue job for processing
    queue.add(
      async () => {
        try {
          await JobWorkerService.processJob(jobId);
        } catch (error) {
          console.error(`Error processing job ${jobId}:`, error);
        }
      },
      { priority: 10 },
    );

    return c.json(
      {
        jobId,
        projectId,
        status: "pending",
        seedKeywords,
        totalCandidates: 0,
        processedCount: 0,
        startedAt: null,
        completedAt: null,
      },
      201,
    );
  } catch (error) {
    console.error("Error creating job:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId
 * Get keyword job status and results
 */
router.get("/:projectId/jobs/:jobId", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get job status
    const jobStatus = await JobWorkerService.getJobStatus(jobId);

    if (jobStatus.projectId !== projectId) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json(jobStatus);
  } catch (error) {
    console.error("Error fetching job status:", error);
    return c.json({ error: "Job not found" }, 404);
  }
});

/**
 * GET /projects/:projectId/jobs
 * List all keyword jobs for a project
 */
router.get("/:projectId/jobs", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get all jobs for project
    const jobs = await db
      .select()
      .from(keywordJobs)
      .where(eq(keywordJobs.projectId, projectId));

    // Enrich with result counts
    const enrichedJobs = await Promise.all(
      jobs.map(async (job) => {
        const candidates = await db
          .select()
          .from(keywordCandidates)
          .where(eq(keywordCandidates.jobId, job.id));

        const classified = await db
          .selectDistinct({
            normalizedKeyword: keywordCandidates.normalizedKeyword,
          })
          .from(keywordCandidates)
          .where(eq(keywordCandidates.jobId, job.id));

        return {
          jobId: job.id,
          status: job.status,
          seedKeywords: JSON.parse(job.seedKeywords),
          totalCandidates: candidates.length,
          processedCount: classified.length,
          createdAt: job.createdAt.getTime(),
          updatedAt: job.updatedAt.getTime(),
        };
      }),
    );

    return c.json({
      projectId,
      jobs: enrichedJobs,
      total: enrichedJobs.length,
    });
  } catch (error) {
    console.error("Error listing jobs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId/results
 * Get detailed keyword results for a job
 */
router.get("/:projectId/jobs/:jobId/results", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.req.header("x-user-id");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 100;
  const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!) : 0;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Get classified keywords with features
    const results = await db
      .select({
        normalizedKeyword: keywordCandidates.normalizedKeyword,
        wordCount: keywordFeatures.wordCount,
        intentPrimary: keywordFeatures.intentPrimary,
        intentSecondary: keywordFeatures.intentSecondary,
        funnelStage: keywordFeatures.funnelStage,
        keywordType: keywordFeatures.keywordType,
        contentFormatRecommendation:
          keywordFeatures.contentFormatRecommendation,
        trendLabel: keywordFeatures.trendLabel,
        competitionScore: keywordFeatures.competitionScore,
        opportunityScore: keywordFeatures.opportunityScore,
        confidenceScore: keywordFeatures.confidenceScore,
      })
      .from(keywordCandidates)
      .innerJoin(
        keywordFeatures,
        eq(keywordFeatures.keywordId, keywordCandidates.id),
      )
      .where(eq(keywordCandidates.jobId, jobId));

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit);

    return c.json({
      jobId,
      projectId,
      total: results.length,
      offset,
      limit,
      results: paginatedResults,
    });
  } catch (error) {
    console.error("Error fetching job results:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId/export/csv
 * Export job results as CSV
 */
router.get("/:projectId/jobs/:jobId/export/csv", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Generate CSV
    const csv = await ExportService.exportCsv(jobId);
    const filename = ExportService.getFilename(jobId, "csv");

    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.text(csv);
  } catch (error) {
    console.error("Error exporting CSV:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId/export/json
 * Export job results as JSON
 */
router.get("/:projectId/jobs/:jobId/export/json", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Generate JSON
    const json = await ExportService.exportJson(jobId);
    const filename = ExportService.getFilename(jobId, "json");

    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.text(json);
  } catch (error) {
    console.error("Error exporting JSON:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId/stats
 * Get export statistics for a job
 */
router.get("/:projectId/jobs/:jobId/stats", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.req.header("x-user-id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Get statistics
    const stats = await ExportService.getExportStats(jobId);

    return c.json({
      jobId,
      projectId,
      stats,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


/**
 * GET /projects/:projectId/jobs/:jobId/stream
 * SSE stream for real-time job progress
 */
router.get("/:projectId/jobs/:jobId/stream", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.get("userId") as string | null;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Use streamSSE for SSE
    return c.streamSSE(async (stream) => {
      const timeout = 10 * 60 * 1000; // 10 minutes
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const latestJob = await db
          .select()
          .from(keywordJobs)
          .where(eq(keywordJobs.id, jobId))
          .limit(1);

        if (!latestJob.length) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              message: "Job not found",
            }),
          });
          return;
        }

        const jobRecord = latestJob[0];

        if (jobRecord.status === "completed") {
          // Count final candidates
          const candidates = await db
            .select()
            .from(keywordCandidates)
            .where(eq(keywordCandidates.jobId, jobId));

          await stream.writeSSE({
            data: JSON.stringify({
              type: "complete",
              count: candidates.length,
            }),
          });
          return;
        }

        if (jobRecord.status === "failed") {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              message: jobRecord.errorMessage || "Job failed",
            }),
          });
          return;
        }

        if (jobRecord.status === "processing") {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "progress",
              processed: jobRecord.checkpointCount,
              status: "processing",
            }),
          });
        }

        // Poll every 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Timeout
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: "Stream timeout",
        }),
      });
    });
  } catch (error) {
    console.error("Error creating SSE stream:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * POST /projects/:projectId/jobs/batch
 * Create multiple jobs in a single request
 * Body: { jobs: [{ seedKeywords: string[], config?: object }] }
 * Max 10 jobs per request
 */
router.post("/:projectId/jobs/batch", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId") as string | null;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json();
    const { jobs } = body;

    if (!Array.isArray(jobs)) {
      return c.json({ error: "Invalid request: jobs must be an array" }, 400);
    }

    if (jobs.length > 10) {
      return c.json(
        { error: "Invalid request: maximum 10 jobs per request" },
        400
      );
    }

    const jobIds: string[] = [];

    for (const jobSpec of jobs) {
      const validation = createJobSchema.safeParse({
        seedKeywords: jobSpec.seedKeywords,
        config: jobSpec.config,
      });

      if (!validation.success) {
        return c.json(
          {
            error: "Invalid job specification",
            details: validation.error.errors,
          },
          400
        );
      }

      const { seedKeywords, config } = validation.data;
      const jobId = uuidv4();
      const configJson = JSON.stringify(config || {});

      await db.insert(keywordJobs).values({
        id: jobId,
        projectId,
        seedKeywords: JSON.stringify(seedKeywords),
        status: "pending",
        configJson,
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Enqueue job
      queue.add(
        async () => {
          try {
            await JobWorkerService.processJob(jobId);
          } catch (error) {
            console.error(`Error processing job ${jobId}:`, error);
          }
        },
        { priority: 10 }
      );

      jobIds.push(jobId);
    }

    return c.json(
      {
        jobIds,
        queued: jobIds.length,
      },
      201
    );
  } catch (error) {
    console.error("Error creating batch jobs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * GET /projects/:projectId/jobs/:jobId/export/jsonl
 * Export job results as JSONL (newline-delimited JSON)
 */
router.get("/:projectId/jobs/:jobId/export/jsonl", async (c) => {
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const userId = c.get("userId") as string | null;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!project.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Verify job belongs to project
    const job = await db
      .select()
      .from(keywordJobs)
      .where(
        and(eq(keywordJobs.id, jobId), eq(keywordJobs.projectId, projectId)),
      )
      .limit(1);

    if (!job.length) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Generate JSONL
    const jsonl = await ExportService.exportJsonl(jobId);
    const filename = ExportService.getFilename(jobId, "jsonl");

    c.header("Content-Type", "application/x-ndjson");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.text(jsonl);
  } catch (error) {
    console.error("Error exporting JSONL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


export default router;
