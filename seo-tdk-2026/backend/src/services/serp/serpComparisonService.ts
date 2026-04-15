/**
 * SERP Comparison Service
 *
 * Compares generated TDK against actual SERP results to provide
 * competitive insights and differentiation recommendations.
 */

import type { TdkCandidate } from "../tdk/tdkGeneratorService";
import type { SerpResult } from "../tdk/serpDataProvider";

/**
 * Similarity metrics for a single comparison
 */
export interface SimilarityMetrics {
  titleSimilarity: number; // 0-1
  descriptionSimilarity: number; // 0-1
  keywordOverlap: number; // 0-1 (intersection / union)
  overallSimilarity: number; // Weighted average
}

/**
 * Individual SERP result comparison
 */
export interface SerpComparison {
  rank: number;
  serpTitle: string;
  serpDescription: string;
  serpDomain: string;
  similarity: SimilarityMetrics;
  verdict: "covered" | "differentiated" | "partially_covered"; // covered >0.7, diff <0.4, partial 0.4-0.7
}

/**
 * Coverage analysis across all SERP results
 */
export interface CoverageAnalysis {
  coveredCount: number; // >0.7 similarity
  partiallyCount: number; // 0.4-0.7
  differentiatedCount: number; // <0.4
  coveragePercentage: number; // covered / total * 100
  averageSimilarity: number; // Mean across all comparisons
}

/**
 * SERP comparison result
 */
export interface SerpComparisonResult {
  clusterId?: string;
  generatedTdk: TdkCandidate;
  comparisons: SerpComparison[];
  coverage: CoverageAnalysis;
  recommendations: string[];
}

/**
 * SERP Comparison Service
 *
 * Analyzes how generated TDK compares to actual search results
 * and provides strategic recommendations for differentiation.
 */
export class SerpComparisonService {
  /**
   * Compare generated TDK against SERP results
   *
   * @param tdkCandidate - Generated TDK candidate
   * @param serpResults - SERP results from search
   * @param clusterId - Optional cluster ID for context
   * @returns Complete comparison analysis with recommendations
   */
  static compareWithSerp(
    tdkCandidate: TdkCandidate,
    serpResults: SerpResult[],
    clusterId?: string,
  ): SerpComparisonResult {
    // Compare with each SERP result
    const comparisons = serpResults.map((serp) =>
      this.compareSingleResult(tdkCandidate, serp),
    );

    // Calculate coverage analysis
    const coverage = this.analyzeCoverage(comparisons);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      tdkCandidate,
      comparisons,
      coverage,
    );

