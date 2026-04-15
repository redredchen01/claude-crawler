import { describe, it, expect, beforeEach } from "@jest/globals";
import { TrendService } from "../../src/services/trendService.js";
import { TrendProvider, TrendData, TrendLabel } from "../../src/types/trend.js";

// Use stub provider for tests to ensure deterministic behavior
process.env.TREND_PROVIDER = "stub";

describe("TrendService", () => {
  beforeEach(() => {
    TrendService.clearCache();
  });

  describe("stub provider", () => {
    it("should return unknown trend by default", async () => {
      const trend = await TrendService.getTrendData("python");

      expect(trend).toBeDefined();
      expect(trend.label).toBe("unknown");
      expect(trend.confidence).toBe(0);
      expect(trend.direction).toBe(0);
      expect(trend.seasonalityPattern).toBe("none");
    });

    it("should handle any keyword", async () => {
      const keywords = ["python", "javascript", "react", "machine learning"];

      for (const keyword of keywords) {
        const trend = await TrendService.getTrendData(keyword);
        expect(trend.label).toBe("unknown");
      }
    });

    it("should respect locale parameter", async () => {
      const trend1 = await TrendService.getTrendData("python", "en-US");
      const trend2 = await TrendService.getTrendData("python", "zh-CN");

      // Both should have same structure (cache is per locale)
      expect(trend1).toBeDefined();
      expect(trend2).toBeDefined();
    });
  });

  describe("caching", () => {
    it("should cache results", async () => {
      const keyword = "react";

      // First call
      const trend1 = await TrendService.getTrendData(keyword);

      // Second call should return cached result
      const trend2 = await TrendService.getTrendData(keyword);

      expect(trend1).toEqual(trend2);
    });

    it("should have separate cache entries per locale", async () => {
      const keyword = "python";

      const trendUS = await TrendService.getTrendData(keyword, "en-US");
      const trendCN = await TrendService.getTrendData(keyword, "zh-CN");

      // Both should be cached separately
      const stats = TrendService.getCacheStats();
      expect(stats.validEntries).toBeGreaterThanOrEqual(2);
    });

    it("should return cached results without re-fetching", async () => {
      let fetchCount = 0;

      // Register mock provider to count fetches
      const mockProvider: TrendProvider = {
        name: "Mock Provider",
        canHandle: () => true,
        getTrendData: async () => {
          fetchCount++;
          return {
            label: "stable" as TrendLabel,
            confidence: 0.8,
            direction: 0,
            seasonalityPattern: "none",
            lastUpdated: Date.now(),
          };
        },
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const kw of keywords) {
            result[kw] = await mockProvider.getTrendData(kw);
          }
          return result;
        },
      };

      TrendService.registerProvider(mockProvider);
      TrendService.clearCache();

      // First fetch
      await TrendService.getTrendData("test");
      expect(fetchCount).toBe(1);

      // Second fetch should use cache
      await TrendService.getTrendData("test");
      expect(fetchCount).toBe(1); // Should not increment
    });

    it("should clear cache", async () => {
      await TrendService.getTrendData("python");
      const stats1 = TrendService.getCacheStats();
      expect(stats1.validEntries).toBeGreaterThan(0);

      TrendService.clearCache();
      const stats2 = TrendService.getCacheStats();
      expect(stats2.validEntries).toBe(0);
    });

    it("should report cache statistics", async () => {
      await TrendService.getTrendData("python");
      await TrendService.getTrendData("javascript");

      const stats = TrendService.getCacheStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
      expect(stats.validEntries).toBeGreaterThanOrEqual(2);
      expect(stats.providers.length).toBeGreaterThan(0);
    });
  });

  describe("batch operations", () => {
    it("should get trend data for multiple keywords", async () => {
      const keywords = ["python", "javascript", "react"];

      const trends = await TrendService.getTrendDataBatch(keywords);

      expect(Object.keys(trends)).toHaveLength(3);
      for (const keyword of keywords) {
        expect(trends[keyword]).toBeDefined();
        expect(trends[keyword].label).toBe("unknown");
      }
    });

    it("should cache batch results", async () => {
      const keywords = ["python", "javascript"];

      // First batch
      const trends1 = await TrendService.getTrendDataBatch(keywords);

      // Second batch should use cache
      const trends2 = await TrendService.getTrendDataBatch(keywords);

      expect(trends1).toEqual(trends2);
    });

    it("should handle large keyword batches", async () => {
      const keywords = Array.from({ length: 100 }, (_, i) => `keyword${i}`);

      const trends = await TrendService.getTrendDataBatch(keywords);

      expect(Object.keys(trends)).toHaveLength(100);
      expect(Object.values(trends).every((t) => t.label === "unknown")).toBe(
        true,
      );
    });
  });

  describe("custom providers", () => {
    it("should register custom provider", () => {
      const customProvider: TrendProvider = {
        name: "Custom Provider",
        canHandle: () => true,
        getTrendData: async () => ({
          label: "rising" as TrendLabel,
          confidence: 0.9,
          direction: 1,
          seasonalityPattern: "yearly",
          lastUpdated: Date.now(),
        }),
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const keyword of keywords) {
            result[keyword] = await customProvider.getTrendData(keyword);
          }
          return result;
        },
      };

      TrendService.registerProvider(customProvider);

      const providers = TrendService.listProviders();
      expect(providers).toContain("Custom Provider");
    });

    it("should use custom provider if it can handle keyword", async () => {
      TrendService.clearCache();

      const customProvider: TrendProvider = {
        name: "Rising Trend Provider",
        canHandle: (keyword) => keyword.includes("react"),
        getTrendData: async (keyword) => ({
          label: "rising" as TrendLabel,
          confidence: 0.95,
          direction: 1,
          seasonalityPattern: "none",
          lastUpdated: Date.now(),
        }),
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const kw of keywords) {
            result[kw] = await customProvider.getTrendData(kw);
          }
          return result;
        },
      };

      TrendService.registerProvider(customProvider);

      const trend = await TrendService.getTrendData("react");
      expect(trend.label).toBe("rising");
      expect(trend.confidence).toBe(0.95);
    });

    it("should fallback to default provider if custom cannot handle", async () => {
      TrendService.clearCache();

      const limitedProvider: TrendProvider = {
        name: "Limited Provider",
        canHandle: (keyword) => keyword === "specific",
        getTrendData: async () => ({
          label: "stable" as TrendLabel,
          confidence: 0.9,
          direction: 0,
          seasonalityPattern: "none",
          lastUpdated: Date.now(),
        }),
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const kw of keywords) {
            result[kw] = await limitedProvider.getTrendData(kw);
          }
          return result;
        },
      };

      TrendService.registerProvider(limitedProvider);

      // This keyword is not "specific", so should use default
      const trend = await TrendService.getTrendData("python");
      expect(trend.label).toBe("unknown");
    });

    it("should replace provider with same name", async () => {
      const provider1: TrendProvider = {
        name: "Replaceable",
        canHandle: () => true,
        getTrendData: async () => ({
          label: "stable" as TrendLabel,
          confidence: 0.5,
          direction: 0,
          seasonalityPattern: "none",
          lastUpdated: Date.now(),
        }),
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const kw of keywords) {
            result[kw] = await provider1.getTrendData(kw);
          }
          return result;
        },
      };

      const provider2: TrendProvider = {
        name: "Replaceable",
        canHandle: () => true,
        getTrendData: async () => ({
          label: "rising" as TrendLabel,
          confidence: 0.9,
          direction: 1,
          seasonalityPattern: "none",
          lastUpdated: Date.now(),
        }),
        getTrendDataBatch: async (keywords) => {
          const result: Record<string, TrendData> = {};
          for (const kw of keywords) {
            result[kw] = await provider2.getTrendData(kw);
          }
          return result;
        },
      };

      TrendService.registerProvider(provider1);
      TrendService.clearCache();

      let trend = await TrendService.getTrendData("test");
      expect(trend.label).toBe("stable");

      TrendService.registerProvider(provider2);
      TrendService.clearCache();

      trend = await TrendService.getTrendData("test");
      expect(trend.label).toBe("rising");
    });
  });

  describe("error handling", () => {
    it("should return unknown on provider error", async () => {
      const errorProvider: TrendProvider = {
        name: "Error Provider",
        canHandle: () => true,
        getTrendData: async () => {
          throw new Error("Provider unavailable");
        },
        getTrendDataBatch: async (keywords) => {
          throw new Error("Batch unavailable");
        },
      };

      TrendService.registerProvider(errorProvider);
      TrendService.clearCache();

      const trend = await TrendService.getTrendData("python");
      expect(trend.label).toBe("unknown");
      expect(trend.confidence).toBe(0);
    });
  });

  describe("provider listing", () => {
    it("should list all registered providers", () => {
      const providers = TrendService.listProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.includes("Stub"))).toBe(true);
    });
  });

  describe("Google Trends integration", () => {
    it("should initialize with stub provider for tests", () => {
      const providers = TrendService.listProviders();
      // In test environment with TREND_PROVIDER=stub
      expect(providers.some((p) => p.includes("Stub"))).toBe(true);
    });

    it("should support registering GoogleTrendProvider", async () => {
      // Import GoogleTrendProvider
      const { GoogleTrendProvider } =
        await import("../../src/services/googleTrendProvider.js");

      const googleProvider = new GoogleTrendProvider();
      TrendService.registerProvider(googleProvider);

      const providers = TrendService.listProviders();
      expect(providers).toContain("Google Trends Provider");
    });

    it("should handle Google provider initialization", async () => {
      const { GoogleTrendProvider } =
        await import("../../src/services/googleTrendProvider.js");

      const provider = new GoogleTrendProvider();
      expect(provider.name).toBe("Google Trends Provider");
      expect(provider.canHandle("any keyword")).toBe(true);
    });
  });
});
