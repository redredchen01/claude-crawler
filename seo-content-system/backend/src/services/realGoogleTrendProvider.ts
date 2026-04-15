/**
 * Real Google Trends Provider
 * Phase 4.2: Real API integration with rate limiting and heuristic fallback
 * Uses @alkalisummer/google-trends-js to fetch actual trend data
 */

import { TrendData, TrendLabel, TrendProvider } from "../types/trend.js";

const RATE_LIMIT_RPS = 5;
const RATE_WINDOW_MS = 1000;

export class RealGoogleTrendProvider implements TrendProvider {
  name = "Real Google Trends Provider";

  // Module-level static rate limiter (shared across all instances)
  private static requestTimestamps: number[] = [];

  canHandle(keyword: string): boolean {
    return keyword.length > 0;
  }

  async getTrendData(
    keyword: string,
    locale: string = "en-US",
  ): Promise<TrendData> {
    await this.enforceRateLimit();

    try {
      const geo = this.localeToGeo(locale);
      const apiData = await this.fetchFromApi(keyword, geo);
      return this.parseApiResponse(apiData, keyword);
    } catch (error) {
      console.warn(
        `[RealGoogleTrendProvider] API failed for "${keyword}", falling back to heuristic`,
        error,
      );
      return this.heuristicFallback(keyword);
    }
  }

  async getTrendDataBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, TrendData>> {
    const results: Record<string, TrendData> = {};

    // Sequential to respect rate limiting
    for (const keyword of keywords) {
      results[keyword] = await this.getTrendData(keyword, locale);
    }

    return results;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();

    // Remove timestamps older than 1 second
    RealGoogleTrendProvider.requestTimestamps =
      RealGoogleTrendProvider.requestTimestamps.filter(
        (t) => now - t < RATE_WINDOW_MS,
      );

    // If at limit, wait
    if (RealGoogleTrendProvider.requestTimestamps.length >= RATE_LIMIT_RPS) {
      const oldestTimestamp = RealGoogleTrendProvider.requestTimestamps[0];
      const waitMs = RATE_WINDOW_MS - (now - oldestTimestamp) + 10; // +10ms buffer

      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    RealGoogleTrendProvider.requestTimestamps.push(Date.now());
  }

  private localeToGeo(locale: string): string {
    const map: Record<string, string> = {
      "en-US": "US",
      "en-GB": "GB",
      "fr-FR": "FR",
      "de-DE": "DE",
      "ja-JP": "JP",
      "zh-CN": "CN",
      "es-ES": "ES",
      "pt-BR": "BR",
      "ko-KR": "KR",
    };

    return map[locale] ?? locale.split("-")[1] ?? "";
  }

  private async fetchFromApi(keyword: string, geo: string): Promise<any> {
    // Dynamic import to avoid test failures if package is absent
    const googleTrends = await import("@alkalisummer/google-trends-js");

    const result = await googleTrends.default.interestOverTime({
      keyword,
      geo,
    });

    // Result may already be an object or JSON string
    if (typeof result === "string") {
      return JSON.parse(result);
    }
    return result;
  }

  private parseApiResponse(data: any, keyword: string): TrendData {
    const timelineData = data?.default?.timelineData ?? [];

    if (!timelineData.length) {
      return this.heuristicFallback(keyword);
    }

    // Extract values from timeline
    const values: number[] = timelineData.map((d: any) => d.value?.[0] ?? 0);

    // Calculate statistics
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Compare early vs late windows to detect trend direction
    const windowSize = Math.max(2, Math.floor(values.length / 5));
    const earlyAvg =
      values.slice(0, windowSize).reduce((a, b) => a + b, 0) / windowSize;
    const lateAvg =
      values.slice(-windowSize).reduce((a, b) => a + b, 0) / windowSize;

    const changeRatio = earlyAvg > 0 ? (lateAvg - earlyAvg) / earlyAvg : 0;
    const direction = Math.max(-1, Math.min(1, changeRatio * 2));

    // Detect seasonality via coefficient of variation
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const coefficientOfVariation = avg > 0 ? Math.sqrt(variance) / avg : 0;
    const isSeasonal = coefficientOfVariation > 0.4;

    // Determine label
    let label: TrendLabel;
    if (isSeasonal) {
      label = "seasonal";
    } else if (changeRatio > 0.2) {
      label = "rising";
    } else if (changeRatio < -0.2) {
      label = "declining";
    } else {
      label = "stable";
    }

    // Confidence based on data completeness (0.5 to 0.95)
    const confidence = Math.min(0.95, 0.5 + (timelineData.length / 90) * 0.45);

    return {
      label,
      confidence,
      direction,
      seasonalityPattern: isSeasonal ? "yearly" : "none",
      lastUpdated: Date.now(),
    };
  }

  private heuristicFallback(keyword: string): TrendData {
    const lower = keyword.toLowerCase();

    const risingTerms = [
      "2024",
      "2025",
      "2026",
      "latest",
      "new",
      "recent",
      "today",
      "this week",
    ];
    const seasonalTerms = [
      "christmas",
      "valentine",
      "summer",
      "winter",
      "holiday",
    ];
    const decliningTerms = [
      "deprecated",
      "legacy",
      "old",
      "obsolete",
      "outdated",
    ];

    if (decliningTerms.some((t) => lower.includes(t))) {
      return {
        label: "declining",
        confidence: 0.5,
        direction: -0.5,
        seasonalityPattern: "none",
        lastUpdated: Date.now(),
      };
    }

    if (seasonalTerms.some((t) => lower.includes(t))) {
      return {
        label: "seasonal",
        confidence: 0.55,
        direction: 0.1,
        seasonalityPattern: "yearly",
        lastUpdated: Date.now(),
      };
    }

    if (risingTerms.some((t) => lower.includes(t))) {
      return {
        label: "rising",
        confidence: 0.5,
        direction: 0.5,
        seasonalityPattern: "none",
        lastUpdated: Date.now(),
      };
    }

    return {
      label: "stable",
      confidence: 0.4,
      direction: 0,
      seasonalityPattern: "none",
      lastUpdated: Date.now(),
    };
  }
}
