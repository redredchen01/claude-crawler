/**
 * SERP Analysis Service
 * Heuristic SERP competition scoring without web scraping
 * Phase 2: Replace with real Playwright scraping or API integration
 */

import {
  SerpAnalysis,
  SerpProvider,
  SerpFeature,
  SerpResult,
} from "../types/serp.js";
import { PlaywrightSerpProvider } from "./playwrightSerpProvider.js";

/**
 * Heuristic SERP Provider
 * Estimates competition & SERP features based on keyword characteristics
 * No actual web scraping in Phase 1
 */
class HeuristicSerpProvider implements SerpProvider {
  name = "Heuristic SERP Provider";

  async analyze(
    keyword: string,
    locale: string = "en-US",
  ): Promise<SerpAnalysis> {
    return this.calculateHeuristicAnalysis(keyword, locale);
  }

  async analyzeBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, SerpAnalysis>> {
    const results: Record<string, SerpAnalysis> = {};

    for (const keyword of keywords) {
      results[keyword] = await this.analyze(keyword, locale);
    }

    return results;
  }

  /**
   * Calculate SERP metrics using heuristics
   * Based on keyword patterns, length, intent indicators
   */
  private calculateHeuristicAnalysis(
    keyword: string,
    locale: string,
  ): SerpAnalysis {
    const lowerKeyword = keyword.toLowerCase();
    const wordCount = keyword.split(/\s+/).length;

    // Estimate competition score (0-100)
    let competitionScore = this.estimateCompetitionScore(keyword, wordCount);

    // Detect SERP features
    const features = this.detectSerpFeatures(keyword);

    // Detect forum/UGC presence from keyword
    const forumPresence = this.hasForumIndicators(keyword);
    const ugcPresence = this.hasUgcIndicators(keyword);

    // Estimate exact match title density
    const exactMatchTitleDensity = this.estimateExactMatchDensity(keyword);

    // Estimate avg result length
    const avgResultLength = this.estimateResultLength(keyword, wordCount);

    // Estimate PAA count
    const paaCount = this.estimatePaaCount(keyword);

    // Generate mock top results
    const topResults = this.generateMockResults(keyword);

    // Domain diversity
    const domainDiversity = this.calculateDomainDiversity(topResults);

    return {
      keyword,
      topResults,
      domainDiversity,
      competitionScore,
      features,
      forumPresence,
      ugcPresence,
      exactMatchTitleDensity,
      avgResultLength,
      paaCount,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Estimate competition score based on keyword characteristics
   * Higher score = more competitive/difficult
   */
  private estimateCompetitionScore(keyword: string, wordCount: number): number {
    let score = 40; // Base score

    const lowerKeyword = keyword.toLowerCase();

    // Commercial/transactional keywords are more competitive
    if (
      /\b(buy|purchase|price|cost|cheap|discount|deal|how to|tutorial|guide|best|top|comparison|vs)\b/.test(
        lowerKeyword,
      )
    ) {
      score += 15;
    }

    // Shorter keywords tend to be more competitive
    if (wordCount === 1) {
      score += 20;
    } else if (wordCount === 2) {
      score += 10;
    } else if (wordCount >= 5) {
      score -= 5; // Long tail keywords are less competitive
    }

    // Brand keywords increase score
    if (/\b(brand|official|authentic|genuine)\b/.test(lowerKeyword)) {
      score += 10;
    }

    // Numbers/years might indicate fresher/less competitive content
    if (/\b(2024|2025|202[0-9]|latest|new|recent)\b/.test(lowerKeyword)) {
      score -= 5;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Detect likely SERP features for this keyword
   */
  private detectSerpFeatures(keyword: string): SerpFeature[] {
    const features: SerpFeature[] = [];
    const lowerKeyword = keyword.toLowerCase();

    // Featured snippet more likely for "how to", definition questions
    if (
      /\b(how to|what is|define|definition|tutorial|steps|guide)\b/.test(
        lowerKeyword,
      )
    ) {
      features.push("featured_snippet");
    }

    // People also ask for question keywords
    if (/^(how|what|why|which|where|when|who)\b/.test(lowerKeyword)) {
      features.push("people_also_ask");
    }

    // Knowledge panel for brands/entities
    if (
      /\b(brand|company|person|city|country|organization)\b/.test(lowerKeyword)
    ) {
      features.push("knowledge_panel");
    }

    // Local pack for location keywords
    if (/\b(near|near me|local|location|city|address)\b/.test(lowerKeyword)) {
      features.push("local_pack");
    }

    // Video carousel for "how to", tutorial keywords
    if (/\b(how to|tutorial|video|demo|walkthrough)\b/.test(lowerKeyword)) {
      features.push("video_carousel");
    }

    // Shopping for product keywords
    if (/\b(buy|purchase|price|shop|store|product)\b/.test(lowerKeyword)) {
      features.push("shopping_results");
    }

    // News for time-sensitive topics
    if (
      /\b(news|latest|breaking|today|this week|this month)\b/.test(lowerKeyword)
    ) {
      features.push("news");
    }

    // Images for visual keywords
    if (/\b(image|photo|picture|design|art|style)\b/.test(lowerKeyword)) {
      features.push("image_carousel");
    }

    // Always include related searches
    features.push("related_searches");

    return [...new Set(features)]; // Deduplicate
  }

  /**
   * Check if keyword likely has forum presence (Reddit, Stack Overflow, etc.)
   */
  private hasForumIndicators(keyword: string): boolean {
    const lowerKeyword = keyword.toLowerCase();
    return /\b(question|problem|issue|help|how to|error|bug|why|wrong)\b/.test(
      lowerKeyword,
    );
  }

  /**
   * Check if keyword likely has UGC presence (Medium, Substack, etc.)
   */
  private hasUgcIndicators(keyword: string): boolean {
    const lowerKeyword = keyword.toLowerCase();
    return /\b(guide|tutorial|blog|tips|tricks|best|recommendations|review|story)\b/.test(
      lowerKeyword,
    );
  }

  /**
   * Estimate % of top results with exact match in title
   */
  private estimateExactMatchDensity(keyword: string): number {
    // High-intent keywords likely have higher exact match density
    const lowerKeyword = keyword.toLowerCase();

    if (/\b(buy|purchase|price)\b/.test(lowerKeyword)) {
      return 0.7; // 70% likely to have exact match
    }

    if (/^(how|what|why)\b/.test(lowerKeyword)) {
      return 0.5; // 50% for question keywords
    }

    return 0.3; // Generic baseline
  }

  /**
   * Estimate average content length of top results
   */
  private estimateResultLength(keyword: string, wordCount: number): number {
    const lowerKeyword = keyword.toLowerCase();

    // How-to and guide keywords need longer content
    if (/\b(how to|tutorial|guide|steps|process)\b/.test(lowerKeyword)) {
      return 2500; // Average long-form article
    }

    // Definition keywords need medium content
    if (/\b(what is|definition|meaning)\b/.test(lowerKeyword)) {
      return 1500;
    }

    // Product/comparison keywords
    if (/\b(vs|comparison|best|review)\b/.test(lowerKeyword)) {
      return 2000;
    }

    // Short keywords often have listicles or comparison content
    if (wordCount === 1) {
      return 1800;
    }

    return 1200; // Generic baseline
  }

  /**
   * Estimate number of People Also Ask questions
   */
  private estimatePaaCount(keyword: string): number {
    const lowerKeyword = keyword.toLowerCase();

    // Question keywords tend to have more PAA
    if (/^(how|what|why|which|where|when|who)\b/.test(lowerKeyword)) {
      return Math.random() * (8 - 4) + 4; // 4-8 PAA questions
    }

    return Math.random() * (4 - 0) + 0; // 0-4 PAA questions
  }

  /**
   * Calculate domain diversity in top results
   * 0 = all same domain, 1 = all unique domains
   */
  private calculateDomainDiversity(results: SerpResult[]): number {
    if (results.length === 0) return 0;

    const uniqueDomains = new Set(results.map((r) => r.domain)).size;
    return uniqueDomains / results.length;
  }

  /**
   * Generate mock top 10 results for analysis
   * Phase 2: Replace with real Playwright scraping
   */
  private generateMockResults(keyword: string): SerpResult[] {
    const domains = [
      "wikipedia.org",
      "github.com",
      "stackoverflow.com",
      "medium.com",
      "example.com",
      "official-site.com",
      "tutorial.io",
      "docs.org",
      "community.dev",
      "blog.site.com",
    ];

    return domains.map((domain, index) => ({
      url: `https://${domain}/article-${index}`,
      title: `${keyword} - Result ${index + 1}`,
      description: `Relevant description for "${keyword}" from ${domain}`,
      position: index + 1,
      domain,
    }));
  }
}

export class SerpService {
  private static provider: SerpProvider;

  /**
   * Initialize with configured provider
   * SERP_PROVIDER env var: "heuristic" (default) or "playwright"
   */
  static initialize() {
    const providerType = process.env.SERP_PROVIDER || "heuristic";

    if (providerType === "playwright") {
      this.provider = new PlaywrightSerpProvider();
    } else {
      this.provider = new HeuristicSerpProvider();
    }
  }

  /**
   * Set custom SERP provider
   * Phase 2: Use this for Playwright, Semrush, Ahrefs integration
   */
  static setProvider(provider: SerpProvider) {
    this.provider = provider;
  }

  /**
   * Analyze SERP for a keyword
   */
  static async analyze(
    keyword: string,
    locale: string = "en-US",
  ): Promise<SerpAnalysis> {
    return this.provider.analyze(keyword, locale);
  }

  /**
   * Batch analyze keywords
   */
  static async analyzeBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, SerpAnalysis>> {
    return this.provider.analyzeBatch(keywords, locale);
  }

  /**
   * Get provider name
   */
  static getProviderName(): string {
    return this.provider.name;
  }
}

// Initialize on module load
SerpService.initialize();
