/**
 * Keyword Clustering Service
 * Groups keywords into semantic clusters with pillar keywords
 * Phase 2: Enables content planning at cluster level
 */

import {
  IntentPrimary,
  FunnelStage,
  ContentFormat,
} from "../types/classification.js";

interface KeywordFeature {
  wordCount: number;
  intentPrimary: IntentPrimary;
  intentSecondary?: string;
  funnelStage: FunnelStage;
  keywordType: string;
  contentFormatRecommendation: ContentFormat;
  trendLabel?: string;
  competitionScore?: number;
  opportunityScore?: number;
  confidenceScore?: number;
}

export interface Cluster {
  id: string;
  name: string;
  pillarKeyword: string;
  keywords: string[];
  keywordIds: string[];
  pageType: string;
  priority: number;
  confidenceScore: number;
  createdAt: number;
}

interface SimilarityMatrix {
  [key1: string]: {
    [key2: string]: number;
  };
}

export class ClusteringService {
  /**
   * Cluster keywords using hierarchical agglomerative clustering
   */
  static clusterKeywords(
    keywords: Array<{ keyword: string; id: string; features: KeywordFeature }>,
    options: {
      similarityThreshold?: number;
      maxClusterSize?: number;
      minClusterSize?: number;
    } = {},
  ): Cluster[] {
    const {
      similarityThreshold = 0.4,
      maxClusterSize = 50,
      minClusterSize = 2,
    } = options;

    if (keywords.length === 0) return [];

    // Calculate similarity matrix
    const similarities = this.calculateSimilarityMatrix(keywords);

    // Perform hierarchical clustering
    const clusters = this.hierarchicalClustering(
      keywords,
      similarities,
      similarityThreshold,
    );

    // Post-process clusters
    const refinedClusters = this.refineCluster(
      clusters,
      keywords,
      maxClusterSize,
      minClusterSize,
    );

    // Generate cluster metadata
    return this.generateClusterMetadata(refinedClusters, keywords);
  }

  /**
   * Calculate similarity between all keyword pairs
   */
  private static calculateSimilarityMatrix(
    keywords: Array<{ keyword: string; id: string; features: KeywordFeature }>,
  ): SimilarityMatrix {
    const matrix: SimilarityMatrix = {};

    for (let i = 0; i < keywords.length; i++) {
      const kw1 = keywords[i].keyword;
      if (!matrix[kw1]) {
        matrix[kw1] = {};
      }

      for (let j = i + 1; j < keywords.length; j++) {
        const kw2 = keywords[j].keyword;
        const similarity = this.calculateSimilarity(
          kw1,
          kw2,
          keywords[i].features,
          keywords[j].features,
        );
        matrix[kw1][kw2] = similarity;

        if (!matrix[kw2]) {
          matrix[kw2] = {};
        }
        matrix[kw2][kw1] = similarity;
      }

      matrix[kw1][kw1] = 1.0;
    }

    return matrix;
  }

  /**
   * Calculate similarity between two keywords
   * Combines: string similarity + semantic similarity (intent match)
   */
  private static calculateSimilarity(
    kw1: string,
    kw2: string,
    features1: KeywordFeature,
    features2: KeywordFeature,
  ): number {
    // String-based similarity (Jaccard + Cosine)
    const stringSimilarity = this.calculateStringSimilarity(kw1, kw2);

    // Semantic similarity (intent match)
    const intentMatch =
      features1.intentPrimary === features2.intentPrimary ? 0.3 : 0;
    const funnelMatch =
      features1.funnelStage === features2.funnelStage ? 0.1 : 0;
    const formatMatch =
      features1.contentFormatRecommendation ===
      features2.contentFormatRecommendation
        ? 0.1
        : 0;

    const semanticSimilarity = (intentMatch + funnelMatch + formatMatch) / 0.5;

    // Weighted combination
    return stringSimilarity * 0.6 + semanticSimilarity * 0.4;
  }

  /**
   * Calculate string similarity using Jaccard and Cosine metrics
   */
  private static calculateStringSimilarity(kw1: string, kw2: string): number {
    const words1 = new Set(kw1.toLowerCase().split(/\s+/));
    const words2 = new Set(kw2.toLowerCase().split(/\s+/));

    // Jaccard similarity
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccard = intersection.size / (union.size || 1);

    // Character n-gram similarity (trigrams)
    const ngrams1 = this.getNGrams(kw1, 3);
    const ngrams2 = this.getNGrams(kw2, 3);
    const ngramIntersection = ngrams1.filter((ng) =>
      ngrams2.includes(ng),
    ).length;
    const ngramUnion = new Set([...ngrams1, ...ngrams2]).size;
    const cosine = ngramIntersection / (ngramUnion || 1);

    return (
      (jaccard * 0.6 + cosine * 0.4) * 0.5 +
      0.5 *
        (1 -
          Math.abs(kw1.length - kw2.length) / Math.max(kw1.length, kw2.length))
    );
  }

  /**
   * Generate n-grams for string
   */
  private static getNGrams(str: string, n: number): string[] {
    const grams: string[] = [];
    const normalized = str.toLowerCase().replace(/\s+/g, "");

    for (let i = 0; i <= normalized.length - n; i++) {
      grams.push(normalized.substring(i, i + n));
    }

    return grams;
  }

