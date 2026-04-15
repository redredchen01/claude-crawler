import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export interface JobStatus {
  id: string;
  status: "running" | "cancelled" | "completed" | "failed";
  result?: any;
  error?: string;
  createdAt: Date;
  cancelledAt?: Date;
}

/**
 * Create a new optimization job
 */
export async function createOptimizationJob(userId: string): Promise<string> {
  const job = await prisma.optimizationJob.create({
    data: {
      userId,
      status: "running",
    },
  });

  logger.info({ jobId: job.id, userId }, "Job created");
  return job.id;
}

/**
 * Get job status
 */
export async function getJobStatus(
  jobId: string,
  userId: string,
): Promise<JobStatus | null> {
  const job = await prisma.optimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    return null;
  }

  return {
    id: job.id,
    status: job.status as "running" | "cancelled" | "completed" | "failed",
    result: job.result ? JSON.parse(job.result) : undefined,
    error: job.error || undefined,
    createdAt: job.createdAt,
    cancelledAt: job.cancelledAt || undefined,
  };
}

/**
 * Check if job has been cancelled
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.optimizationJob.findUnique({
    where: { id: jobId },
  });

  return job?.status === "cancelled";
}

/**
 * Cancel a job
 */
export async function cancelJob(
  jobId: string,
  userId: string,
): Promise<boolean> {
  const job = await prisma.optimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== userId) {
    return false;
  }

  if (job.status !== "running") {
    return false; // Can only cancel running jobs
  }

  await prisma.optimizationJob.update({
    where: { id: jobId },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
    },
  });

  logger.info({ jobId, userId }, "Job cancelled");
  return true;
}

/**
 * Mark job as completed
 */
export async function completeJob(jobId: string, result: any): Promise<void> {
  await prisma.optimizationJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: JSON.stringify(result),
    },
  });

  logger.info({ jobId }, "Job completed");
}

/**
 * Mark job as failed
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  await prisma.optimizationJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error,
    },
  });

  logger.warn({ jobId, error }, "Job failed");
}

/**
 * Clean up old jobs (older than 7 days)
 */
export async function cleanupOldJobs(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await prisma.optimizationJob.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
  });

  if (result.count > 0) {
    logger.info({ deletedCount: result.count }, "Cleaned up old jobs");
  }

  return result.count;
}
