/**
 * Multi-Page Analysis Service
 *
 * Analyzes multiple content plans within a cluster group to detect
 * keyword conflicts, overlaps, and provides coordination recommendations.
 */

import { db } from "../../db";
import { contentPlans } from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  ConflictDetectionService,
  type ConflictResult,
} from "./conflictDetectionService";
import type { Language } from "../tdk/tdkRules";

/**
 * Page summary within analysis
 */
export interface PageSummary {
  clusterId: string;
  title?: string;
  keywords?: string[];
  hasGenerated: boolean;
}

/**
 * Conflict between two pages
 */
export interface ConflictAnalysis {
  cluster1Id: string;
  cluster2Id: string;
  overlapKeywords: string[];
  jaccardSimilarity: number; // 0-1
  severity: "high" | "medium" | "low";
  recommendation: string;
}

/**
 * Topic coherence analysis
 */
export interface TopicCoherence {
  avgJaccardSimilarity: number;
  redundancyScore: number; // 0-1, higher = more redundant
  suggestedTopicGroup?: string;
}

/**
 * Aggregate statistics
 */
export interface AnalysisStatistics {
  totalPages: number;
  generatedCount: number;
  avgKeywordCount: number;
  languageDistribution: Record<Language, number>;
}

/**
 * Complete multi-page analysis result
 */
export interface MultiPageAnalysisResult {
  pages: PageSummary[];
  conflicts: ConflictAnalysis[];
  topicCoherence: TopicCoherence;
  statistics: AnalysisStatistics;
}

/**
 * Multi-Page Analysis Service
 *
 * Orchestrates analysis of multiple content plans to detect conflicts,
 * measure keyword overlap, and suggest content coordination strategies.
 */
export class MultiPageAnalysisService {
  private conflictDetector: ConflictDetectionService;

  constructor() {
    this.conflictDetector = new ConflictDetectionService();
  }

  /**
   * Analyze a group of pages (cluster group)
   *
   * @param projectId - Project ID for context
   * @param clusterIds - Array of content plan IDs to analyze
   * @param language - Language for keyword normalization
   * @returns Complete analysis result with conflicts and recommendations
   */
  async analyzeClusterGroup(
    projectId: string,
    clusterIds: string[],
    language: Language = "en",
  ): Promise<MultiPageAnalysisResult> {
    // Validate input
    if (!clusterIds || clusterIds.length === 0) {
      return this.emptyResult();
    }

    // Fetch all content plans
    const plans = await db
      .select({
        id: contentPlans.id,
        title: contentPlans.title,
        tdkJson: contentPlans.tdkJson,
        tdkLanguage: contentPlans.tdkLanguage,
      })
      .from(contentPlans)
      .where(inArray(contentPlans.id, clusterIds));

    // Build page summaries
    const pages: PageSummary[] = [];
    const keywordSets: string[][] = [];
    const languageCount: Record<Language, number> = { en: 0, zh: 0 };

    for (const plan of plans) {
      const hasGenerated = !!plan.tdkJson;
      let keywords: string[] = [];

      if (hasGenerated && plan.tdkJson) {
        try {
          const parsed = JSON.parse(plan.tdkJson);
          keywords = parsed.primary?.keywords || [];
        } catch {
          // Skip invalid JSON
        }
      }

      pages.push({
        clusterId: plan.id,
        title: plan.title,
        keywords,
        hasGenerated,
      });

      // Only add to analysis if has generated TDK
      if (hasGenerated) {
        keywordSets.push(keywords);
        const lang = (plan.tdkLanguage as Language) || "en";
        languageCount[lang]++;
      }
    }

    // Analyze conflicts between pairs
    const conflicts = this.detectAllConflicts(pages, keywordSets, language);

    // Calculate topic coherence
    const topicCoherence = this.analyzeTopicCoherence(keywordSets, language);

    // Calculate statistics
    const statistics = this.calculateStatistics(
      pages,
      keywordSets,
      languageCount,
    );

    return {
      pages,
      conflicts,
      topicCoherence,
      statistics,
    };
  }

