/**
 * Google Trends Provider
 * Enhanced trend detection using heuristics and keyword patterns
 * Phase 2: Integrates trend analysis without external APIs
 */

import { TrendData, TrendLabel, TrendProvider } from "../types/trend.js";

export class GoogleTrendProvider implements TrendProvider {
  name = "Google Trends Provider";
  private recencyKeywords = [
    "2024",
    "2025",
    "2026",
    "latest",
    "new",
    "newest",
    "recent",
    "current",
    "today",
    "this week",
    "this month",
  ];
  private seasonalKeywords = [
    "christmas",
    "valentine",
    "easter",
    "halloween",
    "new year",
    "summer",
    "winter",
    "spring",
    "fall",
    "holiday",
    "seasonal",
  ];
  private decliningKeywords = [
    "deprecated",
    "legacy",
    "old",
    "obsolete",
    "outdated",
    "dying",
  ];

  canHandle(keyword: string): boolean {
    return true;
  }

  async getTrendData(
    keyword: string,
    locale: string = "en-US",
  ): Promise<TrendData> {
    try {
      const lowerKeyword = keyword.toLowerCase();

      const isRecent = this.hasRecentIndicators(lowerKeyword);
      const isSeasonal = this.hasSeasonalIndicators(lowerKeyword);
      const isDeclining = this.hasDecliningIndicators(lowerKeyword);

      let label: TrendLabel = "stable";
      let confidence = 0.7;

      if (isDeclining) {
        label = "declining";
        confidence = 0.75;
      } else if (isSeasonal) {
        label = "seasonal";
        confidence = 0.8;
      } else if (isRecent) {
        label = "rising";
        confidence = 0.8;
      }

      const direction = this.calculateDirection(
        isRecent,
        isDeclining,
        isSeasonal,
      );
      const seasonalityPattern = isSeasonal
        ? this.detectSeasonalityPattern(lowerKeyword)
        : "none";

      return {
        label,
        confidence,
        direction,
        seasonalityPattern: seasonalityPattern as
          | "monthly"
          | "quarterly"
          | "yearly"
          | "none",
        lastUpdated: Date.now(),
      };
    } catch (error) {
      console.error(`Error analyzing trend data for "${keyword}":`, error);
      return this.createUnknownTrendData();
    }
  }

  async getTrendDataBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, TrendData>> {
    const results: Record<string, TrendData> = {};

    for (const keyword of keywords) {
      results[keyword] = await this.getTrendData(keyword, locale);
    }

    return results;
  }

  private hasRecentIndicators(keyword: string): boolean {
    return this.recencyKeywords.some((indicator) =>
      keyword.includes(indicator),
    );
  }

  private hasSeasonalIndicators(keyword: string): boolean {
    return this.seasonalKeywords.some((indicator) =>
      keyword.includes(indicator),
    );
  }

  private hasDecliningIndicators(keyword: string): boolean {
    return this.decliningKeywords.some((indicator) =>
      keyword.includes(indicator),
    );
  }

  private calculateDirection(
    isRecent: boolean,
    isDeclining: boolean,
    isSeasonal: boolean,
  ): number {
    if (isDeclining) return -0.7;
    if (isRecent) return 0.7;
    if (isSeasonal) return 0.2;
    return 0;
  }

  private detectSeasonalityPattern(keyword: string): string {
    if (keyword.includes("christmas") || keyword.includes("holiday")) {
      return "yearly";
    }
    if (
      keyword.includes("summer") ||
      keyword.includes("winter") ||
      keyword.includes("spring") ||
      keyword.includes("fall")
    ) {
      return "quarterly";
    }
    if (
      keyword.includes("valentine") ||
      keyword.includes("easter") ||
      keyword.includes("halloween")
    ) {
      return "yearly";
    }
    return "none";
  }

  private createUnknownTrendData(): TrendData {
    return {
      label: "unknown",
      confidence: 0,
      direction: 0,
      seasonalityPattern: "none",
      lastUpdated: Date.now(),
    };
  }
}
