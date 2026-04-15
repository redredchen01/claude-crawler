/**
 * Keyword Classification Service
 * Rule-based classification engine for intent, funnel stage, and content type
 */

import {
  KeywordClassification,
  IntentPrimary,
  IntentSecondary,
  FunnelStage,
  ContentFormat,
} from "../types/classification.js";

// Classification rule indicators
const RULES = {
  // Intent indicators
  question: [
    "怎么",
    "如何",
    "为什么",
    "是什么",
    "哪个",
    "什么",
    "有什么",
    "如何",
    "how",
    "what",
    "why",
    "which",
  ],
  comparison: [
    "vs",
    "区别",
    "对比",
    "比较",
    "哪个好",
    "优势",
    "劣势",
    "better",
    "vs",
    "compare",
  ],
  price: [
    "价格",
    "费用",
    "成本",
    "多少钱",
    "价",
    "便宜",
    "贵",
    "price",
    "cost",
    "expensive",
  ],
  brand: ["品牌", "官方", "正品", "官网", "brand", "official", "authentic"],
  location: [
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "成都",
    "中国",
    "美国",
    "beijing",
    "shanghai",
  ],
  commercial: [
    "推荐",
    "推荐好",
    "排行",
    "最好",
    "优惠",
    "促销",
    "代理",
    "招商",
    "best",
    "recommend",
    "sale",
  ],
  transactional: [
    "购买",
    "下载",
    "安装",
    "买",
    "开户",
    "注册",
    "订阅",
    "buy",
    "purchase",
    "download",
    "install",
  ],
  scenario: [
    "新手",
    "教程",
    "步骤",
    "方法",
    "技巧",
    "公司",
    "个人",
    "手机",
    "电脑",
    "tutorial",
    "guide",
    "beginner",
  ],
  freshness: [
    "2024",
    "2025",
    "最新",
    "新",
    "最近",
    "今年",
    "本月",
    "latest",
    "new",
    "recent",
  ],
};

export class ClassificationService {
  /**
   * Classify a single keyword
   */
  static classify(keyword: string): KeywordClassification {
    const wordCount = this.getWordCount(keyword);

    // Determine primary intent
    const intentPrimary = this.determinePrimaryIntent(keyword);

    // Determine secondary intent
    const intentSecondary = this.determineSecondaryIntent(keyword);

    // Determine funnel stage
    const funnelStage = this.determineFunnelStage(
      intentPrimary,
      intentSecondary,
    );

    // Determine keyword type (often same as secondary intent)
    const keywordType = (intentSecondary || "question") as any;

    // Determine content format
    const contentFormat = this.determineContentFormat(
      intentPrimary,
      intentSecondary,
      wordCount,
    );

    // Calculate confidence score
    const confidenceScore = this.calculateConfidence(
      keyword,
      intentPrimary,
      intentSecondary,
    );

    return {
      keyword,
      wordCount,
      intentPrimary,
      intentSecondary,
      funnelStage,
      keywordType,
      contentFormatRecommendation: contentFormat,
      confidenceScore,
      classificationDetails: {
        rulematches: this.getMatchedRules(keyword),
      },
    };
  }

  /**
   * Determine primary intent (informational, commercial, transactional, navigational)
   */
  private static determinePrimaryIntent(keyword: string): IntentPrimary {
    const lowerKeyword = keyword.toLowerCase();

    // Check transactional signals
    if (this.hasAnyIndicator(lowerKeyword, RULES.transactional)) {
      return "transactional";
    }

    // Check commercial signals
    if (this.hasAnyIndicator(lowerKeyword, RULES.commercial)) {
      return "commercial";
    }

    // Check for brand signals
    if (this.hasAnyIndicator(lowerKeyword, RULES.brand)) {
      return "navigational";
    }

    // Check for comparison (often commercial)
    if (this.hasAnyIndicator(lowerKeyword, RULES.comparison)) {
      return "commercial";
    }

    // Check for question (usually informational)
    if (this.hasAnyIndicator(lowerKeyword, RULES.question)) {
      return "informational";
    }

    // Default to informational
    return "informational";
  }

