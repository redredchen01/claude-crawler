/**
 * Real Google Trends Provider Tests
 * Phase 4.2: Tests for API integration with rate limiting and fallback
 */

// Mock @alkalisummer/google-trends-js before imports
jest.mock("@alkalisummer/google-trends-js", () => ({
  default: {
    interestOverTime: jest.fn(),
  },
}));

import { RealGoogleTrendProvider } from "../../src/services/realGoogleTrendProvider";
import googleTrends from "@alkalisummer/google-trends-js";

const mockInterestOverTime = googleTrends.interestOverTime as jest.Mock;

describe("RealGoogleTrendProvider", () => {
  let provider: RealGoogleTrendProvider;

  beforeEach(() => {
    provider = new RealGoogleTrendProvider();
    mockInterestOverTime.mockClear();
  });

  describe("Provider Interface", () => {
    it("should have correct name", () => {
      expect(provider.name).toBe("Real Google Trends Provider");
    });

    it("should handle all non-empty keywords", () => {
      expect(provider.canHandle("test")).toBe(true);
      expect(provider.canHandle("keyword")).toBe(true);
      expect(provider.canHandle("")).toBe(false);
    });
  });

  describe("Trend Detection - Rising", () => {
    it("should detect rising trend when late avg >> early avg", async () => {
      // Mock data: rising trend (values increase over time)
      const mockData = {
        default: {
          timelineData: Array.from({ length: 90 }, (_, i) => ({
            value: [Math.floor((i / 90) * 100)], // 0 to 100
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("rising keyword");

      expect(trendData.label).toBe("rising");
      expect(trendData.confidence).toBeGreaterThan(0.5);
      expect(trendData.direction).toBeGreaterThan(0);
    });
  });

  describe("Trend Detection - Declining", () => {
    it("should detect declining trend when late avg << early avg", async () => {
      // Mock data: declining trend (values decrease over time)
      const mockData = {
        default: {
          timelineData: Array.from({ length: 90 }, (_, i) => ({
            value: [Math.floor(100 - (i / 90) * 100)],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("declining keyword");

      expect(trendData.label).toBe("declining");
      expect(trendData.confidence).toBeGreaterThan(0.5);
      expect(trendData.direction).toBeLessThan(0);
    });
  });

  describe("Trend Detection - Seasonal", () => {
    it("should detect seasonal pattern with high variance", async () => {
      // Mock data: seasonal trend (high variance)
      const baseValues = [10, 20, 15, 10, 80, 90, 85, 80, 20, 25, 15];
      const mockData = {
        default: {
          timelineData: Array.from({ length: 90 }, (_, i) => ({
            value: [baseValues[i % baseValues.length]],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("seasonal keyword");

      expect(trendData.label).toBe("seasonal");
      expect(trendData.seasonalityPattern).toBe("yearly");
    });
  });

  describe("Trend Detection - Stable", () => {
    it("should detect stable trend for flat data", async () => {
      // Mock data: stable trend (constant values)
      const mockData = {
        default: {
          timelineData: Array.from({ length: 90 }, () => ({
            value: [50],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("stable keyword");

      expect(trendData.label).toBe("stable");
      expect(trendData.direction).toBe(0);
    });
  });

  describe("Fallback to Heuristic", () => {
    it("should fallback to heuristic on API failure", async () => {
      mockInterestOverTime.mockRejectedValue(new Error("API rate limited"));

      const trendData = await provider.getTrendData("deprecated framework");

      // Heuristic should detect "deprecated"
      expect(trendData.label).toBe("declining");
      expect(trendData.confidence).toBeLessThan(0.6);
    });

    it("should fallback to heuristic on empty timelineData", async () => {
      const mockData = {
        default: {
          timelineData: [],
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("christmas");

      // Heuristic should detect "christmas"
      expect(trendData.label).toBe("seasonal");
    });
  });

  describe("Confidence Scoring", () => {
    it("should give higher confidence for complete 90-day data", async () => {
      const fullData = {
        default: {
          timelineData: Array.from({ length: 90 }, (_, i) => ({
            value: [50 + Math.random() * 20],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(fullData));
      const fullTrend = await provider.getTrendData("full data");

      // Reset mock and test sparse data
      const sparseData = {
        default: {
          timelineData: Array.from({ length: 10 }, () => ({
            value: [50],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(sparseData));
      const sparseTrend = await provider.getTrendData("sparse data");

      // Full data should have higher confidence
      expect(fullTrend.confidence).toBeGreaterThan(sparseTrend.confidence);
    });
  });

  describe("Rate Limiting", () => {
    it("should process batch of keywords without error", async () => {
      const mockData = {
        default: {
          timelineData: Array.from({ length: 30 }, () => ({
            value: [50],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const keywords = [
        "keyword1",
        "keyword2",
        "keyword3",
        "keyword4",
        "keyword5",
        "keyword6",
      ];

      const results = await provider.getTrendDataBatch(keywords);

      // All keywords should have results
      expect(Object.keys(results).length).toBe(6);
      keywords.forEach((kw) => {
        expect(results[kw]).toBeDefined();
        expect(results[kw].label).toBeDefined();
      });
    });
  });

  describe("Locale Mapping", () => {
    it("should map locale codes to geographic codes", async () => {
      const mockData = {
        default: {
          timelineData: Array.from({ length: 30 }, () => ({
            value: [50],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      await provider.getTrendData("test", "en-US");

      // Verify the mock was called with correct geo code
      expect(mockInterestOverTime).toHaveBeenCalledWith(
        expect.objectContaining({
          geo: "US",
        }),
      );

      mockInterestOverTime.mockClear();
      await provider.getTrendData("test", "de-DE");

      expect(mockInterestOverTime).toHaveBeenCalledWith(
        expect.objectContaining({
          geo: "DE",
        }),
      );
    });
  });

  describe("Batch Processing", () => {
    it("should return all keywords in result object", async () => {
      const mockData = {
        default: {
          timelineData: Array.from({ length: 30 }, () => ({
            value: [50],
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const keywords = ["keyword1", "keyword2", "keyword3"];
      const results = await provider.getTrendDataBatch(keywords);

      expect(Object.keys(results)).toHaveLength(3);
      keywords.forEach((kw) => {
        expect(results[kw]).toBeDefined();
        expect(results[kw].label).toMatch(
          /rising|declining|seasonal|stable|unknown/,
        );
      });
    });
  });

  describe("Data Parsing", () => {
    it("should correctly calculate direction from early vs late window", async () => {
      // Specifically rising trend
      const mockData = {
        default: {
          timelineData: Array.from({ length: 90 }, (_, i) => ({
            value: [i * 2], // Linear increase
          })),
        },
      };

      mockInterestOverTime.mockResolvedValue(JSON.stringify(mockData));

      const trendData = await provider.getTrendData("test");

      // Direction should be positive for rising data
      expect(trendData.direction).toBeGreaterThan(0);
      expect(trendData.direction).toBeLessThanOrEqual(1);
    });
  });
});
