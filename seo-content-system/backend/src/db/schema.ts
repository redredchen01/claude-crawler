import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============= Users & Auth =============
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .default("user")
    .notNull(),
  createdAt: integer("created_at")
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Projects =============
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  siteName: text("site_name").notNull(),
  locale: text("locale").notNull(),
  language: text("language").notNull(),
  defaultEngine: text("default_engine").default("google").notNull(),
  createdAt: integer("created_at")
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Keyword Jobs =============
export const keywordJobs = sqliteTable("keyword_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  seedKeywords: text("seed_keywords").notNull(), // JSON array
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed", "stalled"],
  })
    .default("pending")
    .notNull(),
  configVersion: text("config_version").default("1.0.0").notNull(),
  expansionConfigSnapshot: text("expansion_config_snapshot").notNull(), // JSON
  classificationRulesVersion: text("classification_rules_version")
    .default("1.0.0")
    .notNull(),
  serpHeuristicsVersion: text("serp_heuristics_version")
    .default("1.0.0")
    .notNull(),
  checkpointCount: integer("checkpoint_count").default(0).notNull(),
  totalExpectedCount: integer("total_expected_count"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at")
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Keyword Candidates =============
export const keywordCandidates = sqliteTable(
  "keyword_candidates",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => keywordJobs.id),
    rawKeyword: text("raw_keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    parentKeyword: text("parent_keyword"),
    sourceType: text("source_type").notNull(), // 'original', 'expansion_strategy_name'
    sourceEngine: text("source_engine"),
    depth: integer("depth").notNull(),
    collectedAt: integer("collected_at")
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => ({
    uniqueCandidate: primaryKey({
      columns: [table.jobId, table.normalizedKeyword, table.depth],
      name: "unique_candidate",
    }),
    idxJobId: sql`CREATE INDEX idx_keyword_candidates_job_id ON keyword_candidates(job_id)`,
    idxNormalized: sql`CREATE INDEX idx_keyword_candidates_normalized ON keyword_candidates(normalized_keyword)`,
  }),
);

// ============= Keyword Features =============
export const keywordFeatures = sqliteTable("keyword_features", {
  id: text("id").primaryKey(),
  keywordId: text("keyword_id")
    .notNull()
    .references(() => keywordCandidates.id),
  wordCount: integer("word_count").notNull(),
  intentPrimary: text("intent_primary", {
    enum: ["informational", "commercial", "transactional", "navigational"],
  })
    .default("informational")
    .notNull(),
  intentSecondary: text("intent_secondary", {
    enum: [
      "question",
      "comparison",
      "scenario",
      "solution",
      "price",
      "local",
      "brand",
      "freshness",
    ],
  }),
  funnelStage: text("funnel_stage", {
    enum: ["awareness", "consideration", "decision"],
  })
    .default("awareness")
    .notNull(),
  keywordType: text("keyword_type", {
    enum: [
      "question",
      "comparison",
      "scenario",
      "solution",
      "price",
      "local",
      "brand",
      "freshness",
    ],
  })
    .default("question")
    .notNull(),
  contentFormatRecommendation: text("content_format_recommendation", {
    enum: [
      "article",
      "faq",
      "category",
      "landing",
      "comparison",
      "glossary",
      "topic_page",
    ],
  })
    .default("article")
    .notNull(),
  trendLabel: text("trend_label", {
    enum: ["stable", "seasonal", "rising", "declining", "unknown"],
  })
    .default("unknown")
    .notNull(),
  trendConfidence: real("trend_confidence").default(0).notNull(),
  trendDirection: real("trend_direction").default(0).notNull(),
  competitionScore: integer("competition_score").default(50).notNull(),
  opportunityScore: integer("opportunity_score").default(50).notNull(),
  confidenceScore: real("confidence_score").default(0.5).notNull(),
});

// ============= SERP Snapshots =============
export const serpSnapshots = sqliteTable("serp_snapshots", {
  id: text("id").primaryKey(),
  keywordId: text("keyword_id")
    .notNull()
    .references(() => keywordCandidates.id),
  competitionScore: integer("competition_score").notNull(),
  topTitlesJson: text("top_titles_json"), // JSON array
  topDomainsJson: text("top_domains_json"), // JSON array
  serpFeaturesJson: text("serp_features_json"), // JSON object
  screenshotPath: text("screenshot_path"),
  fetchedAt: integer("fetched_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Keyword Clusters (Phase 2) =============
export const keywordClusters = sqliteTable("keyword_clusters", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => keywordJobs.id),
  clusterName: text("cluster_name").notNull(),
  pillarKeyword: text("pillar_keyword").notNull(),
  pageType: text("page_type", {
    enum: [
      "article",
      "faq",
      "category",
      "landing",
      "comparison",
      "glossary",
      "topic_page",
    ],
  })
    .default("article")
    .notNull(),
  priorityScore: integer("priority_score").default(50).notNull(),
  createdAt: integer("created_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Cluster Members =============
export const clusterMembers = sqliteTable("cluster_members", {
  id: text("id").primaryKey(),
  clusterId: text("cluster_id")
    .notNull()
    .references(() => keywordClusters.id),
  keywordId: text("keyword_id")
    .notNull()
    .references(() => keywordCandidates.id),
});

// ============= Content Plans =============
export const contentPlans = sqliteTable(
  "content_plans",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => keywordClusters.id)
      .unique(),
    // Legacy fields (for backward compatibility)
    contentAngle: text("content_angle"),
    faqCandidatesJson: text("faq_candidates_json"), // JSON array
    internalLinkTargetsJson: text("internal_link_targets_json"), // JSON array
    exportPayloadJson: text("export_payload_json"), // JSON
    // Phase 5 fields
    status: text("status", {
      enum: ["pending", "generating", "completed", "failed"],
    })
      .default("pending")
      .notNull(),
    briefJson: text("brief_json"), // full AutomatedBrief JSON
    faqJson: text("faq_json"), // full AutomatedFaq JSON
    linksJson: text("links_json"), // full OptimizedInternalLinks JSON
    errorMessage: text("error_message"),
    modelVersion: text("model_version"), // e.g. "claude-3-5-sonnet-20241022"
    generatedAt: integer("generated_at"), // Unix timestamp
    // Phase 6: User editing fields
    userBriefJson: text("user_brief_json"), // user-modified brief (overrides briefJson)
    userFaqJson: text("user_faq_json"), // user-modified faq (overrides faqJson)
    isUserEdited: integer("is_user_edited", { mode: "boolean" })
      .default(false)
      .notNull(),
    editedAt: integer("edited_at"), // Unix timestamp when user last edited
    // Phase 6: Publishing tracking
    publishedUrl: text("published_url"),
    publishedAt: integer("published_at"), // Unix timestamp when marked as published
    notes: text("notes"), // User notes about the content plan
    createdAt: integer("created_at")
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at")
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => ({
    idxClusterId: sql`CREATE INDEX idx_content_plans_cluster_id ON content_plans(cluster_id)`,
  }),
);

// ============= API Keys (Phase 4.3) =============
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(), // SHA-256 hash of actual key
  keyPrefix: text("key_prefix").notNull(), // first 12 chars for display, e.g. "sk-AbCd1234XY"
  scopes: text("scopes").notNull(), // JSON: ["read", "write", "export"]
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at")
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============= Webhook Subscriptions (Phase 4.3) =============
export const webhookSubscriptions = sqliteTable(
  "webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    url: text("url").notNull(),
    events: text("events").notNull(), // JSON: ["job.completed", "job.failed"]
    secret: text("secret").notNull(), // plaintext; used for HMAC signing
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    lastTriggeredAt: integer("last_triggered_at"),
    createdAt: integer("created_at")
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => ({
    userIdIdx: index("webhook_subs_user_idx").on(table.userId),
  }),
);

// ============= Webhook Delivery History (Phase 8.4) =============
export const webhookDeliveryHistory = sqliteTable(
  "webhook_delivery_history",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    attemptedAt: integer("attempted_at").notNull(),
    statusCode: integer("status_code"),
    success: integer("success", { mode: "boolean" }).notNull(),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    attemptNumber: integer("attempt_number").notNull(),
  },
  (table) => ({
    subIdIdx: index("webhook_delivery_history_sub_idx").on(
      table.subscriptionId,
    ),
  }),
);
