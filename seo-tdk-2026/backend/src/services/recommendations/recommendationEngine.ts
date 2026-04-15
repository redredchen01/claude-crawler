/**
 * Recommendation Engine
 *
 * Generates actionable recommendations based on analytics:
 * - Merge suggestions (high overlap)
 * - Differentiation strategies (moderate overlap)
 * - High-value keyword opportunities
 */

import { db } from "../../db/index.js";
import { contentPlans } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { ConflictDetectionService } from "../multipage/conflictDetectionService.js";
import { AggregationService } from "../multipage/aggregationService.js";
import type { Language } from "../tdk/tdkRules.js";

/**
 * Recommendation types
 */
export interface Recommendation {
  id: string;
  type: "merge" | "differentiate" | "high-value-keyword";
  priority: "high" | "medium" | "low";
  affectedClusters: string[];
  reason: string;
  suggestedAction: string;
  impact?: {
    trafficPotential?: number; // Estimated traffic improvement %
    effortLevel?: "low" | "medium" | "high"; // Implementation effort
  };
}

/**
 * Recommendation Engine Service
 */
export class RecommendationEngine {
  private static conflictDetectionService = new ConflictDetectionService();

  /**
   * Get all recommendations for a project
   */
  static async getProjectRecommendations(
    projectId: string,
    language: Language = "en",
  ): Promise<Recommendation[]> {
    const allRecommendations: Recommendation[] = [];

    // Get merge recommendations
    const mergeRecs = await this.getMergeRecommendations(projectId, language);
    allRecommendations.push(...mergeRecs);

    // Get differentiation recommendations
    const diffRecs = await this.getDifferentiateRecommendations(
      projectId,
      language,
    );
    allRecommendations.push(...diffRecs);

    // Get keyword opportunity recommendations
    const keywordRecs = await this.getKeywordOpportunities(projectId, language);
    allRecommendations.push(...keywordRecs);

    // Sort by priority (high → medium → low)
    const priorityMap = { high: 0, medium: 1, low: 2 };
    allRecommendations.sort(
      (a, b) => priorityMap[a.priority] - priorityMap[b.priority],
    );

    return allRecommendations;
  }

