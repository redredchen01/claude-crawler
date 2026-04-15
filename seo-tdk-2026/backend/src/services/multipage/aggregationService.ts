/**
 * Multi-Page Aggregation Service
 *
 * Aggregates TDK and conflict data across multiple content plans
 */

import { ConflictDetectionService } from "./conflictDetectionService";
import type { Language } from "../tdk/tdkRules";

/**
 * Content summary for aggregation
 */
export interface ContentSummary {
  clusterId: string;
  keywords: string[];
}

/**
 * Conflict result for reporting
 */
export interface ConflictReportResult {
  cluster1Id: string;
  cluster2Id: string;
  overlapKeywords: string[];
  jaccardSimilarity: number;
  severity: "high" | "medium" | "low";
}

/**
 * Aggregation Service
 *
 * Handles real-time and cached conflict detection across multiple pages
 */
export class AggregationService {
  private static readonly conflictDetectionService =
    new ConflictDetectionService();

  /**
   * Real-time conflict detection (for <100 pages)
   *
   * Performs in-memory calculation of keyword conflicts across multiple pages
   *
   * @param contents - Array of content summaries
   * @param language - Language for conflict detection
   * @returns Array of detected conflicts
   */
  static realTimeConflictDetection(
    contents: ContentSummary[],
    language: Language = "en",
  ): ConflictReportResult[] {
    if (contents.length < 2) {
      return [];
    }

    const conflicts: ConflictReportResult[] = [];

    // Compare all pairs of pages
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const content1 = contents[i];
        const content2 = contents[j];

        // Use ConflictDetectionService to detect conflicts
        const result =
          AggregationService.conflictDetectionService.detectPairConflict(
            content1.keywords,
            content2.keywords,
            language,
          );

        // Only report conflicts with threshold
        if (result.jaccardSimilarity > 0.3) {
          let severity: "high" | "medium" | "low";
          if (result.jaccardSimilarity > 0.7) {
            severity = "high";
          } else if (result.jaccardSimilarity > 0.4) {
            severity = "medium";
          } else {
            severity = "low";
          }

          conflicts.push({
            cluster1Id: content1.clusterId,
            cluster2Id: content2.clusterId,
            overlapKeywords: result.overlapKeywords,
            jaccardSimilarity: result.jaccardSimilarity,
            severity,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate recommendation based on conflicts
   *
   * @param conflicts - Array of detected conflicts
   * @returns Recommendation text
   */
  static generateConflictRecommendation(
    conflicts: ConflictReportResult[],
  ): string {
    if (conflicts.length === 0) {
      return "No keyword conflicts detected. All pages are well-differentiated.";
    }

    const highSeverityConflicts = conflicts.filter(
      (c) => c.severity === "high",
    );

    if (highSeverityConflicts.length > 0) {
      const clusterPairs = highSeverityConflicts
        .map((c) => `${c.cluster1Id}↔${c.cluster2Id}`)
        .slice(0, 3)
        .join(", ");

      return `Detected ${highSeverityConflicts.length} high-severity conflicts (${clusterPairs}). Consider consolidating or differentiating these pages.`;
    }

    const mediumConflicts = conflicts.filter((c) => c.severity === "medium");
    if (mediumConflicts.length > 0) {
      return `Found ${mediumConflicts.length} medium-severity conflicts. Monitor these pages for SEO impact and consider adjusting keywords.`;
    }

    return `Found ${conflicts.length} low-severity conflicts. Continue monitoring.`;
  }

  /**
   * Calculate coherence metrics across multiple pages
   *
   * @param contents - Array of content summaries
   * @param language - Language for normalization
   * @returns Coherence metrics
   */
  static calculateTopicCoherence(
    contents: ContentSummary[],
    language: Language = "en",
  ): {
    avgSimilarity: number;
    redundancyScore: number;
  } {
    if (contents.length < 2) {
      return {
        avgSimilarity: 0,
        redundancyScore: 0,
      };
    }

    const keywordSets = contents.map((c) => c.keywords);
    const avgSimilarity =
      AggregationService.conflictDetectionService.averageJaccardSimilarity(
        keywordSets,
        language,
      );

    return {
      avgSimilarity: Math.round(avgSimilarity * 100) / 100,
      redundancyScore: Math.min(avgSimilarity, 1),
    };
  }
}
