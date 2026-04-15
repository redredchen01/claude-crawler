import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export interface BatchAnalytics {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  partiallyFailedBatches: number;
  processingBatches: number;
  cancelledBatches: number;
  totalPrompts: number;
  successfulPrompts: number;
  failedPrompts: number;
  successRate: number;
  averageProcessingTime?: number;
  averagePromptsPerBatch: number;
}

export interface PerformanceMetrics {
  avgProcessingTimeMs: number;
  minProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  medianProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  p99ProcessingTimeMs: number;
}

export interface CostAnalysis {
  estimatedTokensProcessed: number;
  estimatedCost: number; // in dollars
  costPerBatch: number;
  costPerPrompt: number;
  averageTokensPerPrompt: number;
}

export interface DateRangeAnalytics {
  date: Date;
  batchCount: number;
  promptCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Get comprehensive batch analytics for a user or team
 */
export async function getBatchAnalytics(
  userId: string,
  teamId?: string,
): Promise<BatchAnalytics> {
  try {
    const [
      totalBatches,
      completedBatches,
      failedBatches,
      partiallyFailedBatches,
      processingBatches,
      cancelledBatches,
    ] = await Promise.all([
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          ...(teamId && { teamId }),
        },
      }),
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          status: "completed",
          ...(teamId && { teamId }),
        },
      }),
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          status: "failed",
          ...(teamId && { teamId }),
        },
      }),
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          status: "partially_failed",
          ...(teamId && { teamId }),
        },
      }),
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          status: "processing",
          ...(teamId && { teamId }),
        },
      }),
      prisma.batchOptimizationJob.count({
        where: {
          userId,
          status: "cancelled",
          ...(teamId && { teamId }),
        },
      }),
    ]);

    // Calculate totals
    const batches = await prisma.batchOptimizationJob.findMany({
      where: {
        userId,
        ...(teamId && { teamId }),
      },
      select: {
        totalItems: true,
        processedItems: true,
        failedItems: true,
      },
    });

    const totalPrompts = batches.reduce((sum, b) => sum + b.totalItems, 0);
    const successfulPrompts = batches.reduce(
      (sum, b) => sum + b.processedItems,
      0,
    );
    const failedPrompts = batches.reduce((sum, b) => sum + b.failedItems, 0);

    const successRate =
      totalPrompts > 0 ? (successfulPrompts / totalPrompts) * 100 : 0;

    const averagePromptsPerBatch =
      totalBatches > 0 ? totalPrompts / totalBatches : 0;

    return {
      totalBatches,
      completedBatches,
      failedBatches,
      partiallyFailedBatches,
      processingBatches,
      cancelledBatches,
      totalPrompts,
      successfulPrompts,
      failedPrompts,
      successRate,
      averagePromptsPerBatch,
    };
  } catch (error: any) {
    logger.error(
      { userId, teamId, error: error.message },
      "Failed to get batch analytics",
    );
    throw error;
  }
}

/**
 * Get performance metrics for batch processing
 */
