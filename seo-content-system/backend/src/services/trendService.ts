/**
 * Trend Service
 * Manages trend detection via pluggable providers
 */

import { TrendData, TrendLabel, TrendProvider } from "../types/trend.js";
import { GoogleTrendProvider } from "./googleTrendProvider.js";
import { RealGoogleTrendProvider } from "./realGoogleTrendProvider.js";

class StubTrendProvider implements TrendProvider {
  name = "Stub Trend Provider";

  canHandle(keyword: string, locale?: string): boolean {
    return true; // Stub handles all keywords
  }

  async getTrendData(keyword: string, locale?: string): Promise<TrendData> {
    // Phase 2: Replace with real provider (Google Trends, Semrush API, etc.)
    return {
      label: "unknown" as TrendLabel,
      confidence: 0,
      direction: 0,
      seasonalityPattern: "none",
      lastUpdated: Date.now(),
    };
  }

  async getTrendDataBatch(
    keywords: string[],
    locale?: string,
  ): Promise<Record<string, TrendData>> {
    const result: Record<string, TrendData> = {};

    for (const keyword of keywords) {
      result[keyword] = await this.getTrendData(keyword, locale);
    }

    return result;
  }
}

export class TrendService {
  private static providers: TrendProvider[] = [];
  private static defaultProvider: TrendProvider;
  private static cache: Map<string, TrendData> = new Map();
  private static cacheExpiry: Map<string, number> = new Map();

  /**
   * Initialize with default provider
   * Uses GoogleTrendProvider by default, falls back to StubTrendProvider on error
   */
  static initialize() {
    const trendProvider = process.env.TREND_PROVIDER || "google";

    if (trendProvider === "google") {
      this.defaultProvider = new RealGoogleTrendProvider();
    } else if (trendProvider === "heuristic") {
      this.defaultProvider = new GoogleTrendProvider();
    } else {
      this.defaultProvider = new StubTrendProvider();
    }

    this.providers = [this.defaultProvider];
  }

  /**
   * Register additional trend provider
   * Phase 2: Use this to add Google Trends, Semrush, Ahrefs providers
   */
  static registerProvider(provider: TrendProvider) {
    // Check if provider with same name already exists
    const existing = this.providers.find((p) => p.name === provider.name);
    if (existing) {
      const index = this.providers.indexOf(existing);
      this.providers[index] = provider;
    } else {
      this.providers.push(provider);
    }
  }

  /**
   * Get trend data for a keyword
   * Uses cache to avoid repeated requests
   */
  static async getTrendData(
    keyword: string,
    locale: string = "en-US",
  ): Promise<TrendData> {
    const cacheKey = `${keyword}:${locale}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey);
      if (expiry && expiry > Date.now()) {
        return this.cache.get(cacheKey)!;
      }
    }

    // Find suitable provider
    const provider = this.providers.find((p) => p.canHandle(keyword, locale));
    const selectedProvider = provider || this.defaultProvider;

    try {
      const trendData = await selectedProvider.getTrendData(keyword, locale);

      // Cache result for 24 hours
      const ttl = 24 * 60 * 60 * 1000; // 24 hours
      this.cache.set(cacheKey, trendData);
      this.cacheExpiry.set(cacheKey, Date.now() + ttl);

      return trendData;
    } catch (error) {
      console.error(`Error fetching trend data for "${keyword}":`, error);
      // Return unknown on error
      return {
        label: "unknown" as TrendLabel,
        confidence: 0,
        direction: 0,
        seasonalityPattern: "none",
        lastUpdated: Date.now(),
      };
    }
  }

  /**
   * Get trend data for multiple keywords
   */
  static async getTrendDataBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, TrendData>> {
    const results: Record<string, TrendData> = {};

    // Try batch provider if available
    const batchProvider = this.providers.find((p) =>
      keywords.every((k) => p.canHandle(k, locale)),
    );

    if (batchProvider) {
      try {
        return await batchProvider.getTrendDataBatch(keywords, locale);
      } catch (error) {
        console.error(
          "Error in batch trend fetch, falling back to individual",
          error,
        );
      }
    }

    // Fall back to individual requests
    for (const keyword of keywords) {
      results[keyword] = await this.getTrendData(keyword, locale);
    }

    return results;
  }

  /**
   * Clear cache
   * Useful for testing or forcing refresh
   */
  static clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache stats
   */
  static getCacheStats() {
    const now = Date.now();
    const validEntries = Array.from(this.cacheExpiry.entries()).filter(
      ([_, expiry]) => expiry > now,
    ).length;

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries: this.cache.size - validEntries,
      providers: this.providers.map((p) => p.name),
    };
  }

  /**
   * Get list of registered providers
   */
  static listProviders(): string[] {
    return this.providers.map((p) => p.name);
  }
}

// Initialize on module load
TrendService.initialize();
