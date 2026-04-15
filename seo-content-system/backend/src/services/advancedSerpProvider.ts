/**
 * Advanced SERP Scraping Provider
 * Real-world SERP data collection using Playwright
 * Phase 3.1: Replaces heuristics with actual Google SERP analysis
 */

import { Browser, Page, chromium } from "playwright";

export interface AdvancedSerpResult {
  keyword: string;
  locale: string;
  searchEngine: "google" | "bing";
  serpFeatures: SerpFeatureDetection;
  topResults: TopResult[];
  domainDiversity: DomainDiversity;
  competitionAnalysis: CompetitionAnalysis;
  trendsIndicators: TrendsIndicators;
  scrapedAt: number;
}

export interface TopResult {
  rank: number;
  title: string;
  url: string;
  domain: string;
  displayUrl: string;
  snippet: string;
  contentType: "article" | "landing" | "faq" | "comparison" | "other";
  hasSchema: boolean;
  siteAuthority?: number; // Estimated 1-100
}

export interface SerpFeatureDetection {
  featuredSnippet: boolean;
  knowledgePanel: boolean;
  localPack: boolean;
  imageCarousel: boolean;
  videoCarousel: boolean;
  relatedQuestions: RelatedQuestion[];
  newsResults: NewsResult[];
  shopping: boolean;
  peopleAlsoAsk: boolean;
  twitterCard: boolean;
}

export interface RelatedQuestion {
  question: string;
  position: number;
}

export interface NewsResult {
  title: string;
  source: string;
  date: string;
}

export interface DomainDiversity {
  uniqueDomains: number;
  topDomainRepetition: Map<string, number>;
  domainVariety: "low" | "medium" | "high"; // Classify based on count
  largeMediaPresence: boolean;
  ioPresence: boolean;
  orgPresence: boolean;
}

export interface CompetitionAnalysis {
  contentQualityScore: number; // 0-100
  backlinksRequired: "low" | "medium" | "high";
  contentLengthAverage: number; // words
  keywordDensityRange: { min: number; max: number };
  localCompetition: boolean;
  internationalCompetition: boolean;
  brandedResults: number;
  paidResults: number;
  organicResults: number;
  overallCompetitionScore: number; // 0-100
}

export interface TrendsIndicators {
  newsRecency: "very-recent" | "recent" | "moderate" | "old"; // Based on news dates
  seasonalitySignals: string[];
  emergingTopic: boolean;
  trendingPhrase: boolean;
}

export class AdvancedSerpProvider {
  private browser: Browser | null = null;
  private maxRetries = 3;
  private retryDelay = 2000; // ms

