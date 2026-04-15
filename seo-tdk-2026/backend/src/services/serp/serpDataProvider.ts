/**
 * SERP Data Provider Interface
 *
 * Abstraction for fetching search engine result page data
 * Supports multiple implementations (mock, Google API, Trends API)
 */

export interface SerpResult {
  /**
   * Position in search results (1-10)
   */
  position: number;

  /**
   * Page title
   */
  title: string;

  /**
   * Meta description
   */
  description: string;

  /**
   * Landing page URL
   */
  url: string;

  /**
   * Domain name
   */
  domain: string;

  /**
   * Estimated relevance score (0-1)
   */
  relevanceScore?: number;
}

export interface SerpQuery {
  /**
   * Search query/topic
   */
  query: string;

  /**
   * Language code
   */
  language?: "en" | "zh";

  /**
   * Number of results to return (default 10)
   */
  limit?: number;
}

/**
 * SERP Data Provider Interface
 *
 * Implementations should fetch search results for a given query
 * and return structured data for analysis
 */
export interface ISerpDataProvider {
  /**
   * Fetch SERP results for a query
   */
  fetch(query: SerpQuery): Promise<SerpResult[]>;

  /**
   * Check if provider is available/healthy
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Base provider with common utilities
 */
export abstract class BaseSerpDataProvider implements ISerpDataProvider {
  abstract fetch(query: SerpQuery): Promise<SerpResult[]>;

  async isAvailable(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate keyword overlap between TDK and SERP result
   */
  protected calculateRelevance(
    tdkKeywords: string[],
    resultTitle: string,
    resultDesc: string,
  ): number {
    const fullText = (resultTitle + " " + resultDesc).toLowerCase();
    const matches = tdkKeywords.filter((kw) =>
      fullText.includes(kw.toLowerCase()),
    ).length;

    return Math.min(matches / Math.max(tdkKeywords.length, 1), 1);
  }
}
