import { describe, it, expect, beforeAll } from "@jest/globals";
import { SerpService } from "../../src/services/serpService.js";
import { SerpProvider, SerpAnalysis } from "../../src/types/serp.js";

describe("SerpService", () => {
  beforeAll(() => {
    SerpService.initialize();
  });

  describe("heuristic SERP analysis", () => {
    it("should analyze a keyword and return valid SERP analysis", async () => {
      const analysis = await SerpService.analyze("how to learn python");

      expect(analysis).toBeDefined();
      expect(analysis.keyword).toBe("how to learn python");
      expect(analysis.competitionScore).toBeGreaterThanOrEqual(0);
      expect(analysis.competitionScore).toBeLessThanOrEqual(100);
      expect(analysis.domainDiversity).toBeGreaterThanOrEqual(0);
      expect(analysis.domainDiversity).toBeLessThanOrEqual(1);
      expect(Array.isArray(analysis.features)).toBe(true);
      expect(analysis.topResults.length).toBeGreaterThan(0);
    });

    it("should generate top 10 results", async () => {
      const analysis = await SerpService.analyze("python");

      expect(analysis.topResults).toHaveLength(10);
      expect(analysis.topResults[0].position).toBe(1);
      expect(analysis.topResults[9].position).toBe(10);
    });

    it("should detect featured snippet for how-to keywords", async () => {
      const analysis = await SerpService.analyze("how to code");

      expect(analysis.features).toContain("featured_snippet");
    });

    it("should detect people also ask for question keywords", async () => {
      const analysis = await SerpService.analyze("what is machine learning");

      expect(analysis.features).toContain("people_also_ask");
    });

    it("should detect knowledge panel for brand keywords", async () => {
      const analysis = await SerpService.analyze("apple company");

      expect(analysis.features).toContain("knowledge_panel");
    });

    it("should detect local pack for location keywords", async () => {
      const analysis = await SerpService.analyze("restaurants near me");

      expect(analysis.features).toContain("local_pack");
    });

    it("should always include related searches", async () => {
      const analysis = await SerpService.analyze("javascript");

      expect(analysis.features).toContain("related_searches");
    });
  });

  describe("competition scoring", () => {
    it("should rate single word keywords as more competitive", async () => {
      const analysis1 = await SerpService.analyze("python");
      const analysis2 = await SerpService.analyze("how to learn python");

      expect(analysis1.competitionScore).toBeGreaterThan(
        analysis2.competitionScore,
      );
    });

    it("should rate commercial keywords as more competitive", async () => {
      const analysis1 = await SerpService.analyze("buy python book");
      const analysis2 = await SerpService.analyze("learn python");

      expect(analysis1.competitionScore).toBeGreaterThan(
        analysis2.competitionScore,
      );
    });

    it("should rate transactional keywords as high competition", async () => {
      const analysis = await SerpService.analyze("purchase python course");

      expect(analysis.competitionScore).toBeGreaterThan(50);
    });

    it("should rate long-tail keywords as less competitive", async () => {
      const shortAnalysis = await SerpService.analyze("python");
      const longAnalysis = await SerpService.analyze(
        "how to learn python for machine learning in 2024",
      );

      expect(shortAnalysis.competitionScore).toBeGreaterThan(
        longAnalysis.competitionScore,
      );
    });

    it("should rate brand keywords as more competitive", async () => {
      const analysis = await SerpService.analyze("official python brand");

      expect(analysis.competitionScore).toBeGreaterThan(50);
    });

    it("should rate fresh/dated keywords as less competitive", async () => {
      const freshAnalysis = await SerpService.analyze("latest python 2024");
      const genericAnalysis = await SerpService.analyze("python");

      expect(genericAnalysis.competitionScore).toBeGreaterThan(
        freshAnalysis.competitionScore,
      );
    });
  });

  describe("forum and UGC detection", () => {
    it("should detect forum indicators in keywords", async () => {
      const analysis = await SerpService.analyze("how to fix python error");

      expect(analysis.forumPresence).toBe(true);
    });

    it("should detect UGC indicators in keywords", async () => {
      const analysis = await SerpService.analyze("python programming tips");

      expect(analysis.ugcPresence).toBe(true);
    });

    it("should not mark forum presence for non-question keywords", async () => {
      const analysis = await SerpService.analyze("python");

      expect(analysis.forumPresence).toBe(false);
    });
  });

  describe("exact match density", () => {
    it("should estimate higher exact match density for transactional keywords", async () => {
      const analysis = await SerpService.analyze("buy python");

      expect(analysis.exactMatchTitleDensity).toBeGreaterThan(0.5);
    });

    it("should estimate lower exact match density for generic keywords", async () => {
      const analysis = await SerpService.analyze("python");

      expect(analysis.exactMatchTitleDensity).toBeLessThan(0.5);
    });
  });

  describe("content length estimation", () => {
    it("should estimate longer content for how-to keywords", async () => {
      const analysisHowTo = await SerpService.analyze("how to learn python");
      const analysisGeneric = await SerpService.analyze("python");

      expect(analysisHowTo.avgResultLength).toBeGreaterThan(
        analysisGeneric.avgResultLength,
      );
    });

    it("should estimate medium length for definition keywords", async () => {
      const analysis = await SerpService.analyze("what is machine learning");

      expect(analysis.avgResultLength).toBeGreaterThan(1000);
      expect(analysis.avgResultLength).toBeLessThan(2000);
    });

    it("should estimate appropriate length for comparison keywords", async () => {
      const analysis = await SerpService.analyze("python vs javascript");

      expect(analysis.avgResultLength).toBeGreaterThan(1500);
    });
  });

  describe("PAA estimation", () => {
    it("should estimate more PAA for question keywords", async () => {
      const analysis = await SerpService.analyze("how do I learn python");

      expect(analysis.paaCount).toBeGreaterThan(0);
    });

    it("should estimate fewer PAA for generic keywords", async () => {
      const analysis = await SerpService.analyze("python");

      // Might have 0-4 PAA
      expect(analysis.paaCount).toBeLessThanOrEqual(4);
    });
  });

  describe("domain diversity", () => {
    it("should calculate domain diversity from top results", async () => {
      const analysis = await SerpService.analyze("python");

      expect(analysis.domainDiversity).toBeGreaterThan(0);
      expect(analysis.domainDiversity).toBeLessThanOrEqual(1);
    });

    it("should have 1.0 diversity for 10 results with 10 unique domains", async () => {
      const analysis = await SerpService.analyze("python");

      // Default heuristic provider generates unique domains
      expect(analysis.domainDiversity).toBe(1.0);
    });
  });

  describe("batch analysis", () => {
    it("should analyze multiple keywords", async () => {
      const keywords = ["python", "javascript", "rust"];

      const results = await SerpService.analyzeBatch(keywords);

      expect(Object.keys(results)).toHaveLength(3);
      for (const keyword of keywords) {
        expect(results[keyword]).toBeDefined();
        expect(results[keyword].competitionScore).toBeGreaterThanOrEqual(0);
      }
    });

    it("should handle large batches", async () => {
      const keywords = Array.from({ length: 50 }, (_, i) => `keyword${i}`);

      const results = await SerpService.analyzeBatch(keywords);

      expect(Object.keys(results)).toHaveLength(50);
    });

    it("should preserve keyword order in batch results", async () => {
      const keywords = ["python", "javascript", "rust"];

      const results = await SerpService.analyzeBatch(keywords);

      expect(results["python"].keyword).toBe("python");
      expect(results["javascript"].keyword).toBe("javascript");
      expect(results["rust"].keyword).toBe("rust");
    });
  });

  describe("custom providers", () => {
    it("should allow setting custom SERP provider", async () => {
      const customProvider: SerpProvider = {
        name: "Custom SERP Provider",
        analyze: async (keyword) => ({
          keyword,
          topResults: [],
          domainDiversity: 0.5,
          competitionScore: 99,
          features: ["custom_feature"],
          forumPresence: true,
          ugcPresence: true,
          exactMatchTitleDensity: 0.8,
          avgResultLength: 5000,
          paaCount: 10,
          lastUpdated: Date.now(),
        }),
        analyzeBatch: async (keywords) => {
          const result: Record<string, SerpAnalysis> = {};
          for (const keyword of keywords) {
            result[keyword] = await customProvider.analyze(keyword);
          }
          return result;
        },
      };

      SerpService.setProvider(customProvider);

      const analysis = await SerpService.analyze("test");
      expect(analysis.competitionScore).toBe(99);
      expect(analysis.features).toContain("custom_feature");
    });

    it("should report provider name", () => {
      const name = SerpService.getProviderName();

      expect(name).toBeDefined();
      expect(typeof name).toBe("string");
    });
  });

  describe("real-world scenarios", () => {
    it("should handle Chinese keywords", async () => {
      const analysis = await SerpService.analyze("如何学 Python 编程");

      expect(analysis).toBeDefined();
      expect(analysis.competitionScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle mixed language keywords", async () => {
      const analysis = await SerpService.analyze("Python 教程 tutorial");

      expect(analysis).toBeDefined();
      expect(analysis.topResults.length).toBeGreaterThan(0);
    });

    it("should handle technical keywords", async () => {
      const analysis = await SerpService.analyze("rest api design patterns");

      expect(analysis).toBeDefined();
      expect(analysis.competitionScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle e-commerce keywords", async () => {
      const analysis = await SerpService.analyze("buy best laptop under 1000");

      expect(analysis.features).toContain("shopping_results");
      expect(analysis.competitionScore).toBeGreaterThan(50);
    });

    it("should handle local keywords", async () => {
      const analysis = await SerpService.analyze(
        "coffee shops near me New York",
      );

      expect(analysis.features).toContain("local_pack");
    });
  });

  describe("edge cases", () => {
    it("should handle very short keywords", async () => {
      const analysis = await SerpService.analyze("ai");

      expect(analysis).toBeDefined();
      expect(analysis.competitionScore).toBeGreaterThan(50);
    });

    it("should handle very long keywords", async () => {
      const longKeyword =
        "how to become a professional web developer in 2024 with no prior experience";
      const analysis = await SerpService.analyze(longKeyword);

      expect(analysis).toBeDefined();
      expect(analysis.competitionScore).toBeLessThan(70);
    });

    it("should handle keywords with special characters", async () => {
      const analysis = await SerpService.analyze("C++ programming guide");

      expect(analysis).toBeDefined();
    });

    it("should handle numeric keywords", async () => {
      const analysis = await SerpService.analyze("2024 trends");

      expect(analysis).toBeDefined();
      expect(analysis.features).toContain("news");
    });
  });
});
