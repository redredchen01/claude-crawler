import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export enum BatchStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface BatchJob {
  id: string;
  userId: string;
  teamId?: string;
  status: BatchStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  resultsUrl?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BatchRequest {
  prompts: string[];
  batchName?: string;
}

/**
 * Create a new batch optimization job
 */
export async function createBatchJob(
  userId: string,
  teamId: string | undefined,
  prompts: string[],
  batchName?: string,
): Promise<BatchJob> {
  // Validate input
  if (!prompts || prompts.length === 0) {
    throw new Error("At least one prompt is required");
  }

  if (prompts.length > 1000) {
    throw new Error("Batch size cannot exceed 1000 prompts");
  }

  // Validate each prompt
  const minLength = 10;
  const maxLength = 50000;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    if (!prompt || typeof prompt !== "string") {
      throw new Error(`Prompt ${i + 1} is invalid`);
    }
    if (prompt.length < minLength || prompt.length > maxLength) {
      throw new Error(
        `Prompt ${i + 1} must be between ${minLength} and ${maxLength} characters`,
      );
    }
  }

  // Create batch job record
  const job = await prisma.batchOptimizationJob.create({
    data: {
      userId,
      teamId,
      status: BatchStatus.PENDING,
      totalItems: prompts.length,
      processedItems: 0,
      failedItems: 0,
      batchName: batchName || `Batch ${new Date().toISOString().split("T")[0]}`,
      prompts: JSON.stringify(prompts),
    },
  });

  logger.info(
    {
      jobId: job.id,
      userId,
      teamId,
      promptCount: prompts.length,
    },
    "Batch optimization job created",
  );

  return {
    id: job.id,
    userId: job.userId,
    teamId: job.teamId || undefined,
    status: job.status as BatchStatus,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    failedItems: job.failedItems,
    createdAt: job.createdAt,
  };
}

/**
 * Get batch job details
 */
export async function getBatchJob(
  jobId: string,
  userId: string,
): Promise<BatchJob | null> {
  const job = await prisma.batchOptimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    return null;
  }

  return {
    id: job.id,
    userId: job.userId,
    teamId: job.teamId || undefined,
    status: job.status as BatchStatus,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    failedItems: job.failedItems,
    resultsUrl: job.resultsUrl || undefined,
    error: job.error || undefined,
    createdAt: job.createdAt,
    startedAt: job.startedAt || undefined,
    completedAt: job.completedAt || undefined,
  };
}

/**
 * Update batch job progress
 */
export async function updateBatchProgress(
  jobId: string,
  processed: number,
  failed: number,
  status: BatchStatus,
): Promise<void> {
  await prisma.batchOptimizationJob.update({
    where: { id: jobId },
    data: {
      processedItems: processed,
      failedItems: failed,
      status,
      startedAt: status === BatchStatus.PROCESSING ? new Date() : undefined,
      completedAt:
        status === BatchStatus.COMPLETED ||
        status === BatchStatus.FAILED ||
        status === BatchStatus.CANCELLED
          ? new Date()
          : undefined,
    },
  });

  logger.info(
    { jobId, processed, failed, status },
    "Batch job progress updated",
  );
}

/**
 * Store batch results
 */
export async function storeBatchResults(
  jobId: string,
  results: Record<string, unknown>[],
  resultsUrl: string,
): Promise<void> {
  await prisma.batchOptimizationJob.update({
    where: { id: jobId },
    data: {
      resultsUrl,
      results: JSON.stringify(results),
    },
  });

  logger.info({ jobId, resultCount: results.length }, "Batch results stored");
}

/**
 * List batch jobs for user
 */
export async function listBatchJobs(
  userId: string,
  teamId?: string,
  limit: number = 50,
  offset: number = 0,
): Promise<{
  jobs: BatchJob[];
  total: number;
  limit: number;
  offset: number;
}> {
  const [jobs, total] = await Promise.all([
    prisma.batchOptimizationJob.findMany({
      where: {
        userId,
        ...(teamId && { teamId }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.batchOptimizationJob.count({
      where: {
        userId,
        ...(teamId && { teamId }),
      },
    }),
  ]);

  return {
    jobs: jobs.map((job) => ({
      id: job.id,
      userId: job.userId,
      teamId: job.teamId || undefined,
      status: job.status as BatchStatus,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      failedItems: job.failedItems,
      resultsUrl: job.resultsUrl || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Cancel batch job
 */
export async function cancelBatchJob(
  jobId: string,
  userId: string,
): Promise<void> {
  const job = await prisma.batchOptimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    throw new Error("Batch job not found or access denied");
  }

  if (job.status === BatchStatus.COMPLETED) {
    throw new Error("Cannot cancel a completed batch job");
  }

  await prisma.batchOptimizationJob.update({
    where: { id: jobId },
    data: {
      status: BatchStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  logger.info({ jobId, userId }, "Batch job cancelled");
}

/**
 * Get batch job prompts
 */
export async function getBatchPrompts(
  jobId: string,
  userId: string,
): Promise<string[] | null> {
  const job = await prisma.batchOptimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    return null;
  }

  try {
    return JSON.parse(job.prompts);
  } catch {
    return null;
  }
}

/**
 * Get batch results
 */
export async function getBatchResults(
  jobId: string,
  userId: string,
): Promise<Record<string, unknown>[] | null> {
  const job = await prisma.batchOptimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    return null;
  }

  if (!job.results) {
    return null;
  }

  try {
    return JSON.parse(job.results);
  } catch {
    return null;
  }
}
