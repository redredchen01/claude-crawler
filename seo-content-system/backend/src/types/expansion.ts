/**
 * Keyword Expansion Types & Interfaces
 */

export type StrategyType =
  | "original"
  | "space_modifier"
  | "a_z_suffix"
  | "numeric_suffix"
  | "question_modifiers"
  | "comparison_modifiers"
  | "commercial_modifiers"
  | "scenario_modifiers"
  | "location_modifiers";

export interface ExpandCandidate {
  keyword: string;
  sourceType: StrategyType;
  sourceEngine?: string;
  depth: number;
}

export interface ExpansionStrategy {
  type: StrategyType;
  enabled: boolean;
  modifiers?: string[];
  maxCandidatesPerModifier?: number;
}

export interface ExpansionConfig {
  strategies: ExpansionStrategy[];
  maxCandidatesPerStrategy: number;
  totalMaxCandidates: number;
  deduplication: boolean;
  expandDepth: number;
}

export interface ExpansionResult {
  seedKeyword: string;
  candidates: ExpandCandidate[];
  totalCount: number;
  duplicatesRemoved: number;
  executionTimeMs: number;
}

/**
 * Expansion context and configuration loading
 */
export interface ExpansionContext {
  config: ExpansionConfig;
  seedKeyword: string;
  depth: number;
}
