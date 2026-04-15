import {
  pgTable,
  text,
  integer,
  varchar,
  timestamp,
  boolean,
  jsonb,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============== Users & Authentication ==============
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 255 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("viewer"), // admin, editor, viewer
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
  }),
);

// ============== API Keys ==============
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("api_keys_user_id_idx").on(table.userId),
  }),
);

// ============== Jobs ==============
export const jobs = pgTable(
  "jobs",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seed: varchar("seed", { length: 500 }).notNull(),
    sources: varchar("sources", { length: 255 }).notNull(), // comma-separated: google,bing,competitor
    status: varchar("status", { length: 50 }).notNull().default("waiting"), // waiting, running, completed, failed
    resultCount: integer("result_count").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    metadata: jsonb("metadata"), // Store custom data
  },
  (table) => ({
    userIdIdx: index("jobs_user_id_idx").on(table.userId),
    statusIdx: index("jobs_status_idx").on(table.status),
    createdAtIdx: index("jobs_created_at_idx").on(table.createdAt),
  }),
);

// ============== Results (Keywords) ==============
export const results = pgTable(
  "results",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    jobId: varchar("job_id", { length: 100 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    normalizedKeyword: varchar("normalized_keyword", { length: 500 }).notNull(),
    rawKeyword: varchar("raw_keyword", { length: 500 }).notNull(),
    source: varchar("source", { length: 50 }).notNull(), // google, bing, competitor
    intent: varchar("intent", { length: 50 }).notNull(), // informational, commercial, transactional, navigational
    score: integer("score").notNull(), // 0-100
    difficulty: integer("difficulty").notNull(), // 0-100
    roiScore: integer("roi_score").notNull(), // 0-100
    searchVolume: integer("search_volume"),
    trendDirection: varchar("trend_direction", { length: 20 }), // up, down, stable
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    jobIdIdx: index("results_job_id_idx").on(table.jobId),
    keywordIdx: index("results_keyword_idx").on(table.normalizedKeyword),
  }),
);

// ============== Webhooks ==============
export const webhooks = pgTable(
  "webhooks",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 500 }).notNull(),
    events: varchar("events", { length: 500 }).notNull(), // comma-separated: job:completed,job:failed
    filters: jsonb("filters"), // minResultCount, maxResultCount, statuses, sources, seedKeyword
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("webhooks_user_id_idx").on(table.userId),
  }),
);

// ============== Webhook Delivery Attempts ==============
export const webhookAttempts = pgTable(
  "webhook_attempts",
  {
    id: serial("id").primaryKey(),
    webhookId: varchar("webhook_id", { length: 100 })
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventName: varchar("event_name", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(), // success, failed
    statusCode: integer("status_code"),
    errorMessage: text("error_message"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    webhookIdIdx: uniqueIndex("webhook_attempts_webhook_id_idx").on(
      table.webhookId,
    ),
  }),
);

// ============== Analysis Cache ==============
export const analysisCache = pgTable(
  "analysis_cache",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    jobId: varchar("job_id", { length: 100 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    analysisType: varchar("analysis_type", { length: 50 }).notNull(), // difficulty_insights, roi_opportunities, competitor_gaps
    content: text("content").notNull(),
    contentLength: integer("content_length").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    jobIdIdx: uniqueIndex("analysis_cache_job_id_idx").on(table.jobId),
    analysisTypeIdx: uniqueIndex("analysis_cache_type_idx").on(
      table.analysisType,
    ),
  }),
);

// ============== Usage Log ==============
export const usageLog = pgTable(
  "usage_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUSD: varchar("cost_usd", { length: 50 }).notNull(), // Store as string for precision
    analysisType: varchar("analysis_type", { length: 50 }),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("usage_log_user_id_idx").on(table.userId),
    recordedAtIdx: index("usage_log_recorded_at_idx").on(table.recordedAt),
  }),
);

// ============== Audit Log ==============
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(), // create_job, create_webhook, delete_webhook, etc.
    resource: varchar("resource", { length: 100 }).notNull(), // job, webhook, result, user
    resourceId: varchar("resource_id", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull(), // success, failure
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("audit_log_user_id_idx").on(table.userId),
    createdAtIdx: uniqueIndex("audit_log_created_at_idx").on(table.createdAt),
  }),
);

// ============== Type Exports ==============
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Result = typeof results.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookAttempt = typeof webhookAttempts.$inferSelect;
export type AnalysisCache = typeof analysisCache.$inferSelect;
export type UsageLog = typeof usageLog.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
