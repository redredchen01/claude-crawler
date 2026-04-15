import { describe, it, expect } from "@jest/globals";
import { NormalizationService } from "../../src/services/normalizationService";

describe("NormalizationService", () => {
  describe("normalize", () => {
    it('should normalize "  AI  工具  " to "ai 工具"', () => {
      const result = NormalizationService.normalize("  AI  工具  ");
      expect(result.normalizedKeyword).toBe("ai 工具");
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("should handle uppercase to lowercase", () => {
      const result = NormalizationService.normalize("REACT");
      expect(result.normalizedKeyword).toBe("react");
    });

    it("should normalize punctuation", () => {
      const result = NormalizationService.normalize("AI、工具、应用");
      // Chinese punctuation should be converted to spaces
      expect(result.normalizedKeyword).not.toContain("、");
    });

    it("should collapse consecutive spaces", () => {
      const result = NormalizationService.normalize(
        "keyword    with    spaces",
      );
      expect(result.normalizedKeyword).not.toContain("    ");
    });

    it("should preserve CJK characters", () => {
      const result = NormalizationService.normalize("人工智能");
      expect(result.normalizedKeyword).toBe("人工智能");
    });

    it("should handle mixed CJK and English", () => {
      const result = NormalizationService.normalize("Python 编程");
      expect(result.normalizedKeyword).toBe("python 编程");
    });

    it("should remove special characters", () => {
      const result = NormalizationService.normalize("C++ & Java");
      const normalized = result.normalizedKeyword;
      expect(normalized).not.toContain("&");
      expect(normalized).not.toContain("+");
    });

    it("should log all normalization steps", () => {
      const result = NormalizationService.normalize("  HELLO  ");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0].step).toBe("trim_whitespace");
    });

    it("should track execution time", () => {
      const result = NormalizationService.normalize("test");
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("isValid", () => {
    it("should validate normal keyword", () => {
      expect(NormalizationService.isValid("react")).toBe(true);
      expect(NormalizationService.isValid("python 编程")).toBe(true);
    });

    it("should reject empty keyword", () => {
      expect(NormalizationService.isValid("")).toBe(false);
    });

    it("should reject pure punctuation", () => {
      expect(NormalizationService.isValid("   ")).toBe(false);
      expect(NormalizationService.isValid("!!!")).toBe(false);
    });

    it("should reject very long keywords", () => {
      const longKeyword = "a".repeat(501);
      expect(NormalizationService.isValid(longKeyword)).toBe(false);
    });

    it("should accept keywords at boundary length", () => {
      const longKeyword = "a".repeat(500);
      expect(NormalizationService.isValid(longKeyword)).toBe(true);
    });
  });

  describe("calculateSimilarity", () => {
    it("should return 1.0 for identical keywords", () => {
      const similarity = NormalizationService.calculateSimilarity(
        "react",
        "react",
      );
      expect(similarity).toBe(1.0);
    });

    it("should return 0 for completely different keywords", () => {
      const similarity = NormalizationService.calculateSimilarity("aaa", "zzz");
      expect(similarity).toBe(0);
    });

    it("should calculate partial similarity", () => {
      const similarity = NormalizationService.calculateSimilarity(
        "python",
        "python3",
      );
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it("should handle empty strings", () => {
      const similarity = NormalizationService.calculateSimilarity("test", "");
      expect(similarity).toBe(0);
    });

    it("should be symmetric", () => {
      const sim1 = NormalizationService.calculateSimilarity("abc", "abd");
      const sim2 = NormalizationService.calculateSimilarity("abd", "abc");
      expect(sim1).toBe(sim2);
    });
  });

  describe("findNearDuplicates", () => {
    it("should find identical keywords", () => {
      const keywords = ["react", "react", "vue"];
      const duplicates = NormalizationService.findNearDuplicates(keywords, 0.9);
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it("should respect similarity threshold", () => {
      const keywords = ["python", "python3", "javascript"];
      const duplicates = NormalizationService.findNearDuplicates(keywords, 0.5);
      expect(Array.isArray(duplicates)).toBe(true);
    });

    it("should return empty for dissimilar keywords", () => {
      const keywords = ["aaa", "zzz", "mmm"];
      const duplicates = NormalizationService.findNearDuplicates(keywords, 0.9);
      expect(duplicates.length).toBe(0);
    });
  });

  describe("normalizeBatch", () => {
    it("should normalize multiple keywords", () => {
      const keywords = ["  AI  ", "PYTHON", "人工智能"];
      const results = NormalizationService.normalizeBatch(keywords);

      expect(results.length).toBe(3);
      expect(results[0].normalized).toBe("ai");
      expect(results[1].normalized).toBe("python");
      expect(results[2].normalized).toBe("人工智能");
    });

    it("should mark invalid keywords", () => {
      const keywords = ["valid", "", "!!!"];
      const results = NormalizationService.normalizeBatch(keywords);

      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[2].isValid).toBe(false);
    });

    it("should preserve original keywords in result", () => {
      const keywords = ["  HELLO  ", "WORLD"];
      const results = NormalizationService.normalizeBatch(keywords);

      expect(results[0].original).toBe("  HELLO  ");
      expect(results[1].original).toBe("WORLD");
    });
  });

  describe("Real-world scenarios", () => {
    it('should normalize query "如何学Python编程"', () => {
      const result = NormalizationService.normalize("如何学Python编程");
      expect(result.normalizedKeyword).toBe("如何学python编程");
      expect(NormalizationService.isValid(result.normalizedKeyword)).toBe(true);
    });

    it("should handle mixed punctuation", () => {
      const result = NormalizationService.normalize("AI、机器学习、深度学习");
      expect(result.normalizedKeyword).not.toContain("、");
      expect(result.normalizedKeyword).toContain("ai");
    });

    it("should normalize repeated words", () => {
      const keywords = ["Python", "python", "PYTHON"];
      const results = NormalizationService.normalizeBatch(keywords);
      expect(results[0].normalized).toBe(results[1].normalized);
      expect(results[1].normalized).toBe(results[2].normalized);
    });
  });
});
