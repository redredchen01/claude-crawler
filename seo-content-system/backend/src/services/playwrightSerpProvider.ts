/**
 * Playwright SERP Provider
 * Real SERP data collection using Playwright headless browser
 * Phase 2: Replaces heuristic provider with actual Google search results
 */

import { Browser, chromium, Page } from "playwright";
import {
  SerpAnalysis,
  SerpProvider,
  SerpResult,
  SerpFeature,
} from "../types/serp.js";

const GOOGLE_SEARCH_URL = "https://www.google.com/search";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export class PlaywrightSerpProvider implements SerpProvider {
  name = "Playwright SERP Provider";
  private browser: Browser | null = null;
  private isInitialized = false;

  /**
   * Initialize browser
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      this.isInitialized = true;
      console.log("[SerpProvider] Browser initialized");
    } catch (error) {
      console.error("[SerpProvider] Failed to initialize browser:", error);
      throw error;
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
    }
  }

  /**
   * Analyze keyword by fetching real SERP
   */
  async analyze(
    keyword: string,
    locale: string = "en-US",
  ): Promise<SerpAnalysis> {
    try {
      await this.initialize();

      if (!this.browser) {
        throw new Error("Browser not initialized");
      }

      const page = await this.browser.newPage();

      try {
        // Set user agent and headers to avoid blocking
        await page.setExtraHTTPHeaders({
          "User-Agent": USER_AGENT,
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        // Navigate to Google Search
        const searchUrl = new URL(GOOGLE_SEARCH_URL);
        searchUrl.searchParams.set("q", keyword);
        searchUrl.searchParams.set("hl", locale.split("-")[0]);

        console.log(`[SerpProvider] Fetching SERP for: ${keyword}`);

        await page.goto(searchUrl.toString(), {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Extract SERP data
        const topResults = await this.extractResults(page);
        const features = await this.detectFeatures(page);
        const { forumPresence, ugcPresence } = await this.detectPresence(page);

        // Calculate metrics
        const domainDiversity = this.calculateDomainDiversity(topResults);
        const competitionScore = this.calculateCompetitionScore(
          topResults,
          features,
        );
        const exactMatchTitleDensity = this.calculateExactMatch(
          keyword,
          topResults,
        );
        const avgResultLength = this.estimateResultLength();
        const paaCount = await this.countPAA(page);

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
      } finally {
        await page.close();
      }
    } catch (error) {
      console.error(`[SerpProvider] Error analyzing "${keyword}":`, error);
      throw error;
    }
  }

  /**
   * Batch analyze keywords
   */
  async analyzeBatch(
    keywords: string[],
    locale: string = "en-US",
  ): Promise<Record<string, SerpAnalysis>> {
    const results: Record<string, SerpAnalysis> = {};

    for (const keyword of keywords) {
      try {
        results[keyword] = await this.analyze(keyword, locale);
        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to analyze "${keyword}":`, error);
        // Store error in result
        results[keyword] = this.createErrorAnalysis(keyword);
      }
    }

    return results;
  }

  /**
   * Extract top 10 results from SERP
   */
  private async extractResults(page: Page): Promise<SerpResult[]> {
    // @ts-ignore - document is available in page.evaluate() context
    const results = await page.evaluate(() => {
      const items: Array<{
        url: string;
        title: string;
        position: number;
        domain: string;
      }> = [];
      let position = 1;

      // Main search results (usually in g selector)
      const searchResults = document.querySelectorAll(
        "div[data-sokoban-container] div[data-rank]",
      );

      searchResults.forEach((item: Element) => {
        const link = item.querySelector("a[href]");
        const titleEl = item.querySelector("h3");

        if (link && titleEl) {
          const url = (link as HTMLAnchorElement).href;
          const title = titleEl.textContent || "";
          const domain = new URL(url).hostname.replace("www.", "");

          items.push({
            url,
            title,
            position,
            domain,
          });

          position++;
        }
      });

      // Fallback: look for basic search results
      if (items.length === 0) {
        const basicResults = document.querySelectorAll("div.g");
        basicResults.forEach((item: Element) => {
          const link = item.querySelector("a[href]");
          const titleEl = item.querySelector("h3");

          if (link && titleEl && position <= 10) {
            const url = (link as HTMLAnchorElement).href;
            const title = titleEl.textContent || "";
            const domain = new URL(url).hostname.replace("www.", "");

            items.push({
              url,
              title,
              position,
              domain,
            });

            position++;
          }
        });
      }

      return items.slice(0, 10);
    });

    return results;
  }

  /**
   * Detect SERP features
   */
  private async detectFeatures(page: Page): Promise<SerpFeature[]> {
    const features: SerpFeature[] = [];

    // Check for featured snippet
    const hasFeaturebox = await page.$(".s-answer-container");
    if (hasFeaturebox) {
      features.push("featured_snippet");
    }

    // Check for people also ask
    const hasPaa = await page.$(".related-question-pair");
    if (hasPaa) {
      features.push("people_also_ask");
    }

    // Check for knowledge panel
    const hasKnowledge = await page.$("[data-sokoban-container] [data-md]");
    if (hasKnowledge) {
      features.push("knowledge_panel");
    }

    // Check for local pack
    const hasLocal = await page.$(".map-container");
    if (hasLocal) {
      features.push("local_pack");
    }

    // Check for videos
    const hasVideos = await page.$("[data-sokoban-container] .TzHB6e");
    if (hasVideos) {
      features.push("video_carousel");
    }

    // Check for shopping results
    const hasShopping = await page.$(".shopping-carousel");
    if (hasShopping) {
      features.push("shopping_results");
    }

    // Check for news
    const hasNews = await page.$(".xQjR0b");
    if (hasNews) {
      features.push("news");
    }

    // Check for images
    const hasImages = await page.$("[role='region'] [data-viewport-height]");
    if (hasImages) {
      features.push("image_carousel");
    }

    // Always include related searches
    features.push("related_searches");

    return [...new Set(features)];
  }

  /**
   * Detect forum and UGC presence
   */
  private async detectPresence(
    page: Page,
  ): Promise<{ forumPresence: boolean; ugcPresence: boolean }> {
    const pageContent = await page.content();
    const pageUrl = page.url();

    const forumDomains = [
      "reddit.com",
      "stackoverflow.com",
      "quora.com",
      "twitter.com",
      "medium.com",
    ];
    const ugcDomains = ["medium.com", "substack.com", "dev.to", "hashnode.com"];

    const forumPresence = forumDomains.some(
      (domain) => pageContent.includes(domain) || pageUrl.includes(domain),
    );
    const ugcPresence = ugcDomains.some(
      (domain) => pageContent.includes(domain) || pageUrl.includes(domain),
    );

    return { forumPresence, ugcPresence };
  }

  /**
   * Calculate domain diversity
   */
  private calculateDomainDiversity(results: SerpResult[]): number {
    if (results.length === 0) return 0;

    const uniqueDomains = new Set(results.map((r) => r.domain)).size;
    return uniqueDomains / Math.min(results.length, 10);
  }

  /**
   * Calculate real competition score based on SERP results
   */
  private calculateCompetitionScore(
    results: SerpResult[],
    features: SerpFeature[],
  ): number {
    let score = 40; // Base score

    // More results = more competitive
    score += results.length > 5 ? 15 : 5;

    // Domain diversity - low diversity = more competitive
    if (results.length > 0) {
      const uniqueDomains = new Set(results.map((r) => r.domain)).size;
      if (uniqueDomains < 5) {
        score += 15; // Low diversity = high competition
      }
    }

    // SERP features - more features = more competitive
    const featureBoosts: Record<SerpFeature, number> = {
      featured_snippet: 10,
      people_also_ask: 5,
      knowledge_panel: 15,
      local_pack: 5,
      video_carousel: 5,
      shopping_results: 15,
      news: 5,
      image_carousel: 3,
      related_searches: 0,
      sitelinks: 5,
      map: 5,
      calculator: 0,
      dictionary: 0,
      definition: 0,
      quick_answer: 10,
      comparison: 10,
      scholar: 3,
      tweets: 2,
      ugc_presence: 5,
      forum_presence: 5,
    };

    for (const feature of features) {
      score += featureBoosts[feature] || 0;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate exact match title density
   */
  private calculateExactMatch(keyword: string, results: SerpResult[]): number {
    if (results.length === 0) return 0;

    const exactMatches = results.filter((r) =>
      r.title.toLowerCase().includes(keyword.toLowerCase()),
    ).length;

    return exactMatches / results.length;
  }

  /**
   * Estimate average result content length
   */
  private estimateResultLength(): number {
    // This is estimated based on typical content length for each result
    // In reality, we'd need to fetch and analyze each page
    // For now, use a reasonable average
    return 1500;
  }

  /**
   * Count People Also Ask questions
   */
  private async countPAA(page: Page): Promise<number> {
    // @ts-ignore - document is available in page.evaluate() context
    const paaCount = await page.evaluate(() => {
      const paaItems = document.querySelectorAll(".related-question-pair");
      return paaItems.length;
    });

    return Math.min(paaCount, 8); // Max 8 PAA questions
  }

  /**
   * Create error analysis response
   */
  private createErrorAnalysis(keyword: string): SerpAnalysis {
    return {
      keyword,
      topResults: [],
      domainDiversity: 0,
      competitionScore: 0,
      features: ["related_searches"],
      forumPresence: false,
      ugcPresence: false,
      exactMatchTitleDensity: 0,
      avgResultLength: 0,
      paaCount: 0,
      lastUpdated: Date.now(),
    };
  }
}
