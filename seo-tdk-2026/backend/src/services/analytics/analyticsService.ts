/**
 * Advanced Analytics Service
 *
 * Provides multi-dimensional aggregation and analysis across projects,
 * including conflict detection, coherence scoring, and time-series trends.
 */

import { db } from "../../db";
import { contentPlans, tdkFeedback } from "../../db/schema";
import { eq, sql, gte, lte } from "drizzle-orm";
import { AggregationService } from "../multipage/aggregationService";
import type { Language } from "../tdk/tdkRules";

/**
 * Project-level analytics summary
 */
export interface ProjectAnalytics {
  projectId: string;
  totalClusters: number;
  generatedCount: number;
  withoutTdkCount: number;
  conflictCount: number;
  avgCoherence: number;
  avgConflictSeverity: "high" | "medium" | "low" | "none";
  topicsWithHighConflict: Array<{
    topicGroup: string;
    conflictCount: number;
    severity: "high" | "medium" | "low";
  }>;
  recentGenerations: number; // Generated in last 7 days
  averageRegenerationCount: number;
}

/**
 * Cluster performance score
 */
export interface ClusterScore {
  clusterId: string;
  title: string;
  score: number; // 0-100
  scoreBreakdown: {
    conflictImpact: number;
    coherenceScore: number;
    recencyBoost: number;
  };
  reasons: string[]; // Why this score
  conflictCount: number;
  coherenceScore: number;
  tdkGenerationCount: number;
  lastGeneratedAt: string | null;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  date: string;
  generatedCount: number;
  conflictCount: number;
  avgCoherence: number;
  feedbackCount: number;
}

/**
 * Analytics Service
 */
