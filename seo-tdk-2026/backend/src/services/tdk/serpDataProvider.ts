/**
 * SERP Data Provider
 *
 * Pluggable interface for SERP (Search Engine Results Page) data sources.
 * Supports mock (development) and real (Google API) implementations.
 */

/**
 * Single SERP result from search
 */
export interface SerpResult {
  rank: number; // 1-10
  title: string;
  description: string;
  url: string;
  domain: string;
}

/**
 * SERP query response
 */
export interface SerpQueryResult {
  query: string;
  results: SerpResult[];
  fetchedAt: Date;
  source: "mock" | "google" | "other";
}

/**
 * SERP Data Provider interface
 *
 * Abstract contract for fetching SERP data.
 * Implementations can be mock (static data) or real (Google API).
 */
export interface ISerpDataProvider {
  /**
   * Query SERP data for a keyword or phrase
   *
   * @param query - Search query (e.g., "Python tutorial")
   * @param language - Language code (e.g., "en", "zh")
   * @returns SERP query result with top 10 results
   */
  querySERP(query: string, language?: string): Promise<SerpQueryResult>;

  /**
   * Get cached SERP data if available
   *
   * @param query - Search query
   * @param maxAge - Maximum age in seconds (optional)
   * @param language - Language code (optional, defaults to "en")
   * @returns Cached result or null if not found/expired
   */
  getCached(
    query: string,
    maxAge?: number,
    language?: string,
  ): SerpQueryResult | null;

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void;
}

/**
 * Mock SERP Data Provider
 *
 * Returns static SERP data for development and testing.
 * Used during P3 development before real Google API integration.
 */
export class MockSerpDataProvider implements ISerpDataProvider {
  private cache: Map<string, { result: SerpQueryResult; timestamp: Date }>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate mock SERP data for a query
   *
   * Returns consistent, realistic-looking search results.
   * Different queries return different mock data.
   */
  async querySERP(
    query: string,
    language: string = "en",
  ): Promise<SerpQueryResult> {
    // Check cache first (includes language in cache key)
    const cached = this.getCached(query, 3600, language);
    if (cached) {
      return cached;
    }

    // Simulate network delay (50-200ms)
    await new Promise((resolve) =>
      setTimeout(resolve, 50 + Math.random() * 150),
    );

    // Generate deterministic mock data based on query hash
    const mockResults = this.generateMockResults(query, language);

    const result: SerpQueryResult = {
      query,
      results: mockResults,
      fetchedAt: new Date(),
      source: "mock",
    };

    // Cache for future queries (with language in key)
    const cacheKey = this.getCacheKey(query, language);
    this.cache.set(cacheKey, { result, timestamp: new Date() });

    return result;
  }

  /**
   * Get cache key including language
   */
  private getCacheKey(query: string, language: string = "en"): string {
    return `${query}|${language}`;
  }

