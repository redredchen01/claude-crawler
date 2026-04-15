import { prisma } from "@/lib/db";
import { optimizeAndScoreService } from "@/lib/services/optimization";
import { scorePromptService } from "@/lib/services/scoring";
import logger from "@/lib/logger";
import {
  invalidateStatsCache,
  invalidateTimelineCache,
} from "@/lib/adminCache";

export enum BatchProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  PARTIALLY_FAILED = "partially_failed",
  CANCELLED = "cancelled",
}

export interface BatchProcessingResult {
  promptIndex: number;
  prompt: string;
  status: "success" | "failed";
  result?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

const CONCURRENT_JOBS = 12; // Tunable concurrency per job (increased from 8 for better throughput)
const CHUNK_SIZE = 100; // Process 100 items per chunk (batch update optimization)
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 10000]; // ms
const PROGRESS_UPDATE_THRESHOLD = 50; // Update progress every 50 items instead of 5

/**
 * Process a single prompt with retry logic
 */
async function processPromptWithRetry(
  prompt: string,
  endpoint: "optimize-full" | "score",
  userId: string,
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (endpoint === "optimize-full") {
        const result = await optimizeAndScoreService(prompt);
        return result;
      } else {
        const result = await scorePromptService(prompt);
        return result;
      }
    } catch (error: any) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        logger.warn(
          {
            userId,
            prompt: prompt.substring(0, 50),
            attempt: attempt + 1,
            nextRetryMs: delay,
            error: error.message,
          },
          "Prompt processing failed, retrying...",
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Failed to process prompt after max retries");
}

/**
 * Process batch job prompts with concurrent execution
 */
export async function processBatchJob(
  jobId: string,
  endpoint: "optimize-full" | "score" = "optimize-full",
): Promise<void> {
  try {
    const job = await prisma.batchOptimizationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      logger.error({ jobId }, "Batch job not found");
      return;
    }

    if (job.status === "cancelled") {
      logger.info({ jobId }, "Batch job is cancelled, skipping processing");
      return;
    }

    // Parse prompts
    let prompts: string[] = [];
    try {
      prompts = JSON.parse(job.prompts);
    } catch {
      await prisma.$transaction(async (tx) => {
        await tx.batchOptimizationJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            error: "Failed to parse prompts JSON",
            completedAt: new Date(),
          },
        });
      });
      return;
    }

    // Update status to processing with transaction
    await prisma.$transaction(async (tx) => {
      await tx.batchOptimizationJob.update({
        where: { id: jobId },
        data: {
          status: "processing",
          startedAt: new Date(),
        },
      });
    });

    logger.info(
      { jobId, promptCount: prompts.length },
      "Starting batch job processing",
    );

    // Process prompts with optimized chunking & concurrency
    const results: BatchProcessingResult[] = [];
    let processedCount = 0;
    let failedCount = 0;

    // Semaphore for concurrency control (better than simple chunking)
    let activeJobs = 0;
    const jobQueue: (() => Promise<void>)[] = [];

    const enqueueJob = (fn: () => Promise<void>) => {
      jobQueue.push(fn);
      processQueue();
    };

    const processQueue = async () => {
      while (jobQueue.length > 0 && activeJobs < CONCURRENT_JOBS) {
        activeJobs++;
        const fn = jobQueue.shift()!;
        try {
          await fn();
        } finally {
          activeJobs--;
          processQueue();
        }
      }
    };

    // Create processing tasks
    const processingPromise = new Promise<void>((resolve, reject) => {
      let completed = 0;

      const processItem = async (index: number, prompt: string) => {
        const startTime = Date.now();

        try {
          const result = await processPromptWithRetry(
            prompt,
            endpoint,
            job.userId,
          );

          results[index] = {
            promptIndex: index,
            prompt,
            status: "success" as const,
            result,
            duration: Date.now() - startTime,
          };
          processedCount++;
        } catch (error: any) {
          results[index] = {
            promptIndex: index,
            prompt,
            status: "failed" as const,
            error: error.message || "Unknown error",
            duration: Date.now() - startTime,
          };
          failedCount++;
        }

        completed++;

        // Batch progress updates (every 50 items instead of 5)
        if (
          completed % PROGRESS_UPDATE_THRESHOLD === 0 ||
          completed === prompts.length
        ) {
          try {
            await prisma.$transaction(async (tx) => {
              await tx.batchOptimizationJob.update({
                where: { id: jobId },
                data: {
                  processedItems: processedCount,
                  failedItems: failedCount,
                },
              });
            });
          } catch (error: any) {
            logger.warn(
              { jobId, completed, error: error.message },
              "Failed to update progress",
            );
          }
        }

        if (completed === prompts.length) {
          resolve();
        }
      };

      // Enqueue all items
      prompts.forEach((prompt, index) => {
        enqueueJob(async () => {
          await processItem(index, prompt);
        });
      });

      // If no prompts, resolve immediately
      if (prompts.length === 0) {
        resolve();
      }

      // Safety timeout after 30 min per batch
      setTimeout(
        () => reject(new Error("Batch processing timeout (30 min)")),
        30 * 60 * 1000,
      );
    });

    await processingPromise;

    // Determine final status
    const finalStatus =
      failedCount === 0
        ? "completed"
        : failedCount === prompts.length
          ? "failed"
          : "partially_failed";

    // Store results with transaction
    await prisma.$transaction(async (tx) => {
      await tx.batchOptimizationJob.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          processedItems: processedCount,
          failedItems: failedCount,
          results: JSON.stringify(results),
          completedAt: new Date(),
        },
      });
    });

    logger.info(
      {
        jobId,
        processedCount,
        failedCount,
        status: finalStatus,
      },
      "Batch job processing completed",
    );

    // Invalidate admin dashboard caches since batch state changed
    await Promise.all([
      invalidateStatsCache(),
      invalidateTimelineCache(),
    ]).catch((err) =>
      logger.warn({ error: err.message }, "Failed to invalidate caches"),
    );
  } catch (error: any) {
    logger.error(
      { jobId, error: error.message },
      "Critical error in batch processing",
    );

    try {
      await prisma.$transaction(async (tx) => {
        await tx.batchOptimizationJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            error: error.message || "Unknown error",
            completedAt: new Date(),
          },
        });
      });

      // Invalidate caches on failure
      await Promise.all([
        invalidateStatsCache(),
        invalidateTimelineCache(),
      ]).catch((err) =>
        logger.warn({ error: err.message }, "Failed to invalidate caches"),
      );
    } catch (updateError) {
      logger.error({ jobId, updateError }, "Failed to update job status");
    }
  }
}

