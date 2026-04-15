/**
 * Tests for MockSerpDataProvider
 */

import { MockSerpDataProvider } from "../../../src/services/serp/mockSerpDataProvider";

describe("MockSerpDataProvider", () => {
  let provider: MockSerpDataProvider;

  beforeEach(() => {
    provider = new MockSerpDataProvider();
  });

  it("should fetch SERP results for known queries", async () => {
    const results = await provider.fetch({
      query: "web development",
      language: "en",
    });

    expect(results).toHaveLength(3);
    expect(results[0].position).toBe(1);
    expect(results[0].domain).toBe("developer.mozilla.org");
  });

  it("should fetch React results", async () => {
    const results = await provider.fetch({ query: "react" });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain("React");
  });

  it("should respect limit parameter", async () => {
    const results = await provider.fetch({
      query: "python",
      limit: 2,
    });

    expect(results).toHaveLength(2);
  });

  it("should generate synthetic results for unknown queries", async () => {
    const results = await provider.fetch({ query: "unknown topic xyz" });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain("unknown topic xyz");
  });

  it("should be available", async () => {
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it("should have relevance scores", async () => {
    const results = await provider.fetch({ query: "react" });

    results.forEach((result) => {
      expect(result.relevanceScore).toBeDefined();
      expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(result.relevanceScore).toBeLessThanOrEqual(1);
    });
  });
});
