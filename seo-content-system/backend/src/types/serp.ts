/**
 * SERP Types & Provider Interface
 * Extensible SERP analysis with pluggable providers
 */

export type SerpFeature =
  | "featured_snippet"
  | "people_also_ask"
  | "related_searches"
  | "knowledge_panel"
  | "sitelinks"
  | "local_pack"
  | "video_carousel"
  | "image_carousel"
  | "shopping_results"
  | "tweets"
  | "news"
  | "scholar"
  | "map"
  | "calculator"
  | "dictionary"
  | "definition"
  | "quick_answer"
  | "comparison"
  | "ugc_presence"
  | "forum_presence";

export interface SerpResult {
  url: string;
  title: string;
  description?: string;
  position: number;
  domain: string;
}

export interface SerpAnalysis {
  keyword: string;
  topResults: SerpResult[];
  domainDiversity: number; // 0-1: how many unique domains in top 10
  competitionScore: number; // 0-100: estimated difficulty
  features: SerpFeature[];
  forumPresence: boolean; // Reddit, Stack Overflow, etc.
  ugcPresence: boolean; // User generated content
  exactMatchTitleDensity: number; // 0-1: exact match in title %
  avgResultLength: number; // Average content length of top results
  paaCount: number; // People Also Ask count
  lastUpdated: number;
}

export interface SerpProvider {
  /**
   * Provider name for logging/debugging
   */
  name: string;

  /**
   * Get SERP analysis for keyword
   * May use real web scraping or heuristics based on provider
   */
  analyze(keyword: string, locale?: string): Promise<SerpAnalysis>;

  /**
   * Batch analyze multiple keywords
   */
  analyzeBatch(
    keywords: string[],
    locale?: string,
  ): Promise<Record<string, SerpAnalysis>>;
}
