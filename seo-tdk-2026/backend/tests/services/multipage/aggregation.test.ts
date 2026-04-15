/**
 * P3.7: Aggregation Service Tests
 *
 * Test conflict detection, coherence calculation, and recommendations
 */

import {
  AggregationService,
  type ContentSummary,
} from "../../../src/services/multipage/aggregationService";

describe("AggregationService", () => {
  describe("realTimeConflictDetection", () => {
    it("should return empty array for < 2 pages", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python", "programming"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(contents);
      expect(conflicts).toEqual([]);
    });

    it("should detect high-severity conflicts (similarity > 0.7)", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python", "programming", "tutorial", "learn", "guide"],
        },
        {
          clusterId: "c2",
          keywords: ["python", "programming", "tutorial", "learn", "guide"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(contents);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].severity).toBe("high");
      expect(conflicts[0].jaccardSimilarity).toBe(1.0); // Identical keywords
      expect(conflicts[0].overlapKeywords).toContain("python");
      expect(conflicts[0].overlapKeywords).toContain("programming");
      expect(conflicts[0].overlapKeywords).toContain("tutorial");
    });

    it("should detect conflicts with sufficient keyword overlap", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: [
            "javascript",
            "web",
            "frontend",
            "react",
            "typescript",
            "development",
          ],
        },
        {
          clusterId: "c2",
          keywords: [
            "javascript",
            "web",
            "nodejs",
            "backend",
            "express",
            "development",
          ],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(contents);
      // Overlap: javascript, web, development (3 shared)
      // Union: 6 + 6 - 3 = 9
      // Jaccard: 3/9 = 0.33... (above 0.3 threshold)
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].overlapKeywords).toContain("javascript");
      expect(conflicts[0].overlapKeywords).toContain("web");
    });

    it("should filter out conflicts below 0.3 similarity threshold", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python"],
        },
        {
          clusterId: "c2",
          keywords: ["java"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(contents);
      // Very low overlap, should be filtered
      expect(conflicts.length).toBeLessThanOrEqual(0);
    });

    it("should compare all pairs of pages", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python", "programming"],
        },
        {
          clusterId: "c2",
          keywords: ["python", "programming"],
        },
        {
          clusterId: "c3",
          keywords: ["java", "programming"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(contents);
      // Should have comparisons: c1-c2 (high), c1-c3 (medium?), c2-c3 (medium?)
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it("should use language-aware normalization (English)", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["the python tutorial", "learn programming"],
        },
        {
          clusterId: "c2",
          keywords: ["python guide", "programming basics"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(
        contents,
        "en",
      );
      // Should recognize stopwords removed and find python, programming
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].overlapKeywords).toContain("python");
    });

    it("should use language-aware normalization (Chinese)", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["Python编程教程", "学习编程", "开发"],
        },
        {
          clusterId: "c2",
          keywords: ["Python指南", "编程基础", "开发"],
        },
      ];

      const conflicts = AggregationService.realTimeConflictDetection(
        contents,
        "zh",
      );
      // Should recognize Chinese keywords and their overlaps
      // "编程" and "开发" are shared
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });

  describe("generateConflictRecommendation", () => {
    it("should recommend consolidation for high-severity conflicts", () => {
      const conflicts = [
        {
          cluster1Id: "c1",
          cluster2Id: "c2",
          overlapKeywords: ["python", "programming"],
          jaccardSimilarity: 0.8,
          severity: "high" as const,
        },
      ];

      const recommendation =
        AggregationService.generateConflictRecommendation(conflicts);
      expect(recommendation).toContain("consolidating");
    });

    it("should recommend monitoring for medium-severity conflicts", () => {
      const conflicts = [
        {
          cluster1Id: "c1",
          cluster2Id: "c2",
          overlapKeywords: ["python"],
          jaccardSimilarity: 0.5,
          severity: "medium" as const,
        },
      ];

      const recommendation =
        AggregationService.generateConflictRecommendation(conflicts);
      expect(recommendation.toLowerCase()).toContain("monitor");
    });

    it("should provide generic message for low-severity conflicts", () => {
      const conflicts = [
        {
          cluster1Id: "c1",
          cluster2Id: "c2",
          overlapKeywords: ["python"],
          jaccardSimilarity: 0.35,
          severity: "low" as const,
        },
      ];

      const recommendation =
        AggregationService.generateConflictRecommendation(conflicts);
      expect(recommendation).toContain("monitoring");
    });

    it("should return success message for no conflicts", () => {
      const conflicts: Array<any> = [];

      const recommendation =
        AggregationService.generateConflictRecommendation(conflicts);
      expect(recommendation).toContain("well-differentiated");
    });
  });

  describe("calculateTopicCoherence", () => {
    it("should return 0 coherence for < 2 pages", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python"],
        },
      ];

      const coherence = AggregationService.calculateTopicCoherence(contents);
      expect(coherence.avgSimilarity).toBe(0);
      expect(coherence.redundancyScore).toBe(0);
    });

    it("should calculate average similarity across all page pairs", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python", "programming"],
        },
        {
          clusterId: "c2",
          keywords: ["python", "programming"],
        },
        {
          clusterId: "c3",
          keywords: ["java", "programming"],
        },
      ];

      const coherence = AggregationService.calculateTopicCoherence(contents);
      expect(coherence.avgSimilarity).toBeGreaterThan(0);
      expect(coherence.avgSimilarity).toBeLessThanOrEqual(1);
      expect(coherence.redundancyScore).toBeLessThanOrEqual(1);
    });

    it("should round avgSimilarity to 2 decimal places", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["abc", "def"],
        },
        {
          clusterId: "c2",
          keywords: ["abc", "ghi"],
        },
      ];

      const coherence = AggregationService.calculateTopicCoherence(contents);
      const rounded = Math.round(coherence.avgSimilarity * 100) / 100;
      expect(coherence.avgSimilarity).toBe(rounded);
    });

    it("should respect language parameter for normalization", () => {
      const englishContents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["the python"],
        },
        {
          clusterId: "c2",
          keywords: ["python"],
        },
      ];

      const coherenceEn = AggregationService.calculateTopicCoherence(
        englishContents,
        "en",
      );
      expect(coherenceEn.avgSimilarity).toBeGreaterThan(0);

      const chineseContents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["的Python"],
        },
        {
          clusterId: "c2",
          keywords: ["Python"],
        },
      ];

      const coherenceZh = AggregationService.calculateTopicCoherence(
        chineseContents,
        "zh",
      );
      expect(coherenceZh.avgSimilarity).toBeGreaterThan(0);
    });

    it("should handle identical keyword sets", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python", "programming"],
        },
        {
          clusterId: "c2",
          keywords: ["python", "programming"],
        },
      ];

      const coherence = AggregationService.calculateTopicCoherence(contents);
      expect(coherence.avgSimilarity).toBe(1.0);
      expect(coherence.redundancyScore).toBe(1.0);
    });

    it("should handle completely disjoint keyword sets", () => {
      const contents: ContentSummary[] = [
        {
          clusterId: "c1",
          keywords: ["python"],
        },
        {
          clusterId: "c2",
          keywords: ["java"],
        },
      ];

      const coherence = AggregationService.calculateTopicCoherence(contents);
      expect(coherence.avgSimilarity).toBe(0);
      expect(coherence.redundancyScore).toBe(0);
    });
  });
});