export class AnalyticsService {
  /**
   * Get comprehensive project analytics
   */
  static async getProjectAnalytics(
    projectId: string,
    language: Language = "en",
  ): Promise<ProjectAnalytics> {
    // Fetch all clusters for the project
    const clusters = await db
      .select({
        clusterId: contentPlans.clusterId,
        tdkJson: contentPlans.tdkJson,
        tdkGeneratedAt: contentPlans.tdkGeneratedAt,
        tdkGenerationCount: contentPlans.tdkGenerationCount,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    if (clusters.length === 0) {
      return {
        projectId,
        totalClusters: 0,
        generatedCount: 0,
        withoutTdkCount: 0,
        conflictCount: 0,
        avgCoherence: 0,
        avgConflictSeverity: "none",
        topicsWithHighConflict: [],
        recentGenerations: 0,
        averageRegenerationCount: 0,
      };
    }

    // Extract TDK data and calculate coherence
    const contents = clusters
      .filter((c) => c.tdkJson)
      .map((c) => {
        const tdkData = JSON.parse(c.tdkJson!);
        return {
          clusterId: c.clusterId,
          keywords: tdkData.keywords || [],
        };
      });

    const coherence =
      contents.length > 1
        ? AggregationService.calculateTopicCoherence(contents, language)
        : { avgSimilarity: 0, redundancyScore: 0 };

    const conflicts =
      contents.length > 1
        ? AggregationService.realTimeConflictDetection(contents, language)
        : [];

    // Calculate metrics
    const generatedCount = clusters.filter(
      (c) => (c.tdkGenerationCount ?? 0) > 0,
    ).length;
    const withoutTdkCount = clusters.length - generatedCount;
    const conflictCount = conflicts.length;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentGenerations = clusters.filter(
      (c) => c.tdkGeneratedAt && new Date(c.tdkGeneratedAt) >= sevenDaysAgo,
    ).length;

    const totalRegenerations = clusters.reduce(
      (sum, c) => sum + (c.tdkGenerationCount ?? 0),
      0,
    );
    const averageRegenerationCount =
      generatedCount > 0 ? totalRegenerations / generatedCount : 0;

    // Determine average conflict severity
    const severityCounts = {
      high: conflicts.filter((c) => c.severity === "high").length,
      medium: conflicts.filter((c) => c.severity === "medium").length,
      low: conflicts.filter((c) => c.severity === "low").length,
    };

    let avgConflictSeverity: "high" | "medium" | "low" | "none" = "none";
    if (
      severityCounts.high >
      severityCounts.medium + severityCounts.low * 0.5
    ) {
      avgConflictSeverity = "high";
    } else if (severityCounts.medium > severityCounts.low * 0.5) {
      avgConflictSeverity = "medium";
    } else if (conflictCount > 0) {
      avgConflictSeverity = "low";
    }

    // Group conflicts by topic (for high-conflict topics)
    const topicsWithHighConflict: Array<{
      topicGroup: string;
      conflictCount: number;
      severity: "high" | "medium" | "low";
    }> = [];

    const topicMap = new Map<
      string,
      { high: number; medium: number; low: number }
    >();
    conflicts.forEach((c) => {
      const key = `${c.cluster1Id}:${c.cluster2Id}`;
      const counts = topicMap.get(key) || {
        high: 0,
        medium: 0,
        low: 0,
      };
      counts[c.severity]++;
      topicMap.set(key, counts);
    });

    topicMap.forEach((counts, key) => {
      const conflictCount = counts.high + counts.medium + counts.low;
      if (conflictCount >= 2 || counts.high > 0) {
        topicsWithHighConflict.push({
          topicGroup: key,
          conflictCount,
          severity: counts.high > 0 ? "high" : "medium",
        });
      }
    });

    return {
      projectId,
      totalClusters: clusters.length,
      generatedCount,
      withoutTdkCount,
      conflictCount,
      avgCoherence: Math.round(coherence.avgSimilarity * 100) / 100,
      avgConflictSeverity,
      topicsWithHighConflict: topicsWithHighConflict
        .sort((a, b) => b.conflictCount - a.conflictCount)
        .slice(0, 5), // Top 5
      recentGenerations,
      averageRegenerationCount:
        Math.round(averageRegenerationCount * 100) / 100,
    };
  }

  /**
   * Get cluster performance scores and recommendations
   */
  static async getClusterScoring(
    projectId: string,
    language: Language = "en",
  ): Promise<ClusterScore[]> {
    const clusters = await db
      .select({
        clusterId: contentPlans.clusterId,
        title: contentPlans.title,
        tdkJson: contentPlans.tdkJson,
        tdkGeneratedAt: contentPlans.tdkGeneratedAt,
        tdkGenerationCount: contentPlans.tdkGenerationCount,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    if (clusters.length === 0) {
      return [];
    }

    // Get analytics data for context
    const analytics = await this.getProjectAnalytics(projectId, language);

    // Calculate scores for each cluster
    const scores: ClusterScore[] = clusters.map((cluster) => {
      const hasTdk = (cluster.tdkGenerationCount ?? 0) > 0;
      const tdkData = cluster.tdkJson ? JSON.parse(cluster.tdkJson) : null;
      const daysOld = cluster.tdkGeneratedAt
        ? Math.floor(
            (Date.now() - new Date(cluster.tdkGeneratedAt).getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : 999;

      // Base score components (0-100)
      let conflictImpact = 0;
      let coherenceScore = 0;
      let recencyBoost = 0;

      if (!hasTdk) {
        // No TDK yet - high priority
        conflictImpact = 60;
      } else {
        // Estimate based on average conflicts
        conflictImpact = Math.min(
          40 * (analytics.conflictCount / Math.max(1, clusters.length)),
          40,
        );
      }

      // Coherence score (if TDK exists)
      if (tdkData?.keywords) {
        coherenceScore = Math.round(analytics.avgCoherence * 30); // Max 30 points
      }

      // Recency boost (generated recently = lower score since it's fresh)
      if (daysOld <= 7) {
        recencyBoost = -10; // Penalize (negative = lower score = less urgent)
      } else if (daysOld > 30) {
        recencyBoost = 20; // Boost (older TDK = more urgent to review)
      }

      const score = Math.max(
        0,
        Math.min(
          100,
          conflictImpact + coherenceScore + recencyBoost + (hasTdk ? 0 : 30),
        ),
      );

      const reasons: string[] = [];
      if (!hasTdk) reasons.push("no_tdk_generated");
      if (daysOld >= 30) reasons.push("stale_tdk");
      if (conflictImpact > 20) reasons.push("high_conflict");
      if (coherenceScore < 10 && hasTdk) reasons.push("low_coherence");

      return {
        clusterId: cluster.clusterId,
        title: cluster.title || "Untitled",
        score,
        scoreBreakdown: {
          conflictImpact,
          coherenceScore,
          recencyBoost,
        },
        reasons,
        conflictCount: 0, // Would need full conflict analysis
        coherenceScore: analytics.avgCoherence,
        tdkGenerationCount: cluster.tdkGenerationCount ?? 0,
        lastGeneratedAt: cluster.tdkGeneratedAt || null,
      };
    });

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Get time series analytics (daily aggregation)
   */
  static async getTimeSeriesStats(
    projectId: string,
    days: number = 30,
  ): Promise<TimeSeriesPoint[]> {
    const clusters = await db
      .select({
        tdkGeneratedAt: contentPlans.tdkGeneratedAt,
        tdkGenerationCount: contentPlans.tdkGenerationCount,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    const feedbacks = await db
      .select({ createdAt: tdkFeedback.createdAt })
      .from(tdkFeedback)
      .where(eq(tdkFeedback.projectId, projectId));

    // Build daily stats
    const today = new Date();
    const stats = new Map<string, TimeSeriesPoint>();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      stats.set(dateStr, {
        date: dateStr,
        generatedCount: 0,
        conflictCount: 0,
        avgCoherence: 0,
        feedbackCount: 0,
      });
    }

    // Count TDK generations by date
    clusters.forEach((c) => {
      if (c.tdkGeneratedAt) {
        const dateStr = c.tdkGeneratedAt.split("T")[0];
        const point = stats.get(dateStr);
        if (point) {
          point.generatedCount++;
        }
      }
    });

    // Count feedback by date
    feedbacks.forEach((f) => {
      if (f.createdAt) {
        const dateStr = f.createdAt.split("T")[0];
        const point = stats.get(dateStr);
        if (point) {
          point.feedbackCount++;
        }
      }
    });

    // Return sorted by date (oldest first)
    return Array.from(stats.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }
}