  /**
   * Get merge recommendations (Jaccard > 0.8)
   */
  static async getMergeRecommendations(
    projectId: string,
    language: Language = "en",
  ): Promise<Recommendation[]> {
    const clusters = await db
      .select({
        clusterId: contentPlans.clusterId,
        title: contentPlans.title,
        tdkJson: contentPlans.tdkJson,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    const recommendations: Recommendation[] = [];

    // Check all pairs
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const cluster1 = clusters[i];
        const cluster2 = clusters[j];

        const keywords1 = cluster1.tdkJson
          ? JSON.parse(cluster1.tdkJson)?.keywords || []
          : [];
        const keywords2 = cluster2.tdkJson
          ? JSON.parse(cluster2.tdkJson)?.keywords || []
          : [];

        if (keywords1.length === 0 || keywords2.length === 0) continue;

        const conflict = this.conflictDetectionService.detectPairConflict(
          keywords1,
          keywords2,
          language,
        );

        // Merge recommendation: Jaccard > 0.8 (very high overlap)
        if (conflict.jaccardSimilarity > 0.8) {
          recommendations.push({
            id: `merge-${cluster1.clusterId}-${cluster2.clusterId}`,
            type: "merge",
            priority: "high",
            affectedClusters: [cluster1.clusterId, cluster2.clusterId],
            reason: `Pages have ${Math.round(conflict.jaccardSimilarity * 100)}% keyword overlap`,
            suggestedAction: `Consider merging "${cluster1.title}" and "${cluster2.title}" into a single comprehensive page`,
            impact: {
              trafficPotential: 15,
              effortLevel: "medium",
            },
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Get differentiation recommendations (Jaccard 0.4-0.8)
   */
  static async getDifferentiateRecommendations(
    projectId: string,
    language: Language = "en",
  ): Promise<Recommendation[]> {
    const clusters = await db
      .select({
        clusterId: contentPlans.clusterId,
        title: contentPlans.title,
        tdkJson: contentPlans.tdkJson,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    const recommendations: Recommendation[] = [];

    // Check all pairs
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const cluster1 = clusters[i];
        const cluster2 = clusters[j];

        const keywords1 = cluster1.tdkJson
          ? JSON.parse(cluster1.tdkJson)?.keywords || []
          : [];
        const keywords2 = cluster2.tdkJson
          ? JSON.parse(cluster2.tdkJson)?.keywords || []
          : [];

        if (keywords1.length === 0 || keywords2.length === 0) continue;

        const conflict = this.conflictDetectionService.detectPairConflict(
          keywords1,
          keywords2,
          language,
        );

        // Differentiation recommendation: Jaccard 0.4-0.8
        if (
          conflict.jaccardSimilarity >= 0.4 &&
          conflict.jaccardSimilarity <= 0.8
        ) {
          const uniqueKeywords1 = keywords1.filter(
            (k: string) => !keywords2.includes(k),
          );
          const uniqueKeywords2 = keywords2.filter(
            (k: string) => !keywords1.includes(k),
          );

          recommendations.push({
            id: `diff-${cluster1.clusterId}-${cluster2.clusterId}`,
            type: "differentiate",
            priority: "medium",
            affectedClusters: [cluster1.clusterId, cluster2.clusterId],
            reason: `Moderate overlap (${Math.round(conflict.jaccardSimilarity * 100)}%) — consider focusing each page on unique aspects`,
            suggestedAction: `Differentiate pages: "${cluster1.title}" focus on ${uniqueKeywords1.slice(0, 2).join(", ")} | "${cluster2.title}" focus on ${uniqueKeywords2.slice(0, 2).join(", ")}`,
            impact: {
              trafficPotential: 8,
              effortLevel: "low",
            },
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Get keyword opportunity recommendations
   */
  static async getKeywordOpportunities(
    projectId: string,
    language: Language = "en",
  ): Promise<Recommendation[]> {
    const clusters = await db
      .select({
        clusterId: contentPlans.clusterId,
        title: contentPlans.title,
        tdkJson: contentPlans.tdkJson,
      })
      .from(contentPlans)
      .where(eq(contentPlans.projectId, projectId));

    const recommendations: Recommendation[] = [];

    // Collect all keywords across clusters
    const keywordFrequency = new Map<string, number>();
    const keywordClusters = new Map<string, Set<string>>();

    for (const cluster of clusters) {
      if (!cluster.tdkJson) continue;
      const keywords = JSON.parse(cluster.tdkJson)?.keywords || [];

      for (const keyword of keywords) {
        const count = keywordFrequency.get(keyword) || 0;
        keywordFrequency.set(keyword, count + 1);

        if (!keywordClusters.has(keyword)) {
          keywordClusters.set(keyword, new Set());
        }
        keywordClusters.get(keyword)!.add(cluster.clusterId);
      }
    }

    // Identify high-value keywords (appears in 2-5 clusters)
    for (const [keyword, frequency] of keywordFrequency.entries()) {
      if (frequency >= 2 && frequency <= 5) {
        const clusterSet = keywordClusters.get(keyword)!;
        const uncoveredClusters = clusters.filter(
          (c) => c.tdkJson && !clusterSet.has(c.clusterId),
        );

        if (uncoveredClusters.length > 0) {
          recommendations.push({
            id: `keyword-${keyword}-opportunity`,
            type: "high-value-keyword",
            priority: frequency >= 4 ? "high" : "medium",
            affectedClusters: uncoveredClusters.map((c) => c.clusterId),
            reason: `"${keyword}" is a high-value keyword (appears in ${frequency} pages) but missing from ${uncoveredClusters.length} relevant pages`,
            suggestedAction: `Add "${keyword}" to these pages: ${uncoveredClusters.map((c) => c.title).join(", ")}`,
            impact: {
              trafficPotential: 5 + frequency * 2,
              effortLevel: "low",
            },
          });
        }
      }
    }

    return recommendations;
  }
}
