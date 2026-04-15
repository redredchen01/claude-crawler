/**
 * Database Schema using Drizzle ORM
 *
 * Defines tables for the TDK Optimizer module.
 * Extends contentPlans table with TDK-specific fields.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * TDK Candidate - single Title, Description, Keywords set
 */
export interface TdkCandidate {
  title: string;
  description: string;
  keywords: string[];
}

/**
 * TDK JSON stored in database
 */
export interface TdkJson {
  primary: TdkCandidate;
  alternatives: TdkCandidate[];
  metadata: {
    generatedAt: string; // ISO datetime
    language: "en" | "zh";
    modelVersion: string;
    tokensUsed?: number;
  };
}

/**
 * User-edited TDK (separate from AI-generated)
 */
export interface UserTdkJson {
  title?: string;
  description?: string;
  keywords?: string[];
  editedAt?: string; // ISO datetime
}

/**
 * Validation result for a TDK candidate
 */
export interface TdkValidation {
  titleLength: {
    status: "pass" | "warn" | "fail";
    message: string;
  };
  descriptionLength: {
    status: "pass" | "warn" | "fail";
    message: string;
  };
  keywordStacking: {
    status: "pass" | "warn" | "fail";
    issues: Array<{
      word: string;
      count: number;
      density: number;
      reason: string;
    }>;
  };
  contentConsistency: {
    status: "pass" | "warn" | "info";
    coverage: number;
    matchedWords: string[];
    missingWords: string[];
  };
}

/**
 * Validation cache structure
 */
export interface TdkValidations {
  primary: TdkValidation;
  alternatives: TdkValidation[];
  lastValidatedAt: string; // ISO datetime
}

/**
 * Main content plans table (Phase 6 integration)
 *
 * This table extends the existing Phase 6 contentPlans with TDK-specific fields.
 * All new TDK fields are nullable to ensure backward compatibility.
 */
export const contentPlans = sqliteTable(
  "content_plans",
  {
    // Core identifiers
    id: text("id").primaryKey(), // UUID
    projectId: text("project_id").notNull(),
    clusterId: text("cluster_id").notNull(),

    // Phase 6 existing fields (simplified for schema demo)
    title: text("title").notNull(),
    contentType: text("content_type").notNull(), // 'blog', 'faq', etc.
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),

    // User identification
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),

    // =================================================================
    // NEW TDK FIELDS (Unit 3 additions)
    // =================================================================

    /**
     * AI-generated TDK recommendations (JSON)
     *
     * Structure: {
     *   "primary": { "title": "...", "description": "...", "keywords": [...] },
     *   "alternatives": [...],
     *   "metadata": { "generatedAt": "...", "language": "en|zh", "modelVersion": "..." }
     * }
     *
     * Nullable: yes (only populated after TDK generation)
     * Immutable: yes (regenerate to update, don't modify directly)
     */
    tdkJson: text("tdk_json"),

    /**
     * User-edited TDK (JSON)
     *
     * Structure: {
     *   "title": "...",
     *   "description": "...",
     *   "keywords": [...],
     *   "editedAt": "..."
     * }
     *
     * Nullable: yes (only set if user edits)
     * Mutable: yes (can be updated by user)
     * Purpose: Separates user edits from AI recommendations (Phase 6 pattern)
     */
    userTdkJson: text("user_tdk_json"),

    /**
     * Validation results cache (JSON)
     *
     * Structure: {
     *   "primary": { "titleLength": {...}, "descriptionLength": {...}, ... },
     *   "alternatives": [{...}, {...}],
     *   "lastValidatedAt": "..."
     * }
     *
     * Nullable: yes
     * Updated: automatically when TDK is generated or user edits
     * Purpose: Cache validation results for quick retrieval
     */
    tdkValidations: text("tdk_validations"),

    /**
     * TDK generation timestamp
     *
     * Nullable: yes
     * Purpose: Track when TDK was last generated
     */
    tdkGeneratedAt: text("tdk_generated_at"),

    /**
     * TDK language
     *
     * Values: 'en', 'zh'
     * Nullable: yes
     * Purpose: Track which language rules were applied during generation
     */
    tdkLanguage: text("tdk_language"), // 'en' | 'zh'

    /**
     * Generation request parameters (for reproducibility)
     *
     * Structure: {
     *   "topic": "...",
     *   "keywords": [...],
     *   "contentSnippet": "..."
     * }
     *
     * Nullable: yes
     * Purpose: Store original inputs so user can regenerate with same params
     */
    tdkInputJson: text("tdk_input_json"),

    /**
     * Number of times TDK was generated
     *
     * Nullable: yes
     * Purpose: Track regeneration count for analytics
     */
    tdkGenerationCount: integer("tdk_generation_count").default(0),

    // =================================================================
    // PHASE 3: MULTI-PAGE ANALYSIS & SERP INTEGRATION
    // =================================================================

    /**
     * Topic group ID for multi-page clustering
     *
     * Nullable: yes
     * Purpose: Group pages by topic to detect conflicts
     * Example: "baking-guide" for all baking-related pages
     */
    topicGroupId: text("topic_group_id"),

    /**
     * Related cluster IDs (JSON array)
     *
     * Nullable: yes
     * Format: JSON string ["cluster-2", "cluster-3"]
     * Purpose: Link related pages for multi-page analysis
     */
    relatedClusterIds: text("related_cluster_ids"),

    /**
     * SERP data snapshot (JSON)
     *
     * Nullable: yes
     * Structure: [
     *   { "rank": 1, "title": "...", "description": "...", "url": "...", "domain": "..." },
     *   ...
     * ]
     * Purpose: Store top-10 SERP results for SERP comparison
     */
    serpDataJson: text("serp_data_json"),

    /**
     * Last SERP fetch timestamp
     *
     * Nullable: yes
     * Purpose: Track when SERP data was last updated
     */
    lastSerpFetchedAt: text("last_serp_fetched_at"),

    // =================================================================
    // INDEXES
    // =================================================================
  },
  // Define indexes
  (table) => ({
    projectIdIdx: uniqueIndex("idx_content_plans_project_id").on(
      table.projectId,
    ),
    clusterIdIdx: uniqueIndex("idx_content_plans_cluster_id").on(
      table.clusterId,
    ),
    tdkGeneratedAtIdx: uniqueIndex("idx_content_plans_tdk_generated_at").on(
      table.tdkGeneratedAt,
    ),
    topicGroupIdIdx: uniqueIndex("idx_content_plans_topic_group_id").on(
      table.topicGroupId,
    ),
  }),
);

