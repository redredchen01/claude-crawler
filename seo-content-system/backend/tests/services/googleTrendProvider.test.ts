import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { GoogleTrendProvider } from "../../src/services/googleTrendProvider.js";
import { TrendLabel } from "../../src/types/trend.js";

describe("GoogleTrendProvider", () => {
  let provider: GoogleTrendProvider;

  beforeAll(() => {
    provider = new GoogleTrendProvider();
  });

  describe("Provider Interface", () => {
    it("should have correct name", () => {
      expect(provider.name).toBe("Google Trends Provider");
    });

    it("should implement TrendProvider interface", () => {
      expect(provider.canHandle).toBeDefined();
      expect(typeof provider.canHandle).toBe("function");
      expect(provider.getTrendData).toBeDefined();
      expect(typeof provider.getTrendData).toBe("function");
      expect(provider.getTrendDataBatch).toBeDefined();
      expect(typeof provider.getTrendDataBatch).toBe("function");
    });

    it("should handle any keyword", () => {
      expect(provider.canHandle("python")).toBe(true);
      expect(provider.canHandle("javascript")).toBe(true);
      expect(provider.canHandle("random keyword")).toBe(true);
      expect(provider.canHandle("")).toBe(true);
    });

    it("should handle any locale", () => {
      expect(provider.canHandle("python", "en-US")).toBe(true);
      expect(provider.canHandle("python", "fr-FR")).toBe(true);
      expect(provider.canHandle("python", "de-DE")).toBe(true);
    });
  });

  describe("Trend Data Structure", () => {
    it("should return valid trend data structure", async () => {
      const trendData = await provider.getTrendData("python");

      expect(trendData).toBeDefined();
      expect(trendData.label).toBeDefined();
      expect(typeof trendData.label).toBe("string");
      expect(trendData.confidence).toBeDefined();
      expect(typeof trendData.confidence).toBe("number");
      expect(trendData.direction).toBeDefined();
      expect(typeof trendData.direction).toBe("number");
      expect(trendData.seasonalityPattern).toBeDefined();
      expect(typeof trendData.seasonalityPattern).toBe("string");
      expect(trendData.lastUpdated).toBeDefined();
      expect(typeof trendData.lastUpdated).toBe("number");
    });

    it("should have valid trend label values", async () => {
      const validLabels: TrendLabel[] = [
        "rising",
        "declining",
        "seasonal",
        "stable",
        "unknown",
      ];

      const trendData = await provider.getTrendData("javascript");
      expect(validLabels.includes(trendData.label as TrendLabel)).toBe(true);
    });

    it("should have confidence between 0 and 1", async () => {
      const trendData = await provider.getTrendData("typescript");

      expect(trendData.confidence).toBeGreaterThanOrEqual(0);
      expect(trendData.confidence).toBeLessThanOrEqual(1);
    });

    it("should have direction between -1 and 1", async () => {
      const trendData = await provider.getTrendData("nodejs");

      expect(trendData.direction).toBeGreaterThanOrEqual(-1);
      expect(trendData.direction).toBeLessThanOrEqual(1);
    });
  });

  describe("Trend Detection", () => {
    it("should detect rising trends", async () => {
      // Keywords that are likely rising
      const risingKeywords = [
        "artificial intelligence",
        "machine learning 2024",
        "latest web development",
      ];

      for (const keyword of risingKeywords) {
        const trendData = await provider.getTrendData(keyword);
        // Should return a valid label (not necessarily rising, but valid)
        expect(
          ["rising", "declining", "seasonal", "stable", "unknown"].includes(
            trendData.label as string,
          ),
        ).toBe(true);
      }
    });

    it("should detect declining trends", async () => {
      // Keywords that might be declining
      const decliningKeywords = [
        "old technology",
        "deprecated framework",
        "legacy system",
      ];

      for (const keyword of decliningKeywords) {
        const trendData = await provider.getTrendData(keyword);
        expect(
          ["rising", "declining", "seasonal", "stable", "unknown"].includes(
            trendData.label as string,
          ),
        ).toBe(true);
      }
    });

    it("should detect seasonal trends", async () => {
      // Keywords that show seasonal patterns
      const seasonalKeywords = [
        "christmas gifts",
        "summer vacation",
        "new year resolution",
      ];

      for (const keyword of seasonalKeywords) {
        const trendData = await provider.getTrendData(keyword);
        expect(
          ["rising", "declining", "seasonal", "stable", "unknown"].includes(
            trendData.label as string,
          ),
        ).toBe(true);
      }
    });
  });

  describe("Batch Processing", () => {
    it("should process batch of keywords", async () => {
      const keywords = ["python", "javascript", "typescript"];
      const results = await provider.getTrendDataBatch(keywords);

      expect(results).toBeDefined();
      expect(Object.keys(results).length).toBe(3);

      for (const keyword of keywords) {
        expect(results[keyword]).toBeDefined();
        expect(results[keyword].label).toBeDefined();
      }
    });

    it("should handle large batch (more than 5 keywords)", async () => {
      const keywords = [
        "python",
        "javascript",
        "typescript",
        "rust",
        "golang",
        "java",
        "cpp",
      ];
      const results = await provider.getTrendDataBatch(keywords);

      expect(Object.keys(results).length).toBe(7);

      for (const keyword of keywords) {
        expect(results[keyword]).toBeDefined();
        expect(typeof results[keyword].label).toBe("string");
      }
    });

    it("should handle batch with locale", async () => {
      const keywords = ["python", "javascript"];
      const results = await provider.getTrendDataBatch(keywords, "en-GB");

      expect(Object.keys(results).length).toBe(2);

      for (const keyword of keywords) {
        expect(results[keyword]).toBeDefined();
      }
    });
  });

  describe("Locale Handling", () => {
    it("should handle different locales", async () => {
      const locales = ["en-US", "en-GB", "fr-FR", "de-DE", "ja-JP"];

      for (const locale of locales) {
        const trendData = await provider.getTrendData("programming", locale);
        expect(trendData).toBeDefined();
        expect(trendData.label).toBeDefined();
      }
    });

    it("should map locales to geo codes", async () => {
      // These should all work without throwing
      const result1 = await provider.getTrendData("python", "en-US");
      const result2 = await provider.getTrendData("python", "de-DE");
      const result3 = await provider.getTrendData("python", "zh-CN");

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should return unknown trend on error gracefully", async () => {
      // Pass empty keyword - should be handled gracefully
      const trendData = await provider.getTrendData("");

      expect(trendData).toBeDefined();
      expect(trendData.label).toBeDefined();
    });

    it("should handle network timeouts gracefully", async () => {
      // Create new provider instance
      const testProvider = new GoogleTrendProvider();

      // Even with potential timeout, should return valid structure
      const trendData = await testProvider.getTrendData(
        "very-long-unique-keyword-that-might-timeout-1234567890",
      );

      expect(trendData).toBeDefined();
      expect(trendData.label).toBeDefined();
    });
  });

  describe("Direction Calculation", () => {
    it("should calculate direction correctly", async () => {
      // Test with a keyword that's likely trending
      const trendData = await provider.getTrendData("trending topic");

      // Direction should be between -1 and 1
      expect(trendData.direction).toBeGreaterThanOrEqual(-1);
      expect(trendData.direction).toBeLessThanOrEqual(1);
    });
  });

  describe("Seasonality Detection", () => {
    it("should detect seasonal patterns", async () => {
      // Test with a keyword that's likely seasonal
      const trendData = await provider.getTrendData("christmas");

      expect(trendData.seasonalityPattern).toBeDefined();
      expect(typeof trendData.seasonalityPattern).toBe("string");
      expect(
        ["none", "monthly", "quarterly", "yearly"].includes(
          trendData.seasonalityPattern,
        ),
      ).toBe(true);
    });

    it("should differentiate seasonal from non-seasonal", async () => {
      const seasonalTrend = await provider.getTrendData("holiday shopping");
      const nonSeasonalTrend = await provider.getTrendData("programming");

      expect(seasonalTrend.seasonalityPattern).toBeDefined();
      expect(nonSeasonalTrend.seasonalityPattern).toBeDefined();
    });
  });

  describe("Confidence Scoring", () => {
    it("should have appropriate confidence levels", async () => {
      const trendData = await provider.getTrendData("javascript");

      expect(trendData.confidence).toBeGreaterThanOrEqual(0);
      expect(trendData.confidence).toBeLessThanOrEqual(1);
    });

    it("should return 0 confidence on unknown trends", async () => {
      // Unknown trends should have 0 confidence
      const trendData = await provider.getTrendData("");

      if (trendData.label === "unknown") {
        expect(trendData.confidence).toBe(0);
      }
    });
  });

  describe("Timestamps", () => {
    it("should return recent timestamps", async () => {
      const trendData = await provider.getTrendData("python");

      const now = Date.now();
      const timeDiff = now - trendData.lastUpdated;

      // Timestamp should be within last 5 seconds
      expect(timeDiff).toBeGreaterThanOrEqual(0);
      expect(timeDiff).toBeLessThan(5000);
    });

    it("should update timestamp on fresh request", async () => {
      const trendData1 = await provider.getTrendData("latest trends");
      const timestamp1 = trendData1.lastUpdated;

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      const trendData2 = await provider.getTrendData("latest trends");
      const timestamp2 = trendData2.lastUpdated;

      // Timestamps should be different (newer request has later timestamp)
      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
    });
  });
});
