/**
 * Trend Types & Provider Interface
 * Extensible trend detection with pluggable providers
 */

export type TrendLabel =
  | "stable"
  | "seasonal"
  | "rising"
  | "declining"
  | "unknown";

export interface TrendData {
  label: TrendLabel;
  confidence: number; // 0-1: how confident is this trend prediction
  direction?: number; // -1 (declining), 0 (stable), 1 (rising)
  seasonalityPattern?: "monthly" | "quarterly" | "yearly" | "none";
  lastUpdated: number; // timestamp
}

export interface TrendProviderConfig {
  /**
   * Provider type: google, semrush, ahrefs, internal, stub
   */
  type: "google" | "semrush" | "ahrefs" | "internal" | "stub";

  /**
   * Optional API key for external providers
   */
  apiKey?: string;

  /**
   * Cache TTL in seconds (default 24 hours)
   */
  cacheTtl?: number;

  /**
   * Enable/disable this provider
   */
  enabled: boolean;
}

export interface TrendProvider {
  /**
   * Provider name for logging/debugging
   */
  name: string;

  /**
   * Check if provider can handle this keyword
   */
  canHandle(keyword: string, locale?: string): boolean;

  /**
   * Get trend data for keyword
   */
  getTrendData(keyword: string, locale?: string): Promise<TrendData>;

  /**
   * Batch get trend data
   */
  getTrendDataBatch(
    keywords: string[],
    locale?: string,
  ): Promise<Record<string, TrendData>>;
}