  /**
   * Perform hierarchical agglomerative clustering
   */
  private static hierarchicalClustering(
    keywords: Array<{ keyword: string; id: string; features: KeywordFeature }>,
    similarities: SimilarityMatrix,
    threshold: number,
  ): Map<string, Set<string>> {
    const clusters = new Map<string, Set<string>>();

    // Initialize: each keyword is its own cluster
    keywords.forEach((kw) => {
      clusters.set(kw.keyword, new Set([kw.keyword]));
    });

    let merged = true;
    while (merged && clusters.size > 1) {
      merged = false;

      const clusterArray = Array.from(clusters.entries());

      for (let i = 0; i < clusterArray.length; i++) {
        for (let j = i + 1; j < clusterArray.length; j++) {
          const [rep1, cluster1] = clusterArray[i];
          const [_, cluster2] = clusterArray[j];

          // Calculate cluster similarity (average linkage)
          let totalSim = 0;
          let count = 0;

          for (const kw1 of cluster1) {
            for (const kw2 of cluster2) {
              const sim = similarities[kw1]?.[kw2] || 0;
              totalSim += sim;
              count++;
            }
          }

          const avgSimilarity = count > 0 ? totalSim / count : 0;

          if (avgSimilarity >= threshold) {
            // Merge clusters
            cluster1.forEach((kw) => cluster2.add(kw));
            clusters.delete(rep1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    return clusters;
  }

  /**
   * Refine clusters based on size constraints
   */
  private static refineCluster(
    clusters: Map<string, Set<string>>,
    _keywords: Array<{ keyword: string; id: string; features: KeywordFeature }>,
    maxSize: number,
    minSize: number,
  ): Map<string, Set<string>> {
    const refined = new Map<string, Set<string>>();

    for (const [rep, cluster] of clusters) {
      // Remove clusters that are too small
      if (cluster.size < minSize) {
        continue;
      }

      // Split large clusters
      if (cluster.size > maxSize) {
        let currentCluster = new Set<string>();
        let count = 0;

        for (const kw of cluster) {
          currentCluster.add(kw);
          count++;

          if (count >= maxSize) {
            refined.set(Array.from(currentCluster)[0], currentCluster);
            currentCluster = new Set<string>();
            count = 0;
          }
        }

        if (currentCluster.size > 0) {
          refined.set(Array.from(currentCluster)[0], currentCluster);
        }
      } else {
        refined.set(rep, cluster);
      }
    }

    return refined;
  }

  /**
   * Generate cluster metadata
   */
  private static generateClusterMetadata(
    clusters: Map<string, Set<string>>,
    keywords: Array<{ keyword: string; id: string; features: KeywordFeature }>,
  ): Cluster[] {
    const clusterArray: Cluster[] = [];
    const keywordMap = new Map(keywords.map((kw) => [kw.keyword, kw]));

    let clusterIndex = 1;

    for (const [_, clusterKeywords] of clusters) {
      // Find pillar keyword (most representative)
      const pillarKeyword = this.selectPillarKeyword(
        Array.from(clusterKeywords),
        keywords,
      );

      // Determine page type based on intent
      const keywordObj = keywordMap.get(pillarKeyword);
      const pageType =
        keywordObj?.features.contentFormatRecommendation || "article";

      // Calculate cluster priority
      const priority = this.calculateClusterPriority(
        Array.from(clusterKeywords),
        keywords,
      );

      clusterArray.push({
        id: `cluster-${clusterIndex}`,
        name: `${pillarKeyword} cluster`,
        pillarKeyword,
        keywords: Array.from(clusterKeywords),
        keywordIds: Array.from(clusterKeywords).flatMap(
          (kw) => keywordMap.get(kw)?.id || [],
        ),
        pageType,
        priority,
        confidenceScore:
          Array.from(clusterKeywords).length /
          Math.max(Array.from(clusterKeywords).length, 10),
        createdAt: Date.now(),
      });

      clusterIndex++;
    }

    // Sort by priority
    clusterArray.sort((a, b) => b.priority - a.priority);

    return clusterArray;
  }

  /**
   * Select pillar keyword for cluster
   */
  private static selectPillarKeyword(
    keywords: string[],
    allKeywords: Array<{
      keyword: string;
      id: string;
      features: KeywordFeature;
    }>,
  ): string {
    if (keywords.length === 0) return "";
    if (keywords.length === 1) return keywords[0];

    // Prefer shorter, more general keywords
    const keywordMap = new Map(
      allKeywords.map((kw) => [kw.keyword, kw.features]),
    );

    return keywords.reduce((best, current) => {
      const bestFeatures = keywordMap.get(best);
      const currentFeatures = keywordMap.get(current);

      if (!bestFeatures || !currentFeatures) return best;

      // Prefer: lower word count, higher opportunity score
      const bestScore =
        100 -
        best.split(/\s+/).length * 10 +
        (bestFeatures.opportunityScore || 0);
      const currentScore =
        100 -
        current.split(/\s+/).length * 10 +
        (currentFeatures.opportunityScore || 0);

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate cluster priority for content planning
   */
  private static calculateClusterPriority(
    keywords: string[],
    allKeywords: Array<{
      keyword: string;
      id: string;
      features: KeywordFeature;
    }>,
  ): number {
    if (keywords.length === 0) return 0;

    const keywordMap = new Map(
      allKeywords.map((kw) => [kw.keyword, kw.features]),
    );

    let totalScore = 0;

    for (const kw of keywords) {
      const features = keywordMap.get(kw);
      if (features) {
        // Combine: opportunity score, confidence, inverse competition
        const score =
          (features.opportunityScore || 0) * 0.4 +
          (features.confidenceScore || 0) * 100 * 0.3 +
          (100 - (features.competitionScore || 50)) * 0.3;

        totalScore += score;
      }
    }

    return Math.round(totalScore / keywords.length);
  }
}
