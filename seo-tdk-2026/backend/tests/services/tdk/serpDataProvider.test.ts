/**
 * SERP Data Provider Tests
 *
 * Tests for mock SERP data provider and interface compliance
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  MockSerpDataProvider,
  RealGoogleSerpProvider,
  getSerpDataProvider,
  type ISerpDataProvider,
  type SerpQueryResult,
} from "../../../src/services/tdk/serpDataProvider";

describe("SerpDataProvider", () => {
  // ====================================================================
  // Test Suite 1: MockSerpDataProvider Basic Functionality
  // ====================================================================

  describe("MockSerpDataProvider - Basic Functionality", () => {
    let provider: MockSerpDataProvider;

    beforeEach(() => {
      provider = new MockSerpDataProvider();
      provider.clearCache();
    });

    it("should query SERP data and return 10 results", async () => {
      const result = await provider.querySERP("Python tutorial");

      expect(result).toBeDefined();
      expect(result.query).toBe("Python tutorial");
      expect(result.results).toHaveLength(10);
      expect(result.source).toBe("mock");
    });

    it("should return SerpResult with valid structure", async () => {
      const result = await provider.querySERP("JavaScript");

      const firstResult = result.results[0];
      expect(firstResult.rank).toBe(1);
      expect(firstResult.title).toBeDefined();
      expect(firstResult.description).toBeDefined();
      expect(firstResult.url).toBeDefined();
      expect(firstResult.domain).toBeDefined();
      expect(typeof firstResult.rank).toBe("number");
      expect(typeof firstResult.title).toBe("string");
      expect(typeof firstResult.description).toBe("string");
      expect(typeof firstResult.url).toBe("string");
      expect(typeof firstResult.domain).toBe("string");
    });

    it("should assign sequential ranks 1-10", async () => {
      const result = await provider.querySERP("React tutorial");

      const ranks = result.results.map((r) => r.rank);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("should generate URLs matching query", async () => {
      const query = "machine learning";
      const result = await provider.querySERP(query);

      expect(result.results[0].url).toContain("machine-learning");
      expect(result.results[0].url).toContain("https://");
    });

    it("should set fetchedAt timestamp", async () => {
      const before = new Date();
      const result = await provider.querySERP("test query");
      const after = new Date();

      expect(result.fetchedAt).toBeDefined();
      expect(result.fetchedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(result.fetchedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ====================================================================
  // Test Suite 2: Caching Behavior
  // ====================================================================

  describe("MockSerpDataProvider - Caching", () => {
    let provider: MockSerpDataProvider;

    beforeEach(() => {
      provider = new MockSerpDataProvider();
      provider.clearCache();
    });

    it("should cache results for repeated queries", async () => {
      const query = "cached query";

      const result1 = await provider.querySERP(query);
      const fetchedAt1 = result1.fetchedAt.getTime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result2 = await provider.querySERP(query);
      const fetchedAt2 = result2.fetchedAt.getTime();

      // Should be identical (from cache)
      expect(fetchedAt1).toBe(fetchedAt2);
      expect(JSON.stringify(result1.results)).toBe(
        JSON.stringify(result2.results),
      );
    });

    it("should return cached result without network delay on second query", async () => {
      const query = "perf test";

      await provider.querySERP(query);

      const start = Date.now();
      const result = await provider.querySERP(query);
      const elapsed = Date.now() - start;

      expect(result).toBeDefined();
      // Cached result should be nearly instant (<50ms, vs 50-200ms for fresh query)
      expect(elapsed).toBeLessThan(50);
    });

    it("should return null for non-cached queries with getCached", () => {
      const result = provider.getCached("non-existent", 3600, "en");
      expect(result).toBeNull();
    });

    it("should return cached result with getCached when available", async () => {
      const query = "get cached test";
      const original = await provider.querySERP(query);

      const cached = provider.getCached(query);
      expect(cached).toBeDefined();
      expect(cached?.query).toBe(original.query);
      expect(JSON.stringify(cached?.results)).toBe(
        JSON.stringify(original.results),
      );
    });

    it("should respect maxAge parameter in getCached", async () => {
      const query = "age test";
      await provider.querySERP(query);

      // Immediately get with maxAge=1, should be valid
      const cached1 = provider.getCached(query, 1);
      expect(cached1).toBeDefined();

      // Wait 2 seconds, then check with maxAge=1 (should be expired)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const cached2 = provider.getCached(query, 1);
      expect(cached2).toBeNull();
    });

    it("should clear cache when clearCache is called", async () => {
      const query = "clear test";
      await provider.querySERP(query);

      let cached = provider.getCached(query);
      expect(cached).toBeDefined();

      provider.clearCache();

      cached = provider.getCached(query);
      expect(cached).toBeNull();
    });
  });

  // ====================================================================
  // Test Suite 3: Multilingual Support
  // ====================================================================

  describe("MockSerpDataProvider - Multilingual Support", () => {
    let provider: MockSerpDataProvider;

    beforeEach(() => {
      provider = new MockSerpDataProvider();
      provider.clearCache();
    });

    it("should support English language", async () => {
      const result = await provider.querySERP("Python tutorial", "en");

      expect(result.results[0].title).toBeDefined();
      expect(result.results[0].description).toBeDefined();
      // English titles should contain typical English words
      const combined = result.results
        .map((r) => r.title + r.description)
        .join(" ");
      expect(combined).toMatch(/[a-zA-Z]/);
    });

    it("should support Chinese language", async () => {
      const result = await provider.querySERP("Python教程", "zh");

      expect(result.results[0].title).toBeDefined();
      expect(result.results[0].description).toBeDefined();
      // Check that Chinese results are different from English
      const enResult = await provider.querySERP("Python教程", "en");
      expect(result.results[0].title).not.toBe(enResult.results[0].title);
    });

    it("should default to English when language not specified", async () => {
      const result1 = await provider.querySERP("test");
      const result2 = await provider.querySERP("test", "en");

      expect(result1.results[0].title).toBe(result2.results[0].title);
    });

    it("should return different results for different queries", async () => {
      const result1 = await provider.querySERP("Python");
      const result2 = await provider.querySERP("JavaScript");

      // Results should be different
      expect(result1.results[0].title).not.toBe(result2.results[0].title);
    });
  });

  // ====================================================================
  // Test Suite 4: RealGoogleSerpProvider
  // ====================================================================

  describe("RealGoogleSerpProvider - Fallback to Mock", () => {
    let provider: RealGoogleSerpProvider;

    beforeEach(() => {
      // Clear any API key
      delete process.env.GOOGLE_SERP_API_KEY;
      provider = new RealGoogleSerpProvider();
    });

    it("should implement ISerpDataProvider interface", async () => {
      const result = await provider.querySERP("test");

      expect(result).toBeDefined();
      expect(result.query).toBe("test");
      expect(result.results).toHaveLength(10);
      // Without API key, should use mock as fallback
      expect(result.source).toBe("mock");
    });

    it("should have cache methods", () => {
      expect(provider.getCached("test")).toBeNull();
      expect(provider.clearCache).toBeDefined();
    });

    it("should indicate 'google' source when API key is provided", async () => {
      const providerWithKey = new RealGoogleSerpProvider("fake-api-key");
      const result = await providerWithKey.querySERP("test");

      expect(result.source).toBe("google");
    });
  });

  // ====================================================================
  // Test Suite 5: Factory Function
  // ====================================================================

  describe("getSerpDataProvider - Factory Function", () => {
    beforeEach(() => {
      delete process.env.SERP_PROVIDER;
    });

    it("should return MockSerpDataProvider by default", () => {
      const provider = getSerpDataProvider();
      expect(provider).toBeInstanceOf(MockSerpDataProvider);
    });

    it("should return MockSerpDataProvider when SERP_PROVIDER=mock", () => {
      process.env.SERP_PROVIDER = "mock";
      const provider = getSerpDataProvider();
      expect(provider).toBeInstanceOf(MockSerpDataProvider);
    });

    it("should return RealGoogleSerpProvider when SERP_PROVIDER=google", () => {
      process.env.SERP_PROVIDER = "google";
      const provider = getSerpDataProvider();
      expect(provider).toBeInstanceOf(RealGoogleSerpProvider);
    });

    it("should be case-insensitive", () => {
      process.env.SERP_PROVIDER = "MOCK";
      const provider = getSerpDataProvider();
      expect(provider).toBeInstanceOf(MockSerpDataProvider);

      process.env.SERP_PROVIDER = "GOOGLE";
      const provider2 = getSerpDataProvider();
      expect(provider2).toBeInstanceOf(RealGoogleSerpProvider);
    });
  });

  // ====================================================================
  // Test Suite 6: Integration - ISerpDataProvider Contract
  // ====================================================================

  describe("ISerpDataProvider Contract Compliance", () => {
    const providers: [string, () => ISerpDataProvider][] = [
      ["MockSerpDataProvider", () => new MockSerpDataProvider()],
      ["RealGoogleSerpProvider", () => new RealGoogleSerpProvider()],
    ];

    providers.forEach(([name, factory]) => {
      describe(`${name}`, () => {
        let provider: ISerpDataProvider;

        beforeEach(() => {
          provider = factory();
        });

        it("should implement querySERP method", async () => {
          const result = await provider.querySERP("test query");
          expect(result).toBeDefined();
          expect(result.query).toBe("test query");
          expect(result.results).toBeDefined();
          expect(Array.isArray(result.results)).toBe(true);
        });

        it("should implement getCached method", () => {
          const result = provider.getCached("anything");
          expect(result === null || typeof result === "object").toBe(true);
        });

        it("should implement clearCache method", () => {
          expect(() => provider.clearCache()).not.toThrow();
        });

        it("should accept optional language parameter", async () => {
          const result1 = await provider.querySERP("test");
          const result2 = await provider.querySERP("test", "en");

          expect(result1).toBeDefined();
          expect(result2).toBeDefined();
        });
      });
    });
  });

  // ====================================================================
  // Test Suite 7: Edge Cases and Error Handling
  // ====================================================================

  describe("Edge Cases", () => {
    let provider: MockSerpDataProvider;

    beforeEach(() => {
      provider = new MockSerpDataProvider();
      provider.clearCache();
    });

    it("should handle empty query string", async () => {
      const result = await provider.querySERP("");

      expect(result).toBeDefined();
      expect(result.query).toBe("");
      expect(result.results).toHaveLength(10);
    });

    it("should handle very long query string", async () => {
      const longQuery =
        "A".repeat(500) + " very long query with many words repeated";
      const result = await provider.querySERP(longQuery);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(10);
    });

    it("should handle special characters in query", async () => {
      const query = "test & <special> $characters #query";
      const result = await provider.querySERP(query);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(10);
    });

    it("should handle multiple rapid queries", async () => {
      const queries = ["query1", "query2", "query3", "query4"];
      const results = await Promise.all(
        queries.map((q) => provider.querySERP(q)),
      );

      expect(results).toHaveLength(4);
      results.forEach((r, i) => {
        expect(r.query).toBe(queries[i]);
        expect(r.results).toHaveLength(10);
      });
    });
  });

  // ====================================================================
  // Test Suite 8: Data Consistency
  // ====================================================================

  describe("Data Consistency", () => {
    let provider: MockSerpDataProvider;

    beforeEach(() => {
      provider = new MockSerpDataProvider();
      provider.clearCache();
    });

    it("should generate consistent data for same query", async () => {
      provider.clearCache(); // Clear to force regeneration

      const result1 = await provider.querySERP("consistent test");
      const result2 = await provider.querySERP(
        "consistent test different query",
      );
      const result3 = await provider.querySERP("consistent test");

      // result1 and result3 should be identical (from cache)
      expect(JSON.stringify(result1.results)).toBe(
        JSON.stringify(result3.results),
      );

      // result1 and result2 should be different (different queries)
      expect(JSON.stringify(result1.results)).not.toBe(
        JSON.stringify(result2.results),
      );
    });

    it("should have valid URLs in all results", async () => {
      const result = await provider.querySERP("url test");

      result.results.forEach((r) => {
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.domain).toBeTruthy();
        expect(r.url).toContain(r.domain);
      });
    });

    it("should have non-empty titles and descriptions", async () => {
      const result = await provider.querySERP("content test");

      result.results.forEach((r) => {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.description.length).toBeGreaterThan(0);
        expect(r.title.trim().length).toBeGreaterThan(0);
        expect(r.description.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