    return {
      clusterId,
      generatedTdk: tdkCandidate,
      comparisons,
      coverage,
      recommendations,
    };
  }

  /**
   * Compare single SERP result with generated TDK
   */
  private static compareSingleResult(
    tdk: TdkCandidate,
    serp: SerpResult,
  ): SerpComparison {
    // Calculate similarity metrics
    const titleSimilarity = this.stringSimilarity(tdk.title, serp.title);
    const descriptionSimilarity = this.stringSimilarity(
      tdk.description,
      serp.description,
    );
    const keywordOverlap = this.calculateKeywordOverlap(
      tdk.keywords,
      this.extractKeywords(serp.title + " " + serp.description),
    );

    // Weighted overall similarity
    const overallSimilarity =
      titleSimilarity * 0.4 +
      descriptionSimilarity * 0.4 +
      keywordOverlap * 0.2;

    // Determine verdict
    let verdict: "covered" | "differentiated" | "partially_covered";
    if (overallSimilarity > 0.7) {
      verdict = "covered";
    } else if (overallSimilarity < 0.4) {
      verdict = "differentiated";
    } else {
      verdict = "partially_covered";
    }

    return {
      rank: serp.rank,
      serpTitle: serp.title,
      serpDescription: serp.description,
      serpDomain: serp.domain,
      similarity: {
        titleSimilarity: Math.round(titleSimilarity * 100) / 100,
        descriptionSimilarity: Math.round(descriptionSimilarity * 100) / 100,
        keywordOverlap: Math.round(keywordOverlap * 100) / 100,
        overallSimilarity: Math.round(overallSimilarity * 100) / 100,
      },
      verdict,
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   *
   * Normalized to [0, 1] where 1 = identical, 0 = completely different
   */
  private static stringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) {
      return str1 === str2 ? 1 : 0;
    }

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) {
      return 1;
    }

    const distance = this.levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    // Normalize to 0-1 range
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(s1: string, s2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[s2.length][s1.length];
  }

  /**
   * Extract keywords from text
   *
   * Simple tokenization: split on spaces/punctuation, lowercase, deduplicate
   */
  private static extractKeywords(text: string): string[] {
    const keywords = new Set<string>();

    // Split on whitespace and punctuation
    const tokens = text
      .toLowerCase()
      .split(/[\s\-_,.:;!?()[\]{}]+/)
      .filter((token) => token.length > 2); // Minimum 3 chars

    for (const token of tokens) {
      if (token.length >= 3) {
        keywords.add(token);
      }
    }

    return Array.from(keywords);
  }

  /**
   * Calculate keyword overlap (Jaccard similarity)
   *
   * Returns intersection / union of two keyword sets
   */
  private static calculateKeywordOverlap(
    keywords1: string[],
    keywords2: string[],
  ): number {
    if (!keywords1.length && !keywords2.length) {
      return 1;
    }

    if (!keywords1.length || !keywords2.length) {
      return 0;
    }

    const set1 = new Set(keywords1.map((k) => k.toLowerCase()));
    const set2 = new Set(keywords2.map((k) => k.toLowerCase()));

    // Calculate intersection
    let intersection = 0;
    for (const keyword of set1) {
      if (set2.has(keyword)) {
        intersection++;
      }
    }

    // Calculate union
    const union = set1.size + set2.size - intersection;

    return intersection / union;
  }

  /**
   * Analyze coverage across all comparisons
   */
  private static analyzeCoverage(
    comparisons: SerpComparison[],
  ): CoverageAnalysis {
    const coveredCount = comparisons.filter(
      (c) => c.verdict === "covered",
    ).length;
    const partiallyCount = comparisons.filter(
      (c) => c.verdict === "partially_covered",
    ).length;
    const differentiatedCount = comparisons.filter(
      (c) => c.verdict === "differentiated",
    ).length;

    const total = comparisons.length;
    const coveragePercentage = total > 0 ? (coveredCount / total) * 100 : 0;

    const averageSimilarity =
      total > 0
        ? comparisons.reduce(
            (sum, c) => sum + c.similarity.overallSimilarity,
            0,
          ) / total
        : 0;

    return {
      coveredCount,
      partiallyCount,
      differentiatedCount,
      coveragePercentage: Math.round(coveragePercentage * 10) / 10,
      averageSimilarity: Math.round(averageSimilarity * 100) / 100,
    };
  }

  /**
   * Generate strategic recommendations based on comparison
   */
  private static generateRecommendations(
    tdk: TdkCandidate,
    comparisons: SerpComparison[],
    coverage: CoverageAnalysis,
  ): string[] {
    const recommendations: string[] = [];

    // If most results are covered, suggest differentiation
    if (coverage.coveragePercentage > 50) {
      const differentiatedResults = comparisons
        .filter((c) => c.verdict === "differentiated")
        .slice(0, 3);

      if (differentiatedResults.length > 0) {
        const domains = differentiatedResults
          .map((c) => c.serpDomain)
          .join(", ");
        recommendations.push(
          `Consider emphasizing unique angles. Results from ${domains} show good differentiation potential.`,
        );
      }
    } else {
      // Most results are differentiated - good positioning
      recommendations.push(
        `Excellent differentiation! Your TDK targets an underserved angle (${coverage.differentiatedCount} unique vs ${coverage.coveredCount} overlapping).`,
      );
    }

    // Identify specific opportunities
    const partialMatches = comparisons.filter(
      (c) => c.verdict === "partially_covered",
    );
    if (partialMatches.length > 0) {
      const topPartial = partialMatches[0];
      recommendations.push(
        `Rank #${topPartial.rank} is partially similar. Consider refining your description to better differentiate.`,
      );
    }

    // If coverage is very low, it might be too different
    if (coverage.averageSimilarity < 0.3) {
      recommendations.push(
        `Very low similarity to top results. Verify your keyword targeting is intentional and covers actual search intent.`,
      );
    }

    // Add at least one general recommendation
    if (recommendations.length === 0) {
      recommendations.push("Monitor this TDK's ranking performance over time.");
    }

    return recommendations;
  }
}
