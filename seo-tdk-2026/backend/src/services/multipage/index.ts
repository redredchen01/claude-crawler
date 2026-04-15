/**
 * Multi-page Analysis Services
 *
 * Exports for multi-page TDK analysis and conflict detection
 */

export {
  ConflictDetectionService,
  type ConflictResult,
} from "./conflictDetectionService";
export {
  MultiPageAnalysisService,
  type MultiPageAnalysisResult,
  type PageSummary,
  type ConflictAnalysis,
  type TopicCoherence,
  type AnalysisStatistics,
} from "./multiPageAnalysisService";
