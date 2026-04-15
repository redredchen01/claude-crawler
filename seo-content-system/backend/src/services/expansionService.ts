/**
 * Keyword Expansion Service
 * Generates long-tail keyword candidates from seed keywords
 */

import {
  ExpandCandidate,
  ExpansionConfig,
  ExpansionResult,
  StrategyType,
} from "../types/expansion.js";

// Modifier templates for Chinese keywords
const MODIFIER_TEMPLATES = {
  question_modifiers: [
    "怎么",
    "如何",
    "为什么",
    "是什么",
    "哪个好",
    "有什么区别",
  ],
  comparison_modifiers: ["vs", "区别", "比较", "哪个更好"],
  commercial_modifiers: ["推荐", "价格", "费用", "购买", "优惠", "排行"],
  scenario_modifiers: ["新手", "教程", "步骤", "公司", "个人", "手机", "电脑"],
  location_modifiers: [
    "中国",
    "北京",
    "上海",
    "台湾",
    "香港",
    "新加坡",
    "美国",
  ],
};

export class KeywordExpansionService {
  /**
   * Expand a single seed keyword using configured strategies
   */
  static async expandKeyword(
    seedKeyword: string,
    config: ExpansionConfig,
  ): Promise<ExpandCandidate[]> {
    const candidates: ExpandCandidate[] = [];
    const startTime = Date.now();

    // Add original keyword
    if (config.strategies.some((s) => s.type === "original" && s.enabled)) {
      candidates.push({
        keyword: seedKeyword,
        sourceType: "original",
        depth: 0,
      });
    }

    // Apply each enabled strategy
    for (const strategy of config.strategies) {
      if (!strategy.enabled) continue;

      try {
        const strategyCandidates = await this.applyStrategy(
          seedKeyword,
          strategy,
          config.maxCandidatesPerStrategy,
        );
        candidates.push(...strategyCandidates);

        // Stop if we've hit total limit
        if (candidates.length >= config.totalMaxCandidates) {
          break;
        }
      } catch (error) {
        console.error(`Strategy ${strategy.type} failed:`, error);
        // Continue with next strategy on error
      }
    }

    // Deduplicate if enabled
    const uniqueCandidates = config.deduplication
      ? this.deduplicate(candidates)
      : candidates;

    // Trim to max
    const finalCandidates = uniqueCandidates.slice(
      0,
      config.totalMaxCandidates,
    );

    return finalCandidates;
  }

  /**
   * Apply a specific expansion strategy
   */
  private static async applyStrategy(
    keyword: string,
    strategy: any,
    maxPerStrategy: number,
  ): Promise<ExpandCandidate[]> {
    switch (strategy.type) {
      case "original":
        return [{ keyword, sourceType: "original", depth: 0 }];

      case "space_modifier":
        return this.generateSpaceModifiers(keyword, maxPerStrategy);

      case "a_z_suffix":
        return this.generateAlphabeticSuffixes(keyword, maxPerStrategy);

      case "numeric_suffix":
        return this.generateNumericSuffixes(keyword, maxPerStrategy);

      case "question_modifiers":
        return this.generateModifierCombinations(
          keyword,
          MODIFIER_TEMPLATES.question_modifiers,
          "question_modifiers",
          maxPerStrategy,
        );

      case "comparison_modifiers":
        return this.generateModifierCombinations(
          keyword,
          MODIFIER_TEMPLATES.comparison_modifiers,
          "comparison_modifiers",
          maxPerStrategy,
        );

      case "commercial_modifiers":
        return this.generateModifierCombinations(
          keyword,
          MODIFIER_TEMPLATES.commercial_modifiers,
          "commercial_modifiers",
          maxPerStrategy,
        );

      case "scenario_modifiers":
        return this.generateModifierCombinations(
          keyword,
          MODIFIER_TEMPLATES.scenario_modifiers,
          "scenario_modifiers",
          maxPerStrategy,
        );

      case "location_modifiers":
        return this.generateModifierCombinations(
          keyword,
          MODIFIER_TEMPLATES.location_modifiers,
          "location_modifiers",
          maxPerStrategy,
        );

      default:
        console.warn(`Unknown strategy: ${strategy.type}`);
        return [];
    }
  }

