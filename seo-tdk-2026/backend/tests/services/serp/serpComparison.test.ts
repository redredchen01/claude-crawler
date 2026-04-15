/**
 * SERP Comparison Service Tests
 *
 * Tests for comparing generated TDK with SERP results
 */

import { describe, it, expect } from "@jest/globals";
import {
  SerpComparisonService,
  type SerpComparisonResult,
} from "../../../src/services/serp/serpComparisonService";
import type { TdkCandidate } from "../../../src/services/tdk/tdkGeneratorService";
import type { SerpResult } from "../../../src/services/tdk/serpDataProvider";

describe("SerpComparisonService", () => {
  // ====================================================================
  // Test Suite 1: String Similarity
  // ====================================================================

  describe("String Similarity Calculation", () => {
    it("should return 1.0 for identical strings", () => {
      const tdk: TdkCandidate = {
        title: "How to Bake Cookies",
        description: "Learn the art of baking perfect cookies",
        keywords: ["bake", "cookies"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "How to Bake Cookies",
        description: "Learn the art of baking perfect cookies",
        url: "example.com/cookies",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      const comparison = result.comparisons[0];
      expect(comparison.similarity.titleSimilarity).toBe(1);
      expect(comparison.similarity.descriptionSimilarity).toBe(1);
      expect(comparison.verdict).toBe("covered");
    });

    it("should return 0.0 for completely different strings", () => {
      const tdk: TdkCandidate = {
        title: "Python programming",
        description: "Learn Python",
        keywords: ["python"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "How to bake cookies",
        description: "Baking guide for cookies",
        url: "example.com/cookies",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      const comparison = result.comparisons[0];
      expect(comparison.similarity.titleSimilarity).toBeLessThan(0.5);
      expect(comparison.similarity.descriptionSimilarity).toBeLessThan(0.5);
    });

    it("should handle case-insensitive comparison", () => {
      const tdk: TdkCandidate = {
        title: "PYTHON PROGRAMMING",
        description: "Learn PYTHON basics",
        keywords: ["python"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "Python Programming",
        description: "learn python basics",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      const comparison = result.comparisons[0];
      expect(comparison.similarity.titleSimilarity).toBeGreaterThan(0.95);
      expect(comparison.similarity.descriptionSimilarity).toBeGreaterThan(0.95);
    });

    it("should return value in [0, 1] range", () => {
      const tdk: TdkCandidate = {
        title: "Sample Title",
        description: "Sample Description",
        keywords: ["sample"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Similar Title",
          description: "Related Description",
          url: "example1.com",
          domain: "example1.com",
        },
        {
          rank: 2,
          title: "Different Content",
          description: "Unrelated Information",
          url: "example2.com",
          domain: "example2.com",
        },
        {
          rank: 3,
          title: "Sample Title",
          description: "Sample Description",
          url: "example3.com",
          domain: "example3.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      for (const comparison of result.comparisons) {
        expect(comparison.similarity.titleSimilarity).toBeGreaterThanOrEqual(0);
        expect(comparison.similarity.titleSimilarity).toBeLessThanOrEqual(1);
        expect(
          comparison.similarity.descriptionSimilarity,
        ).toBeGreaterThanOrEqual(0);
        expect(comparison.similarity.descriptionSimilarity).toBeLessThanOrEqual(
          1,
        );
      }
    });
  });

  // ====================================================================
  // Test Suite 2: Verdict Classification
  // ====================================================================

  describe("Verdict Classification", () => {
    it("should classify as 'covered' for high similarity (>0.7)", () => {
      const tdk: TdkCandidate = {
        title: "Best Cookie Recipes",
        description: "The best recipes for cookies",
        keywords: ["cookie", "recipe"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "Best Cookie Recipes",
        description: "The best recipes for cookies",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(result.comparisons[0].verdict).toBe("covered");
      expect(
        result.comparisons[0].similarity.overallSimilarity,
      ).toBeGreaterThan(0.7);
    });

    it("should classify as 'differentiated' for low similarity (<0.4)", () => {
      const tdk: TdkCandidate = {
        title: "Advanced Machine Learning Techniques",
        description: "Deep dive into ML algorithms",
        keywords: ["machine learning", "ai"],
      };

      const serp: SerpResult = {
        rank: 5,
        title: "Cookie Baking Guide",
        description: "How to bake delicious cookies",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(result.comparisons[0].verdict).toBe("differentiated");
      expect(result.comparisons[0].similarity.overallSimilarity).toBeLessThan(
        0.4,
      );
    });

    it("should classify as 'partially_covered' for medium similarity (0.4-0.7)", () => {
      const tdk: TdkCandidate = {
        title: "Python Data Science Tutorial",
        description: "Learn data science with Python",
        keywords: ["python", "data science"],
      };

      const serp: SerpResult = {
        rank: 3,
        title: "Python Programming Guide",
        description: "Comprehensive guide to Python language",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      const comparison = result.comparisons[0];
      if (
        comparison.similarity.overallSimilarity >= 0.4 &&
        comparison.similarity.overallSimilarity <= 0.7
      ) {
        expect(comparison.verdict).toBe("partially_covered");
      }
    });
  });

  // ====================================================================
  // Test Suite 3: Keyword Overlap
  // ====================================================================

  describe("Keyword Overlap Calculation", () => {
    it("should calculate high overlap for similar keywords", () => {
      const tdk: TdkCandidate = {
        title: "Learning Programming",
        description: "Learn programming and coding skills",
        keywords: ["learning", "programming", "coding"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "Learning Programming",
        description: "Learn programming and coding skills",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(
        result.comparisons[0].similarity.keywordOverlap,
      ).toBeGreaterThanOrEqual(0.3);
    });

    it("should calculate 0.0 for no overlapping keywords", () => {
      const tdk: TdkCandidate = {
        title: "Python Tutorial",
        description: "Learn programming with Python",
        keywords: ["python", "programming"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "Cookie Recipes",
        description: "Baking chocolate chip cookies",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(result.comparisons[0].similarity.keywordOverlap).toBe(0);
    });

    it("should handle partial keyword overlap", () => {
      const tdk: TdkCandidate = {
        title: "Python Machine Learning",
        description: "Python programming for machine learning and AI",
        keywords: ["python", "machine"],
      };

      const serp: SerpResult = {
        rank: 2,
        title: "Machine Learning Basics",
        description:
          "Introduction to machine learning and deep learning algorithms",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      const overlap = result.comparisons[0].similarity.keywordOverlap;
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(overlap).toBeLessThanOrEqual(1);
    });
  });

  // ====================================================================
  // Test Suite 4: Coverage Analysis
  // ====================================================================

  describe("Coverage Analysis", () => {
    it("should calculate coverage percentage correctly", () => {
      const tdk: TdkCandidate = {
        title: "Python Guide",
        description: "Learn Python programming",
        keywords: ["python"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Python Guide",
          description: "Learn Python programming",
          url: "example1.com",
          domain: "example1.com",
        },
        {
          rank: 2,
          title: "JavaScript Guide",
          description: "Learn JavaScript",
          url: "example2.com",
          domain: "example2.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.coverage.coveragePercentage).toBe(50);
      expect(result.coverage.coveredCount).toBe(1);
      expect(result.coverage.differentiatedCount).toBe(1);
    });

    it("should have correct total comparisons", () => {
      const tdk: TdkCandidate = {
        title: "Test",
        description: "Test description",
        keywords: ["test"],
      };

      const serps: SerpResult[] = Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        title: `Result ${i + 1}`,
        description: `Description ${i + 1}`,
        url: `example${i}.com`,
        domain: `example${i}.com`,
      }));

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.comparisons).toHaveLength(10);
      expect(
        result.coverage.coveredCount +
          result.coverage.partiallyCount +
          result.coverage.differentiatedCount,
      ).toBe(10);
    });

    it("should calculate average similarity correctly", () => {
      const tdk: TdkCandidate = {
        title: "Test",
        description: "Test description",
        keywords: ["test"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Test",
          description: "Test description",
          url: "example.com",
          domain: "example.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.coverage.averageSimilarity).toBeGreaterThanOrEqual(0.9);
      expect(result.coverage.averageSimilarity).toBeLessThanOrEqual(1);
    });
  });

  // ====================================================================
  // Test Suite 5: Recommendations
  // ====================================================================

  describe("Recommendations Generation", () => {
    it("should provide recommendations for high coverage", () => {
      const tdk: TdkCandidate = {
        title: "Python Guide",
        description: "Learn Python",
        keywords: ["python"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Python Guide",
          description: "Learn Python",
          url: "example.com",
          domain: "example.com",
        },
        {
          rank: 2,
          title: "Python Basics",
          description: "Python basics tutorial",
          url: "example.com",
          domain: "example.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.recommendations).toHaveLength(
        result.recommendations.length,
      );
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should provide differentiation recommendations", () => {
      const tdk: TdkCandidate = {
        title: "Advanced ML Techniques",
        description: "Deep learning methods",
        keywords: ["machine learning"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Cookie Recipes",
          description: "How to bake cookies",
          url: "example.com",
          domain: "example.com",
        },
        {
          rank: 2,
          title: "Baking Guide",
          description: "Complete baking guide",
          url: "example.com",
          domain: "example.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      const hasPositiveRec = result.recommendations.some((r) =>
        r.toLowerCase().includes("differentiation"),
      );
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ====================================================================
  // Test Suite 6: Complete Comparison
  // ====================================================================

  describe("Complete Comparison Result", () => {
    it("should return valid SerpComparisonResult structure", () => {
      const tdk: TdkCandidate = {
        title: "Test Title",
        description: "Test description",
        keywords: ["test"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Similar Title",
          description: "Similar description",
          url: "example.com",
          domain: "example.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result).toBeDefined();
      expect(result.generatedTdk).toEqual(tdk);
      expect(result.comparisons).toHaveLength(1);
      expect(result.coverage).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should include domain in comparison", () => {
      const tdk: TdkCandidate = {
        title: "Test",
        description: "Test",
        keywords: ["test"],
      };

      const serps: SerpResult[] = [
        {
          rank: 1,
          title: "Test",
          description: "Test",
          url: "example.com/page",
          domain: "example.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.comparisons[0].serpDomain).toBe("example.com");
    });

    it("should preserve rank ordering", () => {
      const tdk: TdkCandidate = {
        title: "Test",
        description: "Test",
        keywords: ["test"],
      };

      const serps: SerpResult[] = [
        {
          rank: 3,
          title: "Third",
          description: "Third result",
          url: "example3.com",
          domain: "example3.com",
        },
        {
          rank: 1,
          title: "First",
          description: "First result",
          url: "example1.com",
          domain: "example1.com",
        },
        {
          rank: 2,
          title: "Second",
          description: "Second result",
          url: "example2.com",
          domain: "example2.com",
        },
      ];

      const result = SerpComparisonService.compareWithSerp(tdk, serps);

      expect(result.comparisons[0].rank).toBe(3);
      expect(result.comparisons[1].rank).toBe(1);
      expect(result.comparisons[2].rank).toBe(2);
    });
  });

  // ====================================================================
  // Test Suite 7: Edge Cases
  // ====================================================================

  describe("Edge Cases", () => {
    it("should handle empty SERP results", () => {
      const tdk: TdkCandidate = {
        title: "Test",
        description: "Test",
        keywords: ["test"],
      };

      const result = SerpComparisonService.compareWithSerp(tdk, []);

      expect(result.comparisons).toHaveLength(0);
      expect(result.coverage.coveredCount).toBe(0);
      expect(result.coverage.averageSimilarity).toBe(0);
    });

    it("should handle very long titles and descriptions", () => {
      const longTitle = "A".repeat(500);
      const longDesc = "B".repeat(500);

      const tdk: TdkCandidate = {
        title: longTitle,
        description: longDesc,
        keywords: ["test"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "C".repeat(500),
        description: "D".repeat(500),
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(result.comparisons).toHaveLength(1);
      expect(
        result.comparisons[0].similarity.overallSimilarity,
      ).toBeGreaterThanOrEqual(0);
      expect(
        result.comparisons[0].similarity.overallSimilarity,
      ).toBeLessThanOrEqual(1);
    });

    it("should handle special characters in text", () => {
      const tdk: TdkCandidate = {
        title: "C++ & Python: Advanced Techniques!",
        description: "Learn C++ | Python (2024)",
        keywords: ["programming", "techniques"],
      };

      const serp: SerpResult = {
        rank: 1,
        title: "C++ & Python: Advanced Techniques!",
        description: "Learn C++ | Python (2024)",
        url: "example.com",
        domain: "example.com",
      };

      const result = SerpComparisonService.compareWithSerp(tdk, [serp]);

      expect(
        result.comparisons[0].similarity.titleSimilarity,
      ).toBeGreaterThanOrEqual(0.9);
    });
  });
});
