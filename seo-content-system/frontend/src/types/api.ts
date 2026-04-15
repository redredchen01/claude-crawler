/**
 * API Type Definitions
 * Phase 3.3: Shared types between frontend and backend
 */

// Cluster types
export interface Cluster {
  id: string;
  name: string;
  pillarKeyword: string;
  keywords: string[];
  keywordIds: string[];
  memberCount: number;
  pageType: string;
  priority: number;
  createdAt: number;
  averageSearchVolume?: number;
  competitionScore: number;
  confidenceScore: number;
}

// Keyword feature types
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

export type ContentFormat =
  | "article"
  | "faq"
  | "category"
  | "landing"
  | "comparison"
  | "glossary"
  | "topic_page";

export interface KeywordFeature {
  id?: string;
  raw_keyword: string;
  normalized_keyword?: string;
  word_count?: number;
  intent_primary: IntentPrimary;
  intent_secondary?: IntentSecondary;
  funnel_stage: FunnelStage;
  keyword_type?: string;
  content_format_recommendation: ContentFormat;
  trend_label?: "stable" | "seasonal" | "rising" | "declining" | "unknown";
  trend_confidence?: number; // 0-1
  trend_direction?: number; // -1 to 1
  competition_score?: number;
  opportunity_score?: number;
}

// Content Brief types
export interface TargetKeywords {
  primary: string[];
  secondary: string[];
  longtail: string[];
}

export interface ContentLength {
  target: number;
  reasoning?: string;
}

export interface ContentBrief {
  id?: string;
  clusterId: string;
  pillarKeyword: string;
  title: string;
  metaDescription: string;
  pageType?: string;
  outline?: string[];
  targetKeywords?: TargetKeywords;
  faqSuggestions?: string[];
  internalLinkTargets?: string[];
  contentLength?: ContentLength;
  seoNotes?: string[];
  targetIntents?: string[];
  generatedAt?: number;
}

// FAQ Page types
export interface FAQ {
  question: string;
  answer: string;
  keywords?: string[];
}

export interface FAQPage {
  id?: string;
  clusterId: string;
  pillarKeyword: string;
  pageTitle: string;
  introduction: string;
  faqs: FAQ[];
  conclusion?: string;
  relatedTopics?: string[];
  generatedAt?: number;
}

// Internal Link types
export interface InternalLink {
  targetClusterId?: string;
  anchorText: string;
  context?: string;
  type?: "topical" | "prerequisite" | "expansion" | "related";
  relevanceScore?: number;
}

export interface InternalLinkSuggestions {
  id?: string;
  clusterId: string;
  pillarKeyword: string;
  outgoingLinks: InternalLink[];
  incomingLinks: InternalLink[];
  linkingStrategies?: string[];
  generatedAt?: number;
}

// Job types
export interface KeywordJobConfig {
  strategies: string[];
  maxCandidatesPerStrategy: number;
  totalMaxCandidates: number;
  expandDepth: number;
  deduplication: boolean;
}

export interface KeywordJob {
  id: string;
  projectId: string;
  seedKeywords: string[];
  status: "pending" | "processing" | "completed" | "failed";
  config: KeywordJobConfig;
  candidateCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// Project types
export interface Project {
  id: string;
  name: string;
  siteName: string;
  locale: string;
  language: string;
  defaultEngine: string;
  createdAt: number;
  updatedAt: number;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ClusterListResponse {
  clusters: Cluster[];
  total: number;
}

export interface ContentPlanResponse {
  brief: ContentBrief | null;
  faq: FAQPage | null;
  links: InternalLinkSuggestions | null;
  status: "pending" | "generating" | "completed" | "failed";
  generatedAt: number | null;
  // Phase 6: User editing and publishing fields
  isUserEdited: boolean;
  editedAt: number | null;
  publishedUrl: string | null;
  publishedAt: number | null;
  notes: string | null;
}