  /**
   * Generate combinations with space modifier
   */
  private static generateSpaceModifiers(
    keyword: string,
    max: number,
  ): ExpandCandidate[] {
    const candidates: ExpandCandidate[] = [];

    // keyword + space + keyword
    const spaced = `${keyword} ${keyword}`;
    if (spaced !== keyword && candidates.length < max) {
      candidates.push({
        keyword: spaced,
        sourceType: "space_modifier",
        depth: 1,
      });
    }

    return candidates.slice(0, max);
  }

  /**
   * Generate a-z suffix variations
   */
  private static generateAlphabeticSuffixes(
    keyword: string,
    max: number,
  ): ExpandCandidate[] {
    const candidates: ExpandCandidate[] = [];
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");

    for (const letter of letters) {
      if (candidates.length >= max) break;
      candidates.push({
        keyword: `${keyword}${letter}`,
        sourceType: "a_z_suffix",
        depth: 1,
      });
    }

    return candidates;
  }

  /**
   * Generate numeric suffix variations
   */
  private static generateNumericSuffixes(
    keyword: string,
    max: number,
  ): ExpandCandidate[] {
    const candidates: ExpandCandidate[] = [];

    // Single digits 0-9
    for (let i = 0; i < 10 && candidates.length < max; i++) {
      candidates.push({
        keyword: `${keyword}${i}`,
        sourceType: "numeric_suffix",
        depth: 1,
      });
    }

    // Common year patterns
    const years = [2024, 2025, 2023];
    for (const year of years) {
      if (candidates.length >= max) break;
      candidates.push({
        keyword: `${keyword}${year}`,
        sourceType: "numeric_suffix",
        depth: 1,
      });
    }

    return candidates.slice(0, max);
  }

  /**
   * Generate modifier combinations
   */
  private static generateModifierCombinations(
    keyword: string,
    modifiers: string[],
    strategyType: StrategyType,
    max: number,
  ): ExpandCandidate[] {
    const candidates: ExpandCandidate[] = [];

    for (const modifier of modifiers) {
      if (candidates.length >= max) break;

      // Prefix
      candidates.push({
        keyword: `${modifier}${keyword}`,
        sourceType: strategyType,
        depth: 1,
      });

      if (candidates.length >= max) break;

      // Suffix
      candidates.push({
        keyword: `${keyword}${modifier}`,
        sourceType: strategyType,
        depth: 1,
      });

      if (candidates.length >= max) break;

      // Space-separated
      candidates.push({
        keyword: `${keyword} ${modifier}`,
        sourceType: strategyType,
        depth: 1,
      });

      if (candidates.length >= max) break;

      // Space-prefix
      candidates.push({
        keyword: `${modifier} ${keyword}`,
        sourceType: strategyType,
        depth: 1,
      });
    }

    return candidates.slice(0, max);
  }

  /**
   * Deduplicate candidates by keyword
   */
  private static deduplicate(candidates: ExpandCandidate[]): ExpandCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      if (seen.has(c.keyword)) return false;
      seen.add(c.keyword);
      return true;
    });
  }

  /**
   * Load expansion config from file or use default
   */
  static getDefaultConfig(): ExpansionConfig {
    return {
      strategies: [
        { type: "original", enabled: true },
        { type: "space_modifier", enabled: true },
        { type: "a_z_suffix", enabled: true },
        { type: "numeric_suffix", enabled: true },
        { type: "question_modifiers", enabled: true },
        { type: "comparison_modifiers", enabled: true },
        { type: "commercial_modifiers", enabled: true },
        { type: "scenario_modifiers", enabled: true },
      ],
      maxCandidatesPerStrategy: 100,
      totalMaxCandidates: 1000,
      deduplication: true,
      expandDepth: 1,
    };
  }
}
