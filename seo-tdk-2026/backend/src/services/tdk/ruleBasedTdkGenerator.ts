/**
 * Rule-Based TDK Generator Service
 *
 * Generates Title, Description, and Keywords using algorithms.
 * No external API required - completely self-contained.
 */

import type { TdkCandidate, TdkGenerationResult } from "./tdkGeneratorService";
import type { Language } from "./tdkRules";

/**
 * Rule-based TDK generator using algorithms
 */
export class RuleBasedTdkGenerator {
  /**
   * Generate TDK recommendations using rules
   */
  static generateRecommendations(
    topic: string,
    keywords: string[],
    contentSnippet?: string,
    language: Language = "en",
  ): TdkGenerationResult {
    // Clean inputs
    const cleanTopic = topic.trim();
    const cleanKeywords = keywords
      .filter((k) => k && k.trim())
      .map((k) => k.trim().toLowerCase());
    const cleanContent = contentSnippet?.trim() || "";

    // Generate primary recommendation
    const primary = this.generateCandidate(
      cleanTopic,
      cleanKeywords,
      cleanContent,
      language,
      "primary",
    );

    // Generate alternatives
    const alternatives = [
      this.generateCandidate(
        cleanTopic,
        cleanKeywords,
        cleanContent,
        language,
        "alternative-1",
      ),
      this.generateCandidate(
        cleanTopic,
        cleanKeywords,
        cleanContent,
        language,
        "alternative-2",
      ),
    ];

    return {
      primary,
      alternatives,
      metadata: {
        generatedAt: new Date(),
        language,
        modelVersion: "rule-based-v1.0",
        tokensUsed: 0, // No API calls
      },
    };
  }

  /**
   * Generate a single TDK candidate
   */
  private static generateCandidate(
    topic: string,
    keywords: string[],
    content: string,
    language: Language,
    variant: string,
  ): TdkCandidate {
    const title =
      language === "en"
        ? this.generateTitleEN(topic, keywords, variant)
        : this.generateTitleZH(topic, keywords, variant);

    const description =
      language === "en"
        ? this.generateDescriptionEN(topic, keywords, content, variant)
        : this.generateDescriptionZH(topic, keywords, content, variant);

    const generatedKeywords = this.generateKeywords(
      topic,
      keywords,
      title,
      description,
      language,
    );

    return { title, description, keywords: generatedKeywords };
  }

  /**
   * Generate English title
   */
  private static generateTitleEN(
    topic: string,
    keywords: string[],
    variant: string,
  ): string {
    const mainKeyword = keywords[0] || topic;
    const secondaryKeyword = keywords[1];

    const templates = [
      () =>
        `${this.capitalize(topic)} - Complete Guide${variant === "primary" ? "" : " & Tips"}`,
      () =>
        `How to ${mainKeyword}${secondaryKeyword ? ` and ${secondaryKeyword}` : ""}`,
      () =>
        `The Ultimate ${this.capitalize(topic)} Tutorial${variant === "primary" ? "" : " for Beginners"}`,
      () => `${this.capitalize(mainKeyword)}: Essential Tips & Strategies`,
      () =>
        `Master ${topic} - Step-by-Step Instructions${variant === "primary" ? "" : " for Success"}`,
    ];

    // Select template based on variant
    const templateIndex =
      variant === "primary" ? 0 : variant === "alternative-1" ? 1 : 2;
    const template = templates[templateIndex % templates.length];
    let title = template();

    // Ensure length is within SERP limits (30-60 chars)
    if (title.length > 60) {
      title = title.substring(0, 57) + "...";
    }

    return title;
  }

  /**
   * Generate Chinese title
   */
  private static generateTitleZH(
    topic: string,
    keywords: string[],
    variant: string,
  ): string {
    const mainKeyword = keywords[0] || topic;

    const templates = [
      () => `${topic}完全指南`,
      () => `${mainKeyword}入門教程`,
      () => `${topic}技巧與策略`,
      () => `${mainKeyword}step-by-step教程`,
      () => `掌握${topic}的最佳方法`,
    ];

    const templateIndex =
      variant === "primary" ? 0 : variant === "alternative-1" ? 1 : 2;
    const template = templates[templateIndex % templates.length];
    let title = template();

    // Ensure length is within SERP limits (12-15 Chinese chars = 36-45 bytes)
    if (title.length > 15) {
      title = title.substring(0, 14) + "...";
    }

    return title;
  }

