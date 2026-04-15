import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export interface BatchStats {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  processingBatches: number;
  totalPrompts: number;
  processedPrompts: number;
  failedPrompts: number;
  averageProcessingTimeMs: number;
  throughputPerMinute: number;
}

export interface TimelinePoint {
  timestamp: Date;
  completed: number;
  failed: number;
  processing: number;
}

export interface BatchListItem {
  id: string;
  batchName: string;
  status: string;
  userId: string;
  teamId?: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progressPercent: number;
}

/**
 * Get aggregated batch statistics for admin dashboard
 * Uses transactions to batch all queries together
 */
export async function getBatchStats(): Promise<BatchStats> {
  try {
    // Use transaction to batch all queries together - improves connection efficiency
    const [statusCounts, recentCompleted, completedJobs] =
      await prisma.$transaction([
        // Query 1: Get status counts and item sums
        prisma.batchOptimizationJob.groupBy({
          by: ["status"],
          _count: { id: true },
          _sum: { totalItems: true, processedItems: true, failedItems: true },
        }),
        // Query 2: Calculate throughput (prompts/minute) over last hour
        prisma.batchOptimizationJob.aggregate({
          where: {
            status: "completed",
            completedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
          _sum: { processedItems: true },
        }),
        // Query 3: Calculate average processing time for completed jobs
        prisma.batchOptimizationJob.findMany({
          where: {
            status: "completed",
            completedAt: { not: null },
            startedAt: { not: null },
          },
          select: {
            startedAt: true,
            completedAt: true,
          },
          orderBy: { completedAt: "desc" },
          take: 1000, // Sample recent 1000 for avg, not all
        }),
      ]);

    // Build stats from groupBy results
    const lookup = Object.fromEntries(statusCounts.map((r) => [r.status, r]));

    const stats: BatchStats = {
      totalBatches: statusCounts.reduce((sum, r) => sum + r._count.id, 0),
      completedBatches: lookup["completed"]?._count.id || 0,
      failedBatches: lookup["failed"]?._count.id || 0,
      processingBatches: lookup["processing"]?._count.id || 0,
      totalPrompts:
        Number(lookup["completed"]?._sum.totalItems || 0) +
        Number(lookup["processing"]?._sum.totalItems || 0) +
        Number(lookup["failed"]?._sum.totalItems || 0) +
        Number(lookup["pending"]?._sum.totalItems || 0),
      processedPrompts: Number(
        statusCounts.reduce((sum, r) => sum + (r._sum.processedItems || 0), 0),
      ),
      failedPrompts: Number(
        statusCounts.reduce((sum, r) => sum + (r._sum.failedItems || 0), 0),
      ),
      averageProcessingTimeMs: 0,
      throughputPerMinute: 0,
    };

    // Calculate average processing time
    if (completedJobs.length > 0) {
      const totalMs = completedJobs.reduce((sum, b) => {
        const duration = b.completedAt!.getTime() - b.startedAt!.getTime();
        return sum + duration;
      }, 0);
      stats.averageProcessingTimeMs = Math.round(
        totalMs / completedJobs.length,
      );
    }

    const promptsLastHour = recentCompleted._sum.processedItems || 0;
    stats.throughputPerMinute = Math.round(promptsLastHour / 60);

    logger.info({ stats }, "Batch stats calculated");
    return stats;
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get batch stats");
    throw error;
  }
}

/**
 * Get timeline of batch completions (hourly aggregation)
 */
export async function getBatchTimeline(
  hoursBack: number = 24,
): Promise<TimelinePoint[]> {
  try {
    const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const startTimeMs = startTime.getTime();

    // Use SQL GROUP BY instead of JS grouping (SQLite: strftime for hour extraction)
    const timelineData = await prisma.$queryRaw<
      Array<{
        hour: string;
        completed: bigint;
        failed: bigint;
        processing: bigint;
      }>
    >`
      SELECT
        strftime('%Y-%m-%d %H:00:00', completedAt / 1000, 'unixepoch') as hour,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
      FROM BatchOptimizationJob
      WHERE completedAt >= ${startTimeMs}
      GROUP BY hour
      ORDER BY hour ASC
    `;

    const result: TimelinePoint[] = timelineData.map((row) => ({
      timestamp: new Date(row.hour),
      completed: Number(row.completed),
      failed: Number(row.failed),
      processing: Number(row.processing),
    }));

    logger.info({ count: result.length }, "Timeline data calculated");
    return result;
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get batch timeline");
    throw error;
  }
}

/**
 * Get paginated list of batches with filtering
 * Uses transaction to batch findMany and count queries together
 */
export async function listBatches(filters?: {
  status?: string;
  userId?: string;
  teamId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ batches: BatchListItem[]; total: number }> {
  try {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.teamId) where.teamId = filters.teamId;

    // Use transaction to batch both queries together
    const [batches, { _count }] = await prisma.$transaction([
      prisma.batchOptimizationJob.findMany({
        where,
        select: {
          id: true,
          batchName: true,
          status: true,
          userId: true,
          teamId: true,
          totalItems: true,
          processedItems: true,
          failedItems: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.batchOptimizationJob.aggregate({ where, _count: { id: true } }),
    ]);

    const total = _count.id;

    const result: BatchListItem[] = batches.map((b) => ({
      id: b.id,
      batchName: b.batchName,
      status: b.status,
      userId: b.userId,
      teamId: b.teamId || undefined,
      totalItems: b.totalItems,
      processedItems: b.processedItems,
      failedItems: b.failedItems,
      createdAt: b.createdAt,
      startedAt: b.startedAt || undefined,
      completedAt: b.completedAt || undefined,
      progressPercent:
        b.totalItems > 0
          ? Math.round(
              ((b.processedItems + b.failedItems) / b.totalItems) * 100,
            )
          : 0,
    }));

    logger.info(
      { count: batches.length, total, offset, limit },
      "Batch list retrieved",
    );
    return { batches: result, total };
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to list batches");
    throw error;
  }
}

/**
 * Get detailed progress timeline for a single batch job
 */
export async function getBatchJobTimeline(jobId: string): Promise<{
  status: string;
  events: Array<{ timestamp: Date; message: string }>;
}> {
  try {
    const job = await prisma.batchOptimizationJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        processedItems: true,
        failedItems: true,
      },
    });

    if (!job) {
      throw new Error("Batch job not found");
    }

    const events = [];

    if (job.createdAt) {
      events.push({
        timestamp: job.createdAt,
        message: "Batch created",
      });
    }

    if (job.startedAt) {
      events.push({
        timestamp: job.startedAt,
        message: "Processing started",
      });
    }

    if (job.completedAt) {
      const duration =
        job.completedAt.getTime() -
        (job.startedAt?.getTime() || job.createdAt.getTime());
      events.push({
        timestamp: job.completedAt,
        message: `Processing completed in ${Math.round(duration / 1000)}s (${job.processedItems} succeeded, ${job.failedItems} failed)`,
      });
    }

    logger.info(
      { jobId, eventCount: events.length },
      "Batch timeline retrieved",
    );
    return { status: job.status, events };
  } catch (error: any) {
    logger.error(
      { jobId, error: error.message },
      "Failed to get batch timeline",
    );
    throw error;
  }
}
