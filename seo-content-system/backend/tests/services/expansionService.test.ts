import { describe, it, expect } from "@jest/globals";
import { KeywordExpansionService } from "../../src/services/expansionService";

describe("KeywordExpansionService", () => {
  describe("expandKeyword", () => {
    it('should expand "AI工具" with default config', async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const candidates = await KeywordExpansionService.expandKeyword(
        "AI工具",
        config,
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].keyword).toBe("AI工具"); // Original
      expect(candidates.some((c) => c.sourceType === "original")).toBe(true);
    });

    it("should generate a-z suffixes", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.strategies = config.strategies.filter(
        (s) => s.type === "a_z_suffix",
      );

      const candidates = await KeywordExpansionService.expandKeyword(
        "SEO",
        config,
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((c) => c.keyword === "SEOa")).toBe(true);
      expect(candidates.some((c) => c.keyword === "SEOz")).toBe(true);
    });

    it("should generate numeric suffixes", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.strategies = config.strategies.filter(
        (s) => s.type === "numeric_suffix",
      );

      const candidates = await KeywordExpansionService.expandKeyword(
        "Python",
        config,
      );

      expect(candidates.some((c) => c.keyword === "Python0")).toBe(true);
      expect(candidates.some((c) => c.keyword === "Python2024")).toBe(true);
    });

    it("should generate question modifiers", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.strategies = config.strategies.filter(
        (s) => s.type === "question_modifiers",
      );

      const candidates = await KeywordExpansionService.expandKeyword(
        "React",
        config,
      );

      expect(
        candidates.some(
          (c) => c.keyword.includes("怎么") || c.keyword.includes("如何"),
        ),
      ).toBe(true);
    });

    it("should deduplicate by default", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.strategies = [
        { type: "original", enabled: true },
        { type: "space_modifier", enabled: true },
      ];

      const candidates = await KeywordExpansionService.expandKeyword(
        "test",
        config,
      );

      // Check no duplicates
      const keywords = candidates.map((c) => c.keyword);
      const unique = new Set(keywords);
      expect(unique.size).toBe(keywords.length);
    });

    it("should respect totalMaxCandidates limit", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.totalMaxCandidates = 50;

      const candidates = await KeywordExpansionService.expandKeyword(
        "keyword",
        config,
      );

      expect(candidates.length).toBeLessThanOrEqual(50);
    });

    it("should handle empty seed keyword", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const candidates = await KeywordExpansionService.expandKeyword(
        "",
        config,
      );

      expect(Array.isArray(candidates)).toBe(true);
    });

    it("should mark correct source types", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      config.strategies = [
        { type: "original", enabled: true },
        { type: "a_z_suffix", enabled: true },
      ];

      const candidates = await KeywordExpansionService.expandKeyword(
        "test",
        config,
      );

      const original = candidates.find((c) => c.sourceType === "original");
      expect(original).toBeDefined();
      expect(original?.depth).toBe(0);

      const aZ = candidates.find((c) => c.sourceType === "a_z_suffix");
      expect(aZ).toBeDefined();
      expect(aZ?.depth).toBe(1);
    });
  });

  describe("getDefaultConfig", () => {
    it("should return valid expansion config", () => {
      const config = KeywordExpansionService.getDefaultConfig();

      expect(config.strategies.length).toBeGreaterThan(0);
      expect(config.maxCandidatesPerStrategy).toBeGreaterThan(0);
      expect(config.totalMaxCandidates).toBeGreaterThan(0);
      expect(typeof config.deduplication).toBe("boolean");
      expect(config.expandDepth).toBeGreaterThanOrEqual(1);
    });

    it("should have all expected strategies", () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const types = config.strategies.map((s) => s.type);

      expect(types).toContain("original");
      expect(types).toContain("question_modifiers");
      expect(types).toContain("comparison_modifiers");
    });
  });

  describe('Scenario: "AI" keyword expansion', () => {
    it("should generate comprehensive AI-related keywords", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const candidates = await KeywordExpansionService.expandKeyword(
        "AI",
        config,
      );

      // Verify all sources present
      const sources = new Set(candidates.map((c) => c.sourceType));
      expect(sources.size).toBeGreaterThan(1);

      // Verify some expected results
      expect(candidates.map((c) => c.keyword)).toContain("AI");
      expect(
        candidates.map((c) => c.keyword).some((k) => k.includes("怎么")),
      ).toBe(true);

      console.log(`Generated ${candidates.length} candidates for "AI"`);
    });
  });

  describe("Edge cases", () => {
    it("should handle special characters", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const candidates = await KeywordExpansionService.expandKeyword(
        "C++",
        config,
      );

      expect(candidates.length).toBeGreaterThan(0);
    });

    it("should handle CJK characters", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const candidates = await KeywordExpansionService.expandKeyword(
        "人工智能",
        config,
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].keyword).toBe("人工智能");
    });

    it("should handle very long keywords", async () => {
      const config = KeywordExpansionService.getDefaultConfig();
      const longKeyword = "这是一个很长的关键词组合用来测试系统是否能正确处理";
      const candidates = await KeywordExpansionService.expandKeyword(
        longKeyword,
        config,
      );

      expect(candidates.length).toBeGreaterThan(0);
    });
  });
});