  /**
   * Generate English description
   */
  private static generateDescriptionEN(
    topic: string,
    keywords: string[],
    content: string,
    variant: string,
  ): string {
    // Extract first sentence or use content summary
    let baseSentence = content.split(/[.!?]/)[0] || `Learn about ${topic}.`;

    // Ensure it's a complete sentence
    if (!baseSentence.endsWith(".")) {
      baseSentence += ".";
    }

    // Create variations
    let description = baseSentence;

    if (keywords.length > 0) {
      const keywordPhrase =
        variant === "alternative-2"
          ? `Explore ${keywords.join(", ")}.`
          : `Discover the secrets of ${keywords[0]}.`;
      description += ` ${keywordPhrase}`;
    }

    // Add call-to-action
    const ctas = [
      " Get expert tips and best practices.",
      " Learn step-by-step techniques.",
      " Improve your skills with proven strategies.",
      " Master the fundamentals today.",
    ];
    const ctaIndex =
      variant === "primary" ? 0 : variant === "alternative-1" ? 1 : 2;
    description += ctas[ctaIndex % ctas.length];

    // Ensure length is within SERP limits (120-160 chars)
    if (description.length > 160) {
      description = description.substring(0, 157) + "...";
    }

    return description;
  }

  /**
   * Generate Chinese description
   */
  private static generateDescriptionZH(
    topic: string,
    keywords: string[],
    content: string,
    variant: string,
  ): string {
    // Extract first sentence
    let baseSentence = content.split(/[。！？]/)[0] || `了解${topic}。`;

    if (!baseSentence.endsWith("。")) {
      baseSentence += "。";
    }

    let description = baseSentence;

    if (keywords.length > 0) {
      const keywordPhrase =
        variant === "alternative-2"
          ? `探索${keywords.join("、")}的相關內容。`
          : `發現${keywords[0]}的奧秘。`;
      description += keywordPhrase;
    }

    // Add call-to-action
    const ctas = [
      "獲得專家建議和最佳實踐。",
      "學習逐步技巧。",
      "掌握基礎知識。",
    ];
    const ctaIndex =
      variant === "primary" ? 0 : variant === "alternative-1" ? 1 : 2;
    description += ctas[ctaIndex % ctas.length];

    // Ensure length is within SERP limits (80 Chinese chars = 240 bytes)
    if (description.length > 80) {
      description = description.substring(0, 77) + "...";
    }

    return description;
  }

  /**
   * Generate keywords list
   */
  private static generateKeywords(
    topic: string,
    providedKeywords: string[],
    title: string,
    description: string,
    language: Language,
  ): string[] {
    const keywordSet = new Set<string>();

    // Add provided keywords
    providedKeywords.forEach((k) => keywordSet.add(k.toLowerCase()));

    // Extract important words from topic
    const topicWords = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    topicWords.forEach((w) => keywordSet.add(w));

    // Extract from title
    const titleWords = title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !this.isStopWord(w, language));
    titleWords.slice(0, 3).forEach((w) => keywordSet.add(w));

    // Extract from description
    const descWords = description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !this.isStopWord(w, language));
    descWords.slice(0, 2).forEach((w) => keywordSet.add(w));

    // Convert to array and limit
    return Array.from(keywordSet).slice(0, 8);
  }

  /**
   * Check if word is a stop word
   */
  private static isStopWord(word: string, language: Language): boolean {
    const enStopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "is",
      "are",
      "was",
      "were",
      "be",
      "being",
      "been",
    ]);

    const zhStopWords = new Set([
      "的",
      "一",
      "是",
      "在",
      "了",
      "和",
      "人",
      "这",
      "中",
      "大",
      "为",
      "上",
      "个",
      "国",
      "我",
      "以",
      "要",
      "他",
    ]);

    const stopWords = language === "en" ? enStopWords : zhStopWords;
    return stopWords.has(word);
  }

  /**
   * Capitalize first letter
   */
  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