  /**
   * Get cached SERP data
   */
  getCached(
    query: string,
    maxAge: number = 3600,
    language: string = "en",
  ): SerpQueryResult | null {
    const cacheKey = this.getCacheKey(query, language);
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const age = (new Date().getTime() - cached.timestamp.getTime()) / 1000;
    if (age > maxAge) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Generate deterministic mock SERP results
   *
   * Uses query content to create varied but consistent results.
   */
  private generateMockResults(query: string, language: string): SerpResult[] {
    // Parse query to identify keywords
    const keywords = query.toLowerCase().split(/\s+/);
    const domainSuggestions = this.getDomainPool(keywords, language);

    const results: SerpResult[] = [];

    // Generate 10 mock results
    for (let i = 0; i < 10; i++) {
      const domain =
        domainSuggestions[i % domainSuggestions.length] ||
        `example${i + 1}.com`;
      const title = this.generateTitle(query, i, language);
      const description = this.generateDescription(query, i, language);

      results.push({
        rank: i + 1,
        title,
        description,
        url: `https://${domain}/${query.replace(/\s+/g, "-")}`,
        domain,
      });
    }

    return results;
  }

  /**
   * Get domain pool suggestions based on keywords
   */
  private getDomainPool(keywords: string[], language: string): string[] {
    // Tech domains
    const techDomains = [
      "medium.com",
      "dev.to",
      "github.com",
      "stackoverflow.com",
      "wikipedia.org",
      "docs.example.com",
      "blog.example.com",
      "tutorial.example.com",
      "guide.example.com",
      "reference.example.com",
    ];

    // Chinese domains
    const zhDomains = [
      "zhihu.com",
      "csdn.net",
      "juejin.cn",
      "segmentfault.com",
      "blog.csdn.net",
      "infoq.cn",
      "oschina.net",
      "tencent.com",
      "baidu.com",
      "sina.com.cn",
    ];

    const domains = language === "zh" ? zhDomains : techDomains;

    // Bias by keywords (e.g., "python" → github, stackoverflow)
    if (
      keywords.some(
        (kw) =>
          ["python", "javascript", "react", "node"].includes(kw) ||
          kw.endsWith("script"),
      )
    ) {
      return [
        ...domains.slice(0, 3),
        "github.com",
        "stackoverflow.com",
        ...domains.slice(3),
      ];
    }

    return domains;
  }

  /**
   * Generate realistic-looking title
   */
  private generateTitle(
    query: string,
    index: number,
    language: string,
  ): string {
    const templates =
      language === "zh"
        ? [
            `${query} - 完全指南 ${index > 0 ? `(${index + 1})` : ""}`,
            `如何 ${query} | 详细教程`,
            `${query}：最佳实践和技巧`,
            `【深度】${query} 完整解析`,
            `${query} 初学者教程`,
          ]
        : [
            `${query} - Complete Guide${index > 0 ? ` (${index + 1})` : ""}`,
            `How to ${query} - Tutorial`,
            `${query}: Best Practices & Tips`,
            `[In-Depth] ${query} Explained`,
            `${query} for Beginners`,
          ];

    return templates[index % templates.length];
  }

  /**
   * Generate realistic-looking description
   */
  private generateDescription(
    query: string,
    index: number,
    language: string,
  ): string {
    const templates =
      language === "zh"
        ? [
            `${query}的完整学习指南。我们涵盖基础知识、高级主题和实际应用。`,
            `在本教程中，学习${query}的所有要点。包括示例代码和最佳实践。`,
            `${query}初学者完整指南。逐步说明和代码示例。`,
            `掌握${query}的关键概念和技巧。适合初学者和进阶用户。`,
            `${query}官方文档、教程和社区资源的汇总。`,
          ]
        : [
            `Complete guide to ${query}. Learn fundamentals, advanced topics, and real-world applications.`,
            `Tutorial on ${query}. Step-by-step instructions with code examples and best practices.`,
            `Beginner's guide to ${query}. Learn the essentials with practical examples.`,
            `Master ${query} with key concepts and techniques. Suitable for all skill levels.`,
            `${query}: Official docs, tutorials, and community resources.`,
          ];

    return templates[index % templates.length];
  }
}

/**
 * Real Google SERP Provider (Stub)
 *
 * To be implemented in Phase 3.3+ when integrating with actual Google API.
 * For now, delegates to MockSerpDataProvider as fallback.
 */
export class RealGoogleSerpProvider implements ISerpDataProvider {
  private mock: MockSerpDataProvider;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_SERP_API_KEY;
    this.mock = new MockSerpDataProvider();

    if (!this.apiKey) {
      console.warn(
        "RealGoogleSerpProvider: No API key provided. Using mock data fallback.",
      );
    }
  }

  async querySERP(
    query: string,
    language: string = "en",
  ): Promise<SerpQueryResult> {
    // TODO: Phase 3.3+ - Implement real Google Search API integration
    // For now, delegate to mock
    const result = await this.mock.querySERP(query, language);
    return {
      ...result,
      source: this.apiKey ? "google" : "mock",
    };
  }

  getCached(
    query: string,
    maxAge?: number,
    language?: string,
  ): SerpQueryResult | null {
    return this.mock.getCached(query, maxAge, language);
  }

  clearCache(): void {
    this.mock.clearCache();
  }
}

/**
 * Factory to get SERP data provider
 *
 * Respects environment variable SERP_PROVIDER:
 * - "mock" (default during Phase 3) - Use MockSerpDataProvider
 * - "google" - Use RealGoogleSerpProvider
 */
export function getSerpDataProvider(): ISerpDataProvider {
  const provider = process.env.SERP_PROVIDER || "mock";

  switch (provider.toLowerCase()) {
    case "google":
      return new RealGoogleSerpProvider();
    case "mock":
    default:
      return new MockSerpDataProvider();
  }
}
