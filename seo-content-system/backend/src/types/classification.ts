/**
 * Keyword Classification Types
 */

export type IntentPrimary =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";
export type IntentSecondary =
  | "question"
  | "comparison"
  | "scenario"
  | "solution"
  | "price"
  | "local"
  | "brand"
  | "freshness";
export type FunnelStage = "awareness" | "consideration" | "decision";
export type KeywordType =
  | "question"
  | "comparison"
  | "scenario"
  | "solution"
  | "price"
  | "local"
  | "brand"
  | "freshness";
export type ContentFormat =
  | "article"
  | "faq"
  | "category"
  | "landing"
  | "comparison"
  | "glossary"
  | "topic_page";

export interface KeywordClassification {
  keyword: string;
  wordCount: number;
  intentPrimary: IntentPrimary;
  intentSecondary?: IntentSecondary;
  funnelStage: FunnelStage;
  keywordType: KeywordType;
  contentFormatRecommendation: ContentFormat;
  confidenceScore: number;
  classificationDetails?: Record<string, any>;
}

export interface ClassificationRules {
  questionIndicators: string[];
  comparisonIndicators: string[];
  priceIndicators: string[];
  brandIndicators: string[];
  locationIndicators: string[];
  commercialIndicators: string[];
  transactionalIndicators: string[];
  scenaroIndicators: string[];
}
