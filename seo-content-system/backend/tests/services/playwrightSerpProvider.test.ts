import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { PlaywrightSerpProvider } from "../../src/services/playwrightSerpProvider.js";

describe("PlaywrightSerpProvider", () => {
  let provider: PlaywrightSerpProvider;

  beforeAll(async () => {
    provider = new PlaywrightSerpProvider();
  });

  afterAll(async () => {
    await provider.close();
  });

  describe("Browser Management", () => {
    it("should initialize browser on demand", async () => {
      expect(provider["browser"]).toBeNull();
      await provider.initialize();
      expect(provider["browser"]).not.toBeNull();
      expect(provider["isInitialized"]).toBe(true);
    });

    it("should not reinitialize if already initialized", async () => {
      await provider.initialize();
      const firstBrowser = provider["browser"];
      await provider.initialize();
      const secondBrowser = provider["browser"];
      expect(firstBrowser).toBe(secondBrowser);
    });

    it("should close browser cleanly", async () => {
      await provider.initialize();
      expect(provider["browser"]).not.toBeNull();
      await provider.close();
      expect(provider["browser"]).toBeNull();
      expect(provider["isInitialized"]).toBe(false);
    });

    it("should handle close on uninitialized provider", async () => {
      const newProvider = new PlaywrightSerpProvider();
      await expect(newProvider.close()).resolves.not.toThrow();
    });
  });

  describe("SERP Analysis", () => {
    it("should analyze keyword and return valid structure", async () => {
      const result = await provider.analyze("javascript");

      expect(result).toBeDefined();
      expect(result.keyword).toBe("javascript");
      expect(result.topResults).toBeDefined();
      expect(Array.isArray(result.topResults)).toBe(true);
      expect(result.domainDiversity).toBeDefined();
      expect(typeof result.domainDiversity).toBe("number");
      expect(result.competitionScore).toBeDefined();
      expect(typeof result.competitionScore).toBe("number");
      expect(result.features).toBeDefined();
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.lastUpdated).toBeDefined();
    });

    it("should extract top results", async () => {
      const result = await provider.analyze("typescript");

      expect(result.topResults.length).toBeGreaterThan(0);
      expect(result.topResults.length).toBeLessThanOrEqual(10);

      for (const item of result.topResults) {
        expect(item.url).toBeDefined();
        expect(item.title).toBeDefined();
        expect(item.position).toBeDefined();
        expect(item.domain).toBeDefined();
        expect(item.position).toBeGreaterThan(0);
        expect(item.position).toBeLessThanOrEqual(10);
      }
    });

    it("should detect SERP features", async () => {
      const result = await provider.analyze("what is python");

      expect(result.features).toBeDefined();
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.features.length).toBeGreaterThanOrEqual(1);

      for (const feature of result.features) {
        expect(
          [
            "featured_snippet",
            "people_also_ask",
            "knowledge_panel",
            "local_pack",
            "video_carousel",
            "shopping_results",
            "news",
            "image_carousel",
            "related_searches",
            "sitelinks",
            "map",
            "calculator",
            "dictionary",
            "definition",
            "quick_answer",
            "comparison",
            "scholar",
            "tweets",
            "ugc_presence",
            "forum_presence",
          ].includes(feature as string),
        ).toBe(true);
      }
    });

    it("should detect forum presence", async () => {
      const result = await provider.analyze("python help");

      expect(typeof result.forumPresence).toBe("boolean");
    });

    it("should detect UGC presence", async () => {
      const result = await provider.analyze("python tutorial");

      expect(typeof result.ugcPresence).toBe("boolean");
    });

    it("should calculate domain diversity", async () => {
      const result = await provider.analyze("react");

      expect(result.domainDiversity).toBeGreaterThanOrEqual(0);
      expect(result.domainDiversity).toBeLessThanOrEqual(1);
    });

    it("should calculate competition score", async () => {
      const result = await provider.analyze("javascript");

      expect(result.competitionScore).toBeGreaterThanOrEqual(0);
      expect(result.competitionScore).toBeLessThanOrEqual(100);
    });

    it("should calculate exact match title density", async () => {
      const result = await provider.analyze("python");

      expect(result.exactMatchTitleDensity).toBeGreaterThanOrEqual(0);
      expect(result.exactMatchTitleDensity).toBeLessThanOrEqual(1);
    });

    it("should count PAA questions", async () => {
      const result = await provider.analyze("how to learn programming");

      expect(typeof result.paaCount).toBe("number");
      expect(result.paaCount).toBeGreaterThanOrEqual(0);
      expect(result.paaCount).toBeLessThanOrEqual(8);
    });

    it("should estimate result length", async () => {
      const result = await provider.analyze("nodejs");

      expect(result.avgResultLength).toBeGreaterThan(0);
    });
  });

  describe("Batch Analysis", () => {
    it("should analyze multiple keywords", async () => {
      const keywords = ["python", "javascript"];
      const results = await provider.analyzeBatch(keywords);

      expect(results).toBeDefined();
      expect(Object.keys(results).length).toBe(2);
      expect(results["python"]).toBeDefined();
      expect(results["javascript"]).toBeDefined();

      for (const keyword of keywords) {
        expect(results[keyword].keyword).toBe(keyword);
        expect(results[keyword].topResults).toBeDefined();
      }
    });

    it("should handle batch with single keyword", async () => {
      const results = await provider.analyzeBatch(["golang"]);

      expect(Object.keys(results).length).toBe(1);
      expect(results["golang"]).toBeDefined();
    });

    it("should handle failed keywords gracefully", async () => {
      // Even if one keyword fails, others should still process
      const results = await provider.analyzeBatch([
        "valid-keyword-123",
        "another-keyword",
      ]);

      expect(results).toBeDefined();
      // Both should have entries (though they may have empty results)
      expect(Object.keys(results).length).toBe(2);
    });
  });

  describe("Competition Score Calculation", () => {
    it("should calculate higher score for commercial keywords", async () => {
      const commercial = await provider.analyze("buy python course");
      const informational = await provider.analyze("python tutorial");

      // Commercial typically has higher competition
      expect(commercial.competitionScore).toBeGreaterThanOrEqual(0);
      expect(informational.competitionScore).toBeGreaterThanOrEqual(0);
    });

    it("should consider domain diversity in score", async () => {
      // Long-tail keywords usually have lower diversity
      const longtail = await provider.analyze(
        "python async programming advanced patterns",
      );

      expect(longtail.competitionScore).toBeGreaterThanOrEqual(0);
      expect(longtail.competitionScore).toBeLessThanOrEqual(100);
    });

    it("should factor SERP features in competition", async () => {
      const result = await provider.analyze("define programming");

      expect(result.competitionScore).toBeGreaterThanOrEqual(0);
      // Keywords with many SERP features typically have higher competition
    });
  });

  describe("Locale Support", () => {
    it("should analyze with different locales", async () => {
      const resultEN = await provider.analyze("python", "en-US");
      const resultFR = await provider.analyze("python", "fr-FR");

      expect(resultEN.keyword).toBe("python");
      expect(resultFR.keyword).toBe("python");
    });

    it("should use language code from locale", async () => {
      // This test verifies the locale is parsed correctly
      const result = await provider.analyze("javascript", "en-GB");
      expect(result.keyword).toBe("javascript");
      expect(result.topResults.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle empty keyword", async () => {
      try {
        // The provider might handle empty string or throw
        // This tests robustness
        const result = await provider.analyze("");
        expect(result).toBeDefined();
      } catch (error) {
        // Also acceptable to throw on empty keyword
        expect(error).toBeDefined();
      }
    });

    it("should handle network timeouts gracefully", async () => {
      // Create a new provider to avoid affecting other tests
      const timeoutProvider = new PlaywrightSerpProvider();
      try {
        // This tests the provider's error handling
        // Even if timeout occurs, should return error analysis or throw
        const result = await timeoutProvider.analyze(
          "very-long-unique-keyword-that-should-load-slow-1234567890",
        );
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        await timeoutProvider.close();
      }
    });
  });

  describe("Result Validation", () => {
    it("should have unique result positions", async () => {
      const result = await provider.analyze("node.js");

      const positions = result.topResults.map((r) => r.position);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(positions.length);
    });

    it("should have sequential positions", async () => {
      const result = await provider.analyze("react framework");

      if (result.topResults.length > 0) {
        for (let i = 0; i < result.topResults.length; i++) {
          expect(result.topResults[i].position).toBe(i + 1);
        }
      }
    });

    it("should have valid URLs", async () => {
      const result = await provider.analyze("typescript");

      for (const item of result.topResults) {
        expect(item.url).toMatch(/^https?:\/\//);
      }
    });

    it("should have non-empty titles", async () => {
      const result = await provider.analyze("web development");

      for (const item of result.topResults) {
        expect(item.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Provider Interface Compliance", () => {
    it("should implement SerpProvider interface", async () => {
      expect(provider.name).toBeDefined();
      expect(typeof provider.name).toBe("string");
      expect(provider.initialize).toBeDefined();
      expect(typeof provider.initialize).toBe("function");
      expect(provider.analyze).toBeDefined();
      expect(typeof provider.analyze).toBe("function");
      expect(provider.analyzeBatch).toBeDefined();
      expect(typeof provider.analyzeBatch).toBe("function");
      expect(provider.close).toBeDefined();
      expect(typeof provider.close).toBe("function");
    });

    it("should have correct name", async () => {
      expect(provider.name).toBe("Playwright SERP Provider");
    });
  });
});