  /**
   * Determine secondary intent
   */
  private static determineSecondaryIntent(
    keyword: string,
  ): IntentSecondary | undefined {
    const lowerKeyword = keyword.toLowerCase();

    if (this.hasAnyIndicator(lowerKeyword, RULES.question)) return "question";
    if (this.hasAnyIndicator(lowerKeyword, RULES.comparison))
      return "comparison";
    if (this.hasAnyIndicator(lowerKeyword, RULES.price)) return "price";
    if (this.hasAnyIndicator(lowerKeyword, RULES.scenario)) return "scenario";
    if (this.hasAnyIndicator(lowerKeyword, RULES.location)) return "local";
    if (this.hasAnyIndicator(lowerKeyword, RULES.brand)) return "brand";
    if (this.hasAnyIndicator(lowerKeyword, RULES.freshness)) return "freshness";

    return undefined;
  }

  /**
   * Determine funnel stage
   */
  private static determineFunnelStage(
    primary: IntentPrimary,
    secondary?: IntentSecondary,
  ): FunnelStage {
    // Decision stage: transactional keywords
    if (primary === "transactional") return "decision";

    // Decision stage: price, comparison intent
    if (secondary === "price" || secondary === "comparison")
      return "consideration";

    // Consideration: commercial intent
    if (primary === "commercial") return "consideration";

    // Awareness: informational intent
    return "awareness";
  }

  /**
   * Determine recommended content format
   */
  private static determineContentFormat(
    primary: IntentPrimary,
    secondary: IntentSecondary | undefined,
    wordCount: number,
  ): ContentFormat {
    // FAQ format for question keywords
    if (secondary === "question") return "faq";

    // Comparison page for comparison keywords
    if (secondary === "comparison") return "comparison";

    // Landing page for transactional/commercial
    if (primary === "transactional" || primary === "commercial")
      return "landing";

    // Category page for broad keywords (> 3 words)
    if (wordCount > 3) return "category";

    // Long-form article for informational
    if (primary === "informational") return "article";

    // Default: article
    return "article";
  }

  /**
   * Calculate confidence score (0-1)
   * Based on strength of matching rules
   */
  private static calculateConfidence(
    keyword: string,
    primary: IntentPrimary,
    secondary?: IntentSecondary,
  ): number {
    const lowerKeyword = keyword.toLowerCase();
    let score = 0.5; // Base confidence

    // Increase for strong indicators
    if (this.hasStrongIndicator(lowerKeyword, RULES.transactional)) {
      score += 0.25;
    }
    if (this.hasStrongIndicator(lowerKeyword, RULES.commercial)) {
      score += 0.15;
    }
    if (this.hasStrongIndicator(lowerKeyword, RULES.question)) {
      score += 0.15;
    }

    // Secondary intent match increases confidence
    if (secondary) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get word count
   */
  private static getWordCount(keyword: string): number {
    return keyword.split(/\s+/).filter((w) => w.length > 0).length;
  }

  /**
   * Check if keyword contains any indicator
   */
  private static hasAnyIndicator(
    keyword: string,
    indicators: string[],
  ): boolean {
    return indicators.some((indicator) =>
      keyword.includes(indicator.toLowerCase()),
    );
  }

  /**
   * Check if keyword has strong (exact or leading) indicator
   */
  private static hasStrongIndicator(
    keyword: string,
    indicators: string[],
  ): boolean {
    return indicators.some((indicator) => {
      const lower = indicator.toLowerCase();
      // Strong match: indicator at word boundary
      return (
        keyword === lower ||
        keyword.startsWith(lower + " ") ||
        keyword.endsWith(" " + lower) ||
        keyword.includes(" " + lower + " ")
      );
    });
  }

  /**
   * Get which rules matched for debugging
   */
  private static getMatchedRules(keyword: string): string[] {
    const matches: string[] = [];
    const lowerKeyword = keyword.toLowerCase();

    Object.entries(RULES).forEach(([rule, indicators]) => {
      if (indicators.some((ind) => lowerKeyword.includes(ind.toLowerCase()))) {
        matches.push(rule);
      }
    });

    return matches;
  }

  /**
   * Batch classify keywords
   */
  static classifyBatch(keywords: string[]): KeywordClassification[] {
    return keywords.map((keyword) => this.classify(keyword));
  }
}
