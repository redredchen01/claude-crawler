/**
 * Conflict Detection Service
 *
 * Pure algorithm service for detecting keyword conflicts and calculating similarity.
 * Language-aware keyword normalization and Jaccard similarity computation.
 */

import type { Language } from "../tdk/tdkRules";

/**
 * Result of conflict detection between two TDK sets
 */
export interface ConflictResult {
  overlapKeywords: string[];
  jaccardSimilarity: number; // 0-1
  severity: "high" | "medium" | "low"; // High >0.7, Medium 0.4-0.7, Low <0.4
}

/**
 * Conflict Detection Service
 *
 * Provides pure algorithms for:
 * - Jaccard similarity calculation
 * - Keyword normalization (language-aware)
 * - Conflict severity classification
 */
export class ConflictDetectionService {
  /**
   * Stop words for English
   */
  private static readonly EN_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "he",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "was",
    "will",
    "with",
  ]);

  /**
   * Stop words for Chinese
   */
  private static readonly ZH_STOPWORDS = new Set([
    "的",
    "一",
    "是",
    "在",
    "不",
    "了",
    "有",
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
    "时",
    "来",
    "用",
    "们",
    "生",
    "到",
    "作",
    "地",
    "于",
    "出",
    "就",
    "分",
    "对",
    "成",
    "会",
    "可",
    "主",
    "发",
    "年",
    "动",
    "同",
    "工",
    "也",
    "能",
    "下",
    "过",
    "民",
    "前",
    "面",
    "手",
    "然",
    "具",
    "进",
    "色",
    "取",
    "据",
    "别",
    "她",
    "很",
    "叫",
    "让",
    "通",
    "能",
    "怀",
    "意",
  ]);

  /**
   * Normalize keywords for comparison
   *
   * Language-aware normalization:
   * - English: lowercase, remove stopwords
   * - Chinese: split by character, remove stopwords
   *
   * @param keywords - Raw keywords
   * @param language - Language code
   * @returns Normalized, deduplicated keywords
   */
  normalizeKeywords(keywords: string[], language: Language): string[] {
    if (language === "zh") {
      return this.normalizeChineseKeywords(keywords);
    } else {
      return this.normalizeEnglishKeywords(keywords);
    }
  }

  /**
   * Normalize English keywords
   *
   * - Lowercase
   * - Split by spaces/hyphens
   * - Remove stopwords
   * - Deduplicate
   */
  private normalizeEnglishKeywords(keywords: string[]): string[] {
    const normalized = new Set<string>();

    for (const keyword of keywords) {
      if (!keyword || keyword.trim().length === 0) continue;

      // Split by space, hyphen, underscore
      const parts = keyword
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter((p) => p.length > 0);

      for (const part of parts) {
        // Skip very short words (< 2 chars) and stopwords
        if (
          part.length >= 2 &&
          !ConflictDetectionService.EN_STOPWORDS.has(part)
        ) {
          normalized.add(part);
        }
      }
    }

    return Array.from(normalized).sort();
  }

  /**
   * Normalize Chinese keywords
   *
   * - Split by character
   * - Keep Chinese characters and English words
   * - Remove stopwords
   * - Deduplicate
   */
  private normalizeChineseKeywords(keywords: string[]): string[] {
    const normalized = new Set<string>();

    for (const keyword of keywords) {
      if (!keyword || keyword.trim().length === 0) continue;

      // Process each character
      for (let i = 0; i < keyword.length; i++) {
        const char = keyword[i];

        // Include Chinese characters (CJK Unicode range)
        if (/[\u4e00-\u9fff]/.test(char)) {
          if (!ConflictDetectionService.ZH_STOPWORDS.has(char)) {
            normalized.add(char);
          }
        }
      }

      // Also extract English words from mixed text
      const englishWords = keyword.match(/[a-zA-Z]+/g) || [];
      for (const word of englishWords) {
        const lower = word.toLowerCase();
        if (
          lower.length >= 2 &&
          !ConflictDetectionService.EN_STOPWORDS.has(lower)
        ) {
          normalized.add(lower);
        }
      }
    }

    return Array.from(normalized).sort();
  }

  /**
   * Calculate Jaccard similarity between two sets
   *
   * Jaccard = |intersection| / |union|
   * Range: [0, 1] where 0 = no overlap, 1 = identical
   *
   * @param set1 - First set of keywords
   * @param set2 - Second set of keywords
   * @returns Jaccard similarity score
   */
  jaccardSimilarity(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) {
      return 1; // Both empty = identical
    }

    if (set1.length === 0 || set2.length === 0) {
      return 0; // One empty, one not = no similarity
    }

    const s1 = new Set(set1);
    const s2 = new Set(set2);

    // Calculate intersection
    let intersection = 0;
    for (const item of s1) {
      if (s2.has(item)) {
        intersection++;
      }
    }

    // Calculate union
    const union = s1.size + s2.size - intersection;

    return intersection / union;
  }

  /**
   * Detect conflict between two TDK keyword sets
   *
   * Applies normalization, calculates Jaccard, and assigns severity.
   *
   * @param keywords1 - First TDK's keywords
   * @param keywords2 - Second TDK's keywords
   * @param language - Language for normalization
   * @returns Conflict analysis result
   */
  detectPairConflict(
    keywords1: string[],
    keywords2: string[],
    language: Language = "en",
  ): ConflictResult {
    // Normalize both sets
    const norm1 = this.normalizeKeywords(keywords1, language);
    const norm2 = this.normalizeKeywords(keywords2, language);

    // Calculate Jaccard similarity
    const similarity = this.jaccardSimilarity(norm1, norm2);

    // Find overlap keywords
    const set1 = new Set(norm1);
    const set2 = new Set(norm2);
    const overlapKeywords: string[] = [];

    for (const keyword of set1) {
      if (set2.has(keyword)) {
        overlapKeywords.push(keyword);
      }
    }

    // Determine severity
    let severity: "high" | "medium" | "low";
    if (similarity > 0.7) {
      severity = "high";
    } else if (similarity >= 0.4) {
      severity = "medium";
    } else {
      severity = "low";
    }

    return {
      overlapKeywords: overlapKeywords.sort(),
      jaccardSimilarity: similarity,
      severity,
    };
  }

  /**
   * Calculate average Jaccard similarity across multiple sets
   *
   * @param sets - Array of keyword sets
   * @param language - Language for normalization
   * @returns Average similarity score
   */
  averageJaccardSimilarity(
    sets: string[][],
    language: Language = "en",
  ): number {
    if (sets.length <= 1) {
      return 0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const conflict = this.detectPairConflict(sets[i], sets[j], language);
        totalSimilarity += conflict.jaccardSimilarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate redundancy score (0-1, higher = more redundant)
   *
   * Redundancy is based on average similarity:
   * - Score > 0.7: high redundancy
   * - Score 0.4-0.7: medium redundancy
   * - Score < 0.4: low redundancy
   *
   * @param sets - Array of keyword sets
   * @param language - Language for normalization
   * @returns Redundancy score [0, 1]
   */
  calculateRedundancyScore(
    sets: string[][],
    language: Language = "en",
  ): number {
    const avgSimilarity = this.averageJaccardSimilarity(sets, language);

    // Linear mapping: 0-1 similarity -> 0-1 redundancy
    return avgSimilarity;
  }
}