/**
 * Process all pending batch jobs (scheduled task)
 */
export async function processPendingBatchJobs(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  try {
    const pendingJobs = await prisma.batchOptimizationJob.findMany({
      where: {
        status: "pending",
      },
      orderBy: { createdAt: "asc" },
      take: 10, // Process max 10 jobs per run
    });

    logger.info(
      { jobCount: pendingJobs.length },
      "Processing pending batch jobs",
    );

    // Process jobs concurrently with max 3 at a time
    const MAX_CONCURRENT = 3;
    for (let i = 0; i < pendingJobs.length; i += MAX_CONCURRENT) {
      const chunk = pendingJobs.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.allSettled(
        chunk.map((job) => processBatchJob(job.id)),
      );

      // Count results
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          processed++;
        } else {
          failed++;
          const jobId = chunk[index].id;
          const errorMsg = `Failed to process job ${jobId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
          errors.push(errorMsg);
          logger.error(
            {
              jobId,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            },
            errorMsg,
          );
        }
      });
    }

    logger.info(
      { processed, failed, errors },
      "Batch job processing run completed",
    );
  } catch (error: any) {
    const errorMsg = `Critical error in batch processing: ${error.message}`;
    errors.push(errorMsg);
    logger.error(error, errorMsg);
  }

  return { processed, failed, errors };
}

/**
 * Get batch job processing statistics
 */
export async function getBatchProcessingStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  partiallyFailed: number;
  cancelled: number;
}> {
  // Use single groupBy instead of 6 separate COUNT queries
  const statusCounts = await prisma.batchOptimizationJob.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const lookup = Object.fromEntries(
    statusCounts.map((r) => [r.status, r._count.id]),
  );

  return {
    pending: lookup["pending"] ?? 0,
    processing: lookup["processing"] ?? 0,
    completed: lookup["completed"] ?? 0,
    failed: lookup["failed"] ?? 0,
    partiallyFailed: lookup["partially_failed"] ?? 0,
    cancelled: lookup["cancelled"] ?? 0,
  };
}