/**
 * TDK generation history table (optional, for audit trail)
 *
 * Stores each generation attempt for audit and analytics
 */
export const tdkGenerationHistory = sqliteTable(
  "tdk_generation_history",
  {
    id: text("id").primaryKey(), // UUID
    contentPlanId: text("content_plan_id").notNull(),
    projectId: text("project_id").notNull(),

    // Generation input
    topic: text("topic").notNull(),
    keywords: text("keywords"), // JSON array as string
    contentSnippet: text("content_snippet"),
    language: text("language").notNull(), // 'en' | 'zh'

    // Generation output
    generatedTdk: text("generated_tdk").notNull(), // Full TdkGenerationResult as JSON
    totalTokensUsed: integer("total_tokens_used"),

    // Status
    status: text("status").notNull().default("success"), // 'success', 'failed'
    errorMessage: text("error_message"),

    // Metadata
    modelVersion: text("model_version").notNull(),
    generatedAt: text("generated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    generatedBy: text("generated_by"), // User ID who triggered generation

    // Validation state
    wasApproved: integer("was_approved"), // 1/0, null = not yet decided
    approvedAt: text("approved_at"),
    approvedBy: text("approved_by"),
  },
  (table) => ({
    contentPlanIdIdx: uniqueIndex("idx_history_content_plan_id").on(
      table.contentPlanId,
    ),
    projectIdIdx: uniqueIndex("idx_history_project_id").on(table.projectId),
    generatedAtIdx: uniqueIndex("idx_history_generated_at").on(
      table.generatedAt,
    ),
  }),
);

/**
 * TDK Feedback table (Phase 3 addition)
 *
 * Stores user feedback (thumbs up/down) on generated TDKs
 * Decoupled from contentPlans to preserve feedback even if plans are deleted
 */
export const tdkFeedback = sqliteTable(
  "tdk_feedback",
  {
    id: text("id").primaryKey(), // UUID
    contentPlanId: text("content_plan_id").notNull(),
    projectId: text("project_id").notNull(),

    // Feedback type
    type: text("type").notNull(), // 'positive', 'negative'

    // Optional feedback text
    feedbackText: text("feedback_text"), // Max 500 chars

    // SERP snapshot at time of feedback
    serpSnapshotJson: text("serp_snapshot_json"), // Optional JSON

    // Metadata
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: text("created_by"), // User ID
  },
  (table) => ({
    contentPlanIdIdx: uniqueIndex("idx_feedback_content_plan_id").on(
      table.contentPlanId,
    ),
    projectIdIdx: uniqueIndex("idx_feedback_project_id").on(table.projectId),
    createdAtIdx: uniqueIndex("idx_feedback_created_at").on(table.createdAt),
  }),
);

/**
 * TDK Cost Log table (Phase 3 addition)
 *
 * Tracks API usage and token consumption for cost management
 */
export const tdkCostLog = sqliteTable(
  "tdk_cost_log",
  {
    id: text("id").primaryKey(), // UUID
    projectId: text("project_id").notNull(),
    userId: text("user_id"), // Optional, for per-user quota

    // Operation type
    operation: text("operation").notNull(), // 'generate', 'serp_fetch', 'analyze'

    // Token and cost
    tokensUsed: integer("tokens_used").notNull(),
    estimatedCost: real("estimated_cost"), // USD

    // Metadata
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    metadataJson: text("metadata_json"), // Additional context as JSON
  },
  (table) => ({
    projectIdIdx: uniqueIndex("idx_cost_log_project_id").on(table.projectId),
    userIdIdx: uniqueIndex("idx_cost_log_user_id").on(table.userId),
    createdAtIdx: uniqueIndex("idx_cost_log_created_at").on(table.createdAt),
  }),
);

/**
 * Type exports for use in services
 */
export type ContentPlan = typeof contentPlans.$inferSelect;
export type NewContentPlan = typeof contentPlans.$inferInsert;
export type TdkGenerationHistoryRecord =
  typeof tdkGenerationHistory.$inferSelect;
export type NewTdkGenerationHistoryRecord =
  typeof tdkGenerationHistory.$inferInsert;
export type TdkFeedback = typeof tdkFeedback.$inferSelect;
export type NewTdkFeedback = typeof tdkFeedback.$inferInsert;
export type TdkCostLog = typeof tdkCostLog.$inferSelect;
export type NewTdkCostLog = typeof tdkCostLog.$inferInsert;