  /**
   * Initialize browser instance
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      });
    }
  }

  /**
   * Scrape real SERP data for keyword
   */
  async scrapeSerp(
    keyword: string,
    locale: string = "en-US",
    searchEngine: "google" | "bing" = "google",
  ): Promise<AdvancedSerpResult> {
    await this.initialize();

    if (!this.browser) {
      throw new Error("Browser failed to initialize");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const page = await this.browser.newPage();
        try {
          const result = await this.performScraping(
            page,
            keyword,
            locale,
            searchEngine,
          );
          return result;
        } finally {
          await page.close();
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    throw (
      lastError || new Error(`Failed to scrape SERP for keyword: ${keyword}`)
    );
  }

  /**
   * Perform actual scraping logic
   */
  private async performScraping(
    page: Page,
    keyword: string,
    locale: string,
    searchEngine: "google" | "bing",
  ): Promise<AdvancedSerpResult> {
    // Set locale
    await page.context().addInitScript(() => {
      Object.defineProperty(navigator, "language", {
        get: () => "en-US",
      });
    });

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Navigate to search
    const searchUrl =
      searchEngine === "google"
        ? `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        : `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`;

    await page.goto(searchUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Extract organic results
    const topResults = await this.extractTopResults(page, searchEngine);

    // Detect SERP features
    const serpFeatures = await this.detectSerpFeatures(page);

    // Analyze domain diversity
    const domainDiversity = this.calculateDomainDiversity(topResults);

    // Analyze competition
    const competitionAnalysis = await this.analyzeCompetition(
      page,
      topResults,
      serpFeatures,
      domainDiversity,
    );

    // Detect trends
    const trendsIndicators = await this.detectTrendsIndicators(page);

    return {
      keyword,
      locale,
      searchEngine,
      serpFeatures,
      topResults,
      domainDiversity,
      competitionAnalysis,
      trendsIndicators,
      scrapedAt: Date.now(),
    };
  }

  /**
   * Extract top 10 organic results
   */
  private async extractTopResults(
    page: Page,
    searchEngine: "google" | "bing",
  ): Promise<TopResult[]> {
    const results: TopResult[] = [];

    if (searchEngine === "google") {
      const elements = await page.$$("div[data-sokoban-container] > div");

      for (let i = 0; i < Math.min(elements.length, 10); i++) {
        const element = elements[i];

        const title = await element
          .$eval("h3", (el) => el.textContent)
          .catch(() => "");
        const urlElement = await element.$("a[href]").catch(() => null);
        const url = (await urlElement?.getAttribute("href")) || "";
        const snippet = await element
          .$eval("span[data-content-feature]", (el) => el.textContent)
          .catch(() => "");

        if (title && url && !url.includes("support.google")) {
          const domain = new URL(url).hostname.replace("www.", "");
          const displayUrl = `${domain}/${new URL(url).pathname.split("/").slice(1, 3).join("/")}`;
          const contentType = this.inferContentType(title, snippet);

          results.push({
            rank: results.length + 1,
            title,
            url,
            domain,
            displayUrl,
            snippet,
            contentType,
            hasSchema: await this.checkSchema(element),
            siteAuthority: await this.estimateAuthority(domain),
          });
        }
      }
    } else if (searchEngine === "bing") {
      const elements = await page.$$("li.b_algo");

      for (let i = 0; i < Math.min(elements.length, 10); i++) {
        const element = elements[i];

        const title = await element
          .$eval("h2 a", (el) => el.textContent)
          .catch(() => "");
        const url = await element
          .$eval("h2 a", (el) => el.getAttribute("href"))
          .catch(() => "");
        const snippet = await element
          .$eval(".b_caption p", (el) => el.textContent)
          .catch(() => "");

        if (title && url) {
          const domain = new URL(url).hostname.replace("www.", "");
          const displayUrl = url;
          const contentType = this.inferContentType(title, snippet);

          results.push({
            rank: results.length + 1,
            title,
            url,
            domain,
            displayUrl,
            snippet,
            contentType,
            hasSchema: false,
            siteAuthority: await this.estimateAuthority(domain),
          });
        }
      }
    }

    return results;
  }

  /**
   * Detect SERP features
   */
  private async detectSerpFeatures(page: Page): Promise<SerpFeatureDetection> {
    const features: SerpFeatureDetection = {
      featuredSnippet: false,
      knowledgePanel: false,
      localPack: false,
      imageCarousel: false,
      videoCarousel: false,
      relatedQuestions: [],
      newsResults: [],
      shopping: false,
      peopleAlsoAsk: false,
      twitterCard: false,
    };

    // Featured snippet
    features.featuredSnippet = !!(await page
      .$("[data-feature-name='featured_snippet']")
      .catch(() => null));

    // Knowledge panel
    features.knowledgePanel = !!(await page
      .$("[data-feature-name='knowledge_panel']")
      .catch(() => null));

    // Local pack
    features.localPack = !!(await page
      .$("[data-feature-name='local_pack']")
      .catch(() => null));

    // Image carousel
    features.imageCarousel = !!(await page
      .$("[data-feature-name='image_carousel']")
      .catch(() => null));

    // Video carousel
    features.videoCarousel = !!(await page
      .$("[data-feature-name='video_carousel']")
      .catch(() => null));

    // People also ask
    features.peopleAlsoAsk = !!(await page
      .$("div[data-feature-name='people_also_ask']")
      .catch(() => null));

    // Shopping results
    features.shopping = !!(await page
      .$("[data-feature-name='shopping_results']")
      .catch(() => null));

    // News results
    const newsElements = await page.$$("div[data-feature-name='news']");
    if (newsElements.length > 0) {
      features.newsResults = await Promise.all(
        newsElements.map(async (el) => ({
          title: (await el.$eval("span", (e) => e.textContent)) || "",
          source:
            (await el.$eval("span:nth-child(2)", (e) => e.textContent)) || "",
          date:
            (await el.$eval("span:nth-child(3)", (e) => e.textContent)) || "",
        })),
      );
    }

    // Related questions
    const qaElements = await page.$$(
      "div[data-feature-name='related_questions'] div",
    );
    if (qaElements.length > 0) {
      features.relatedQuestions = await Promise.all(
        qaElements.map(async (el, idx) => ({
          question: (await el.textContent()) || "",
          position: idx + 1,
        })),
      );
    }

    return features;
  }

  /**
   * Calculate domain diversity metrics
   */
  private calculateDomainDiversity(results: TopResult[]): DomainDiversity {
    const domainCounts = new Map<string, number>();

    for (const result of results) {
      domainCounts.set(
        result.domain,
        (domainCounts.get(result.domain) || 0) + 1,
      );
    }

    const uniqueDomains = domainCounts.size;
    const variety =
      uniqueDomains >= 8 ? "high" : uniqueDomains >= 5 ? "medium" : "low";

    const largeMediaPresence = results.some((r) =>
      ["cnn.com", "bbc.com", "nytimes.com", "wikipedia.org"].some((media) =>
        r.domain.includes(media),
      ),
    );

    const ioPresence = results.some((r) => r.domain.endsWith(".io"));
    const orgPresence = results.some((r) => r.domain.endsWith(".org"));

    return {
      uniqueDomains,
      topDomainRepetition: domainCounts,
      domainVariety: variety,
      largeMediaPresence,
      ioPresence,
      orgPresence,
    };
  }

  /**
   * Analyze competition level
   */
  private async analyzeCompetition(
    _page: Page,
    topResults: TopResult[],
    serpFeatures: SerpFeatureDetection,
    domainDiversity: DomainDiversity,
  ): Promise<CompetitionAnalysis> {
    // Estimate content quality from titles and snippets
    const contentQualityScore = this.estimateContentQuality(topResults);

    // Estimate backlinks required
    const avgAuthority =
      topResults.reduce((sum, r) => sum + (r.siteAuthority || 50), 0) /
      topResults.length;
    const backlinksRequired =
      avgAuthority > 70 ? "high" : avgAuthority > 40 ? "medium" : "low";

    // Estimate content length from snippets
    const contentLengthAverage = this.estimateContentLength(topResults);

    // Estimate keyword density
    const keywordDensityRange = { min: 1, max: 3 };

    // Check local competition
    const localCompetition = !!topResults.find(
      (r) => r.contentType === "landing",
    );

    // Check international
    const internationalCompetition =
      domainDiversity.largeMediaPresence || domainDiversity.uniqueDomains > 7;

    // Count result types
    const brandedResults = topResults.filter(
      (r) => r.snippet.length < 50,
    ).length;
    const paidResults = 0; // Would need to detect paid ads separately
    const organicResults = topResults.length - paidResults;

    // Calculate overall competition score
    const featureBonus = Object.values(serpFeatures).filter(
      (v) => v === true || (Array.isArray(v) && v.length > 0),
    ).length;
    const diversityBonus = domainDiversity.uniqueDomains >= 8 ? 10 : 0;
    const overallCompetitionScore = Math.min(
      100,
      50 + featureBonus * 5 + diversityBonus + avgAuthority * 0.1,
    );

    return {
      contentQualityScore,
      backlinksRequired,
      contentLengthAverage,
      keywordDensityRange,
      localCompetition,
      internationalCompetition,
      brandedResults,
      paidResults,
      organicResults,
      overallCompetitionScore: Math.round(overallCompetitionScore),
    };
  }

  /**
   * Detect trends indicators
   */
  private async detectTrendsIndicators(_page: Page): Promise<TrendsIndicators> {
    return {
      newsRecency: "moderate",
      seasonalitySignals: [],
      emergingTopic: false,
      trendingPhrase: false,
    };
  }

  /**
   * Helper: Infer content type from title and snippet
   */
  private inferContentType(
    title: string,
    snippet: string,
  ): "article" | "landing" | "faq" | "comparison" | "other" {
    const combined = (title + " " + snippet).toLowerCase();

    if (combined.includes("vs") || combined.includes("comparison"))
      return "comparison";
    if (combined.includes("?") || combined.includes("faq")) return "faq";
    if (combined.includes("how to") || combined.includes("guide"))
      return "article";
    if (combined.includes("buy") || combined.includes("shop")) return "landing";

    return "other";
  }

  /**
   * Helper: Check if page has schema markup
   */
  private async checkSchema(element: any): Promise<boolean> {
    // Would check for JSON-LD or other schema markup
    return false;
  }

  /**
   * Helper: Estimate site authority (1-100 scale)
   */
  private async estimateAuthority(_domain: string): Promise<number> {
    // Would integrate with real authority API
    return 50; // Default estimate
  }

  /**
   * Helper: Estimate content quality
   */
  private estimateContentQuality(results: TopResult[]): number {
    const avgSnippetLength =
      results.reduce((sum, r) => sum + r.snippet.length, 0) / results.length;
    const avgTitleLength =
      results.reduce((sum, r) => sum + r.title.length, 0) / results.length;

    // Longer, more detailed content indicators
    const quality = (avgSnippetLength / 300) * 50 + (avgTitleLength / 70) * 50;
    return Math.min(100, quality);
  }

  /**
   * Helper: Estimate average content length
   */
  private estimateContentLength(results: TopResult[]): number {
    const avgSnippetLength =
      results.reduce((sum, r) => sum + r.snippet.split(" ").length, 0) /
      results.length;
    // Estimate full article length from snippet
    return Math.round(avgSnippetLength * 50);
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