export async function getPerformanceMetrics(
  userId: string,
  teamId?: string,
): Promise<PerformanceMetrics | null> {
  try {
    const completedBatches = await prisma.batchOptimizationJob.findMany({
      where: {
        userId,
        status: "completed",
        completedAt: {
          not: null,
        },
        startedAt: {
          not: null,
        },
        ...(teamId && { teamId }),
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    if (completedBatches.length === 0) {
      return null;
    }

    // Calculate processing times
    const processingTimes = completedBatches
      .map((b) => {
        const start = b.startedAt?.getTime() || 0;
        const end = b.completedAt?.getTime() || 0;
        return end - start;
      })
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    if (processingTimes.length === 0) {
      return null;
    }

    const avg =
      processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
    const min = processingTimes[0];
    const max = processingTimes[processingTimes.length - 1];
    const median =
      processingTimes.length % 2 === 0
        ? (processingTimes[processingTimes.length / 2 - 1] +
            processingTimes[processingTimes.length / 2]) /
          2
        : processingTimes[Math.floor(processingTimes.length / 2)];

    const p95Index = Math.ceil((processingTimes.length * 95) / 100) - 1;
    const p99Index = Math.ceil((processingTimes.length * 99) / 100) - 1;

    return {
      avgProcessingTimeMs: Math.round(avg),
      minProcessingTimeMs: min,
      maxProcessingTimeMs: max,
      medianProcessingTimeMs: median,
      p95ProcessingTimeMs: processingTimes[Math.max(0, p95Index)],
      p99ProcessingTimeMs: processingTimes[Math.max(0, p99Index)],
    };
  } catch (error: any) {
    logger.error(
      { userId, teamId, error: error.message },
      "Failed to get performance metrics",
    );
    throw error;
  }
}

/**
 * Get cost analysis based on estimated token usage
 */
export async function getCostAnalysis(
  userId: string,
  teamId?: string,
  costPerMillion: number = 1.0, // $1 per 1M tokens
): Promise<CostAnalysis> {
  try {
    const analytics = await getBatchAnalytics(userId, teamId);

    // Estimate tokens: 100 base + 10 per prompt for raw + 10 per prompt for optimized = 20 per prompt
    const estimatedTokensPerPrompt = 120; // Conservative estimate
    const estimatedTokensProcessed =
      analytics.successfulPrompts * estimatedTokensPerPrompt;
    const estimatedCost = (estimatedTokensProcessed / 1000000) * costPerMillion;

    return {
      estimatedTokensProcessed,
      estimatedCost: Math.round(estimatedCost * 10000) / 10000, // Round to 4 decimals
      costPerBatch:
        analytics.totalBatches > 0
          ? Math.round((estimatedCost / analytics.totalBatches) * 10000) / 10000
          : 0,
      costPerPrompt:
        analytics.successfulPrompts > 0
          ? Math.round((estimatedCost / analytics.successfulPrompts) * 10000) /
            10000
          : 0,
      averageTokensPerPrompt: estimatedTokensPerPrompt,
    };
  } catch (error: any) {
    logger.error(
      { userId, teamId, error: error.message },
      "Failed to get cost analysis",
    );
    throw error;
  }
}

/**
 * Get analytics by date range
 */
export async function getAnalyticsByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
  teamId?: string,
): Promise<DateRangeAnalytics[]> {
  try {
    const batches = await prisma.batchOptimizationJob.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(teamId && { teamId }),
      },
      select: {
        createdAt: true,
        totalItems: true,
        processedItems: true,
        failedItems: true,
      },
    });

    // Group by date
    const byDate: Record<string, DateRangeAnalytics> = {};

    for (const batch of batches) {
      const dateKey = batch.createdAt.toISOString().split("T")[0];

      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: new Date(dateKey),
          batchCount: 0,
          promptCount: 0,
          successCount: 0,
          failureCount: 0,
        };
      }

      byDate[dateKey].batchCount++;
      byDate[dateKey].promptCount += batch.totalItems;
      byDate[dateKey].successCount += batch.processedItems;
      byDate[dateKey].failureCount += batch.failedItems;
    }

    return Object.values(byDate).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  } catch (error: any) {
    logger.error(
      { userId, teamId, error: error.message },
      "Failed to get date range analytics",
    );
    throw error;
  }
}

/**
 * Export analytics as CSV
 */
export async function exportAnalyticsAsCSV(
  userId: string,
  teamId?: string,
): Promise<string> {
  try {
    const analytics = await getBatchAnalytics(userId, teamId);
    const metrics = await getPerformanceMetrics(userId, teamId);
    const cost = await getCostAnalysis(userId, teamId);

    const csv = [
      "Batch Analytics Report",
      "",
      "Overview",
      "Total Batches,Completed,Failed,Partially Failed,Processing,Cancelled",
      `${analytics.totalBatches},${analytics.completedBatches},${analytics.failedBatches},${analytics.partiallyFailedBatches},${analytics.processingBatches},${analytics.cancelledBatches}`,
      "",
      "Prompts",
      "Total,Successful,Failed,Success Rate",
      `${analytics.totalPrompts},${analytics.successfulPrompts},${analytics.failedPrompts},${analytics.successRate.toFixed(2)}%`,
      "",
      "Performance",
      "Avg Processing Time (ms),Min,Max,Median,P95,P99",
      metrics
        ? `${metrics.avgProcessingTimeMs},${metrics.minProcessingTimeMs},${metrics.maxProcessingTimeMs},${metrics.medianProcessingTimeMs},${metrics.p95ProcessingTimeMs},${metrics.p99ProcessingTimeMs}`
        : "N/A,N/A,N/A,N/A,N/A,N/A",
      "",
      "Cost Analysis",
      "Estimated Tokens,Estimated Cost ($),Cost Per Batch,Cost Per Prompt,Avg Tokens Per Prompt",
      `${cost.estimatedTokensProcessed},${cost.estimatedCost},${cost.costPerBatch},${cost.costPerPrompt},${cost.averageTokensPerPrompt}`,
    ].join("\n");

    return csv;
  } catch (error: any) {
    logger.error(
      { userId, teamId, error: error.message },
      "Failed to export analytics",
    );
    throw error;
  }
}