  /**
   * Detect conflicts between all page pairs
   */
  private detectAllConflicts(
    pages: PageSummary[],
    keywordSets: string[][],
    language: Language,
  ): ConflictAnalysis[] {
    const conflicts: ConflictAnalysis[] = [];

    // Only analyze pairs with both having keywords
    const pagesWithKeywords = pages.filter((p) => p.hasGenerated);

    for (let i = 0; i < pagesWithKeywords.length; i++) {
      for (let j = i + 1; j < pagesWithKeywords.length; j++) {
        const page1 = pagesWithKeywords[i];
        const page2 = pagesWithKeywords[j];

        const keywords1 = page1.keywords || [];
        const keywords2 = page2.keywords || [];

        const conflictResult = this.conflictDetector.detectPairConflict(
          keywords1,
          keywords2,
          language,
        );

        const recommendation = this.generateRecommendation(
          page1,
          page2,
          conflictResult,
        );

        conflicts.push({
          cluster1Id: page1.clusterId,
          cluster2Id: page2.clusterId,
          overlapKeywords: conflictResult.overlapKeywords,
          jaccardSimilarity: conflictResult.jaccardSimilarity,
          severity: conflictResult.severity,
          recommendation,
        });
      }
    }

    return conflicts;
  }

  /**
   * Generate recommendation based on conflict severity
   */
  private generateRecommendation(
    page1: PageSummary,
    page2: PageSummary,
    conflict: ConflictResult,
  ): string {
    const similarity = conflict.jaccardSimilarity;
    const overlap = conflict.overlapKeywords;

    if (similarity > 0.7) {
      return `High keyword overlap detected (${(similarity * 100).toFixed(0)}%). Consider consolidating these pages or differentiating their keyword targets. Overlapping keywords: ${overlap.slice(0, 3).join(", ")}${overlap.length > 3 ? `, +${overlap.length - 3} more` : ""}.`;
    }

    if (similarity >= 0.4) {
      return `Moderate keyword overlap (${(similarity * 100).toFixed(0)}%). Review the ${overlap.length} shared keywords and consider restructuring content to target different user intents.`;
    }

    return `Low keyword overlap (${(similarity * 100).toFixed(0)}%). These pages have distinct keyword targets and may complement each other well.`;
  }

  /**
   * Analyze topic coherence of the cluster group
   */
  private analyzeTopicCoherence(
    keywordSets: string[][],
    language: Language,
  ): TopicCoherence {
    if (keywordSets.length === 0) {
      return {
        avgJaccardSimilarity: 0,
        redundancyScore: 0,
      };
    }

    const avgSimilarity = this.conflictDetector.averageJaccardSimilarity(
      keywordSets,
      language,
    );
    const redundancy = this.conflictDetector.calculateRedundancyScore(
      keywordSets,
      language,
    );

    // Generate topic group suggestion based on coherence
    let suggestedTopicGroup: string | undefined;
    if (avgSimilarity > 0.5) {
      // High coherence - likely a single topic
      suggestedTopicGroup = "unified-topic"; // Placeholder for actual grouping logic
    }

    return {
      avgJaccardSimilarity: avgSimilarity,
      redundancyScore: redundancy,
      suggestedTopicGroup,
    };
  }

  /**
   * Calculate aggregate statistics
   */
  private calculateStatistics(
    pages: PageSummary[],
    keywordSets: string[][],
    languageCount: Record<Language, number>,
  ): AnalysisStatistics {
    const generatedCount = pages.filter((p) => p.hasGenerated).length;

    let avgKeywordCount = 0;
    if (keywordSets.length > 0) {
      const totalKeywords = keywordSets.reduce(
        (sum, set) => sum + set.length,
        0,
      );
      avgKeywordCount = totalKeywords / keywordSets.length;
    }

    return {
      totalPages: pages.length,
      generatedCount,
      avgKeywordCount,
      languageDistribution: languageCount,
    };
  }

  /**
   * Return empty result for no pages
   */
  private emptyResult(): MultiPageAnalysisResult {
    return {
      pages: [],
      conflicts: [],
      topicCoherence: {
        avgJaccardSimilarity: 0,
        redundancyScore: 0,
      },
      statistics: {
        totalPages: 0,
        generatedCount: 0,
        avgKeywordCount: 0,
        languageDistribution: { en: 0, zh: 0 },
      },
    };
  }
}
