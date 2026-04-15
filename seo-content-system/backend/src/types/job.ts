/**
 * Keyword Job Types
 * Defines structures for async keyword processing jobs
 */

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface KeywordJobConfig {
  /**
   * Expansion depth: how many rounds of modification to apply
   * 1 = original + direct modifications
   * 2 = original + modifications + modifications of modifications
   */
  expandDepth: number;

  /**
   * Max candidates per strategy (e.g., max 100 a-z suffixes)
   */
  maxCandidatesPerStrategy: number;

  /**
   * Total max candidates across all strategies
   */
  totalMaxCandidates: number;

  /**
   * Enabled expansion strategies
   */
  strategies: Array<
    | "original"
    | "space_modifier"
    | "a_z_suffix"
    | "numeric_suffix"
    | "question_modifiers"
    | "comparison_modifiers"
    | "commercial_modifiers"
    | "scenario_modifiers"
    | "location_modifiers"
  >;

  /**
   * Enable SERP analysis (Phase 2)
   */
  enableSerpAnalysis: boolean;

  /**
   * Enable trend detection (Phase 2)
   */
  enableTrendDetection: boolean;

  /**
   * Deduplication enabled
   */
  deduplication: boolean;
}

export interface KeywordJobCheckpoint {
  /**
   * Checkpoint name - current stage
   */
  stage: "expansion" | "normalization" | "classification" | "completed";

  /**
   * Number of keywords processed up to this checkpoint
   */
  processedCount: number;

  /**
   * Timestamp of checkpoint
   */
  timestamp: number;
}

export interface KeywordJobResult {
  jobId: string;
  projectId: string;
  status: JobStatus;
  seedKeywords: string[];
  totalCandidates: number;
  processedCount: number;
  errorCount: number;
  startedAt: number | null;
  completedAt: number | null;
  currentCheckpoint: KeywordJobCheckpoint | null;
  error?: string;
}

export interface CreateJobRequest {
  seedKeywords: string[];
  config?: Partial<KeywordJobConfig>;
}

export interface JobProgressEvent {
  jobId: string;
  stage: string;
  processed: number;
  total: number;
  timestamp: number;
}
