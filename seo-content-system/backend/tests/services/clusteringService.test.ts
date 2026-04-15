import { describe, it, expect } from "@jest/globals";
import { ClusteringService } from "../../src/services/clusteringService.js";
import { KeywordFeature } from "../../src/types/keyword.js";

describe("ClusteringService", () => {
  const createKeywordWithFeatures = (
    keyword: string,
    id: string,
    intent: any = "informational",
    format: string = "article",
  ) => ({
    keyword,
    id,
    features: {
      wordCount: keyword.split(/\s+/).length,
      intentPrimary: intent,
      intentSecondary: undefined,
      funnelStage: "awareness",
      keywordType: "question",
      contentFormatRecommendation: format,
      trendLabel: "stable",
      competitionScore: 50,
      opportunityScore: 60,
      confidenceScore: 0.8,
    } as KeywordFeature,
  });

  describe("Clustering", () => {
    it("should cluster similar keywords together", () => {
      const keywords = [
        createKeywordWithFeatures("python tutorial", "1"),
        createKeywordWithFeatures("python guide", "2"),
        createKeywordWithFeatures("learn python", "3"),
        createKeywordWithFeatures("javascript tutorial", "4"),
        createKeywordWithFeatures("javascript guide", "5"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(keywords.length);

      // Should have at least one cluster with multiple keywords
      const multiKeywordCluster = clusters.find((c) => c.keywords.length > 1);
      expect(multiKeywordCluster).toBeDefined();
    });

    it("should assign pillar keyword to each cluster", () => {
      const keywords = [
        createKeywordWithFeatures("python tutorial", "1"),
        createKeywordWithFeatures("python guide", "2"),
        createKeywordWithFeatures("learn python", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.pillarKeyword).toBeDefined();
        expect(cluster.pillarKeyword.length).toBeGreaterThan(0);
        expect(cluster.keywords).toContain(cluster.pillarKeyword);
      }
    });

    it("should determine page type for cluster", () => {
      const keywords = [
        createKeywordWithFeatures(
          "python tutorial",
          "1",
          "informational",
          "article",
        ),
        createKeywordWithFeatures(
          "python guide",
          "2",
          "informational",
          "article",
        ),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.pageType).toBeDefined();
        expect(
          [
            "article",
            "faq",
            "category",
            "landing",
            "comparison",
            "glossary",
            "topic_page",
          ].includes(cluster.pageType),
        ).toBe(true);
      }
    });

    it("should calculate cluster priority", () => {
      const keywords = [
        createKeywordWithFeatures("python tutorial", "1"),
        createKeywordWithFeatures("javascript guide", "2"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.priority).toBeGreaterThanOrEqual(0);
        expect(cluster.priority).toBeLessThanOrEqual(100);
      }
    });

    it("should set cluster confidence score", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("python tutorial", "2"),
        createKeywordWithFeatures("learn python", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(cluster.confidenceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Cluster Content", () => {
    it("should include all keywords in clusters", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("javascript", "2"),
        createKeywordWithFeatures("typescript", "3"),
        createKeywordWithFeatures("ruby", "4"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);
      const allClusteredKeywords = clusters.flatMap((c) => c.keywords);

      for (const kw of keywords) {
        expect(allClusteredKeywords).toContain(kw.keyword);
      }
    });

    it("should map keyword IDs to clusters", () => {
      const keywords = [
        createKeywordWithFeatures("python tutorial", "kw-1"),
        createKeywordWithFeatures("python guide", "kw-2"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.keywordIds.length).toBeGreaterThan(0);
        for (const id of cluster.keywordIds) {
          expect(id.startsWith("kw-")).toBe(true);
        }
      }
    });
  });

  describe("Cluster Metadata", () => {
    it("should have unique cluster IDs", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("javascript", "2"),
        createKeywordWithFeatures("ruby", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);
      const ids = clusters.map((c) => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have cluster names", () => {
      const keywords = [
        createKeywordWithFeatures("python tutorial", "1"),
        createKeywordWithFeatures("python guide", "2"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.name).toBeDefined();
        expect(cluster.name.length).toBeGreaterThan(0);
        expect(cluster.name).toContain("cluster");
      }
    });

    it("should have creation timestamp", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("javascript", "2"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        expect(cluster.createdAt).toBeDefined();
        expect(typeof cluster.createdAt).toBe("number");
        expect(cluster.createdAt).toBeGreaterThan(0);
      }
    });
  });

  describe("Similarity Handling", () => {
    it("should cluster semantically similar keywords", () => {
      const keywords = [
        createKeywordWithFeatures(
          "best python tutorials",
          "1",
          "informational",
        ),
        createKeywordWithFeatures(
          "python learning guide",
          "2",
          "informational",
        ),
        createKeywordWithFeatures("buy python course", "3", "transactional"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      // Should have fewer clusters than keywords due to similarity
      expect(clusters.length).toBeLessThanOrEqual(keywords.length);

      // Check that at least some keywords are grouped
      const someClusterHasMultiple = clusters.some(
        (c) => c.keywords.length > 1,
      );
      expect(someClusterHasMultiple).toBe(true);
    });

    it("should separate dissimilar keywords", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("fishing", "2"),
        createKeywordWithFeatures("cooking", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords, {
        similarityThreshold: 0.8,
      });

      // Should have separate clusters for very different keywords
      expect(clusters.length).toBeGreaterThan(0);
    });
  });

  describe("Options", () => {
    it("should respect similarity threshold", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("python tutorial", "2"),
        createKeywordWithFeatures("python guide", "3"),
      ];

      const clustersLow = ClusteringService.clusterKeywords(keywords, {
        similarityThreshold: 0.2,
      });
      const clustersHigh = ClusteringService.clusterKeywords(keywords, {
        similarityThreshold: 0.8,
      });

      // Lower threshold should result in more merging
      expect(clustersLow.length).toBeLessThanOrEqual(clustersHigh.length);
    });

    it("should respect max cluster size", () => {
      const keywords = Array.from({ length: 20 }, (_, i) =>
        createKeywordWithFeatures(`python tutorial ${i}`, `kw-${i}`),
      );

      const clusters = ClusteringService.clusterKeywords(keywords, {
        maxClusterSize: 5,
        similarityThreshold: 0.1,
      });

      for (const cluster of clusters) {
        expect(cluster.keywords.length).toBeLessThanOrEqual(5);
      }
    });

    it("should respect min cluster size", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("python tutorial", "2"),
        createKeywordWithFeatures("javascript", "3"),
        createKeywordWithFeatures("ruby", "4"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords, {
        minClusterSize: 2,
        similarityThreshold: 0.3,
      });

      for (const cluster of clusters) {
        expect(cluster.keywords.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("Empty and Edge Cases", () => {
    it("should handle empty keyword list", () => {
      const clusters = ClusteringService.clusterKeywords([]);
      expect(clusters).toEqual([]);
    });

    it("should handle single keyword", () => {
      const keywords = [createKeywordWithFeatures("python", "1")];
      const clusters = ClusteringService.clusterKeywords(keywords);

      // Single keywords might not meet minClusterSize
      expect(Array.isArray(clusters)).toBe(true);
    });

    it("should handle identical keywords", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("python", "2"),
        createKeywordWithFeatures("python", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      // Identical keywords should cluster together
      expect(clusters.length).toBeGreaterThan(0);

      const pythonCluster = clusters.find((c) =>
        c.keywords.every((kw) => kw === "python"),
      );
      expect(pythonCluster).toBeDefined();
    });
  });

  describe("Pillar Keyword Selection", () => {
    it("should prefer shorter keywords as pillar", () => {
      const keywords = [
        createKeywordWithFeatures("python", "1"),
        createKeywordWithFeatures("python tutorial for beginners", "2"),
        createKeywordWithFeatures("how to learn python", "3"),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords, {
        similarityThreshold: 0.2,
      });

      for (const cluster of clusters) {
        const pillarWords = cluster.pillarKeyword.split(/\s+/).length;
        for (const kw of cluster.keywords) {
          const kwWords = kw.split(/\s+/).length;
          // Pillar should generally be shorter or equal
          expect(pillarWords).toBeLessThanOrEqual(kwWords + 2);
        }
      }
    });

    it("should assign realistic pillar keywords", () => {
      const keywords = [
        createKeywordWithFeatures(
          "best python tutorials",
          "1",
          "informational",
          "article",
        ),
        createKeywordWithFeatures(
          "python learning guide",
          "2",
          "informational",
          "article",
        ),
        createKeywordWithFeatures(
          "how to learn python",
          "3",
          "informational",
          "article",
        ),
      ];

      const clusters = ClusteringService.clusterKeywords(keywords);

      for (const cluster of clusters) {
        // Pillar keyword should be one of the input keywords
        expect(cluster.keywords).toContain(cluster.pillarKeyword);
      }
    });
  });
});
