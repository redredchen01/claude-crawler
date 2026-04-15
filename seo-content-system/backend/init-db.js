#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates all tables for Phase 6 production deployment
 */

import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_URL || "seo-content.db";
console.log(`Initializing database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// SQL schema from Drizzle schema.ts
const createTableStatements = [
  // Users table
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "email" text UNIQUE NOT NULL,
    "hashed_password" text NOT NULL,
    "role" text DEFAULT 'user' NOT NULL,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    "updated_at" integer DEFAULT (unixepoch()) NOT NULL
  )`,

  // Projects table
  `CREATE TABLE IF NOT EXISTS "projects" (
    "id" text PRIMARY KEY NOT NULL,
    "owner_id" text NOT NULL,
    "name" text NOT NULL,
    "site_name" text NOT NULL,
    "locale" text NOT NULL,
    "language" text NOT NULL,
    "default_engine" text DEFAULT 'google' NOT NULL,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    "updated_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("owner_id") REFERENCES "users" ("id")
  )`,

  // Keyword Jobs table
  `CREATE TABLE IF NOT EXISTS "keyword_jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "project_id" text NOT NULL,
    "seed_keywords" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "config_version" text DEFAULT '1.0.0' NOT NULL,
    "expansion_config_snapshot" text NOT NULL,
    "classification_rules_version" text DEFAULT '1.0.0' NOT NULL,
    "serp_heuristics_version" text DEFAULT '1.0.0' NOT NULL,
    "checkpoint_count" integer DEFAULT 0 NOT NULL,
    "total_expected_count" integer,
    "error_message" text,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    "updated_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("project_id") REFERENCES "projects" ("id")
  )`,

  // Keyword Candidates table
  `CREATE TABLE IF NOT EXISTS "keyword_candidates" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL,
    "raw_keyword" text NOT NULL,
    "normalized_keyword" text NOT NULL,
    "parent_keyword" text,
    "source_type" text NOT NULL,
    "source_engine" text,
    "depth" integer NOT NULL,
    "collected_at" integer DEFAULT (unixepoch()) NOT NULL,
    UNIQUE ("job_id", "normalized_keyword", "depth"),
    FOREIGN KEY ("job_id") REFERENCES "keyword_jobs" ("id")
  )`,

  // Keyword Features table
  `CREATE TABLE IF NOT EXISTS "keyword_features" (
    "id" text PRIMARY KEY NOT NULL,
    "keyword_id" text NOT NULL,
    "word_count" integer NOT NULL,
    "intent_primary" text DEFAULT 'informational' NOT NULL,
    "intent_secondary" text,
    "funnel_stage" text DEFAULT 'awareness' NOT NULL,
    "keyword_type" text DEFAULT 'question' NOT NULL,
    "content_format_recommendation" text DEFAULT 'article' NOT NULL,
    "content_format" text,
    "trend_label" text DEFAULT 'unknown' NOT NULL,
    "trendLabel" text,
    "trend_confidence" real DEFAULT 0 NOT NULL,
    "trendConfidence" real,
    "trend_direction" real DEFAULT 0 NOT NULL,
    "trendDirection" real,
    "competition_score" integer DEFAULT 50 NOT NULL,
    "opportunity_score" integer DEFAULT 50 NOT NULL,
    "confidence_score" real DEFAULT 0.5 NOT NULL,
    FOREIGN KEY ("keyword_id") REFERENCES "keyword_candidates" ("id")
  )`,

  // SERP Snapshots table
  `CREATE TABLE IF NOT EXISTS "serp_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "keyword_id" text NOT NULL,
    "competition_score" integer NOT NULL,
    "top_titles_json" text,
    "top_domains_json" text,
    "serp_features_json" text,
    "screenshot_path" text,
    "fetched_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("keyword_id") REFERENCES "keyword_candidates" ("id")
  )`,

  // Keyword Clusters table
  `CREATE TABLE IF NOT EXISTS "keyword_clusters" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL,
    "cluster_name" text NOT NULL,
    "pillar_keyword" text NOT NULL,
    "page_type" text DEFAULT 'article' NOT NULL,
    "priority_score" integer DEFAULT 50 NOT NULL,
    "keywords_count" integer,
    "avg_search_volume" real,
    "avg_competition" integer,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("job_id") REFERENCES "keyword_jobs" ("id")
  )`,

  // Cluster Members table
  `CREATE TABLE IF NOT EXISTS "cluster_members" (
    "id" text PRIMARY KEY NOT NULL,
    "cluster_id" text NOT NULL,
    "keyword_id" text NOT NULL,
    FOREIGN KEY ("cluster_id") REFERENCES "keyword_clusters" ("id"),
    FOREIGN KEY ("keyword_id") REFERENCES "keyword_candidates" ("id")
  )`,

  // Content Plans table (WITH Phase 6 FIELDS)
  `CREATE TABLE IF NOT EXISTS "content_plans" (
    "id" text PRIMARY KEY NOT NULL,
    "cluster_id" text UNIQUE NOT NULL,
    "content_angle" text,
    "faq_candidates_json" text,
    "internal_link_targets_json" text,
    "export_payload_json" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "brief_json" text,
    "faq_json" text,
    "links_json" text,
    "error_message" text,
    "model_version" text,
    "generated_at" integer,
    "user_brief_json" text,
    "user_faq_json" text,
    "is_user_edited" integer DEFAULT 0 NOT NULL,
    "edited_at" integer,
    "published_url" text,
    "published_at" integer,
    "notes" text,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    "updated_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("cluster_id") REFERENCES "keyword_clusters" ("id")
  )`,

  // API Keys table
  `CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "key_hash" text UNIQUE NOT NULL,
    "key_prefix" text NOT NULL,
    "scopes" text NOT NULL,
    "is_active" integer DEFAULT 1 NOT NULL,
    "last_used_at" integer,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  )`,

  // Webhook Subscriptions table
  `CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "url" text NOT NULL,
    "events" text NOT NULL,
    "secret" text NOT NULL,
    "is_active" integer DEFAULT 1 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "last_triggered_at" integer,
    "created_at" integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  )`,
];

// Create indexes
const createIndexStatements = [
  `CREATE INDEX IF NOT EXISTS "idx_keyword_candidates_job_id" ON "keyword_candidates" ("job_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_keyword_candidates_normalized" ON "keyword_candidates" ("normalized_keyword")`,
  `CREATE INDEX IF NOT EXISTS "idx_content_plans_cluster_id" ON "content_plans" ("cluster_id")`,
];

try {
  console.log("Creating tables...");
  for (const statement of createTableStatements) {
    db.exec(statement);
  }
  console.log("✅ All tables created");

  console.log("Creating indexes...");
  for (const statement of createIndexStatements) {
    db.exec(statement);
  }
  console.log("✅ All indexes created");

  // Verify Phase 6 columns exist
  console.log("\nVerifying Phase 6 columns...");
  const columns = db.prepare(`PRAGMA table_info(content_plans)`).all();
  const columnNames = columns.map((c) => c.name);

  const phase6Columns = [
    "user_brief_json",
    "user_faq_json",
    "is_user_edited",
    "edited_at",
    "published_url",
    "published_at",
    "notes",
  ];

  const missing = phase6Columns.filter((col) => !columnNames.includes(col));

  if (missing.length === 0) {
    console.log("✅ All Phase 6 columns present:");
    phase6Columns.forEach((col) => console.log(`   - ${col}`));
  } else {
    console.error("❌ Missing Phase 6 columns:", missing);
    process.exit(1);
  }

  console.log("\n✅ Database initialization complete!");
  console.log(`   Database: ${dbPath}`);
  console.log("   Schema: 8 tables, 3 indexes");
  console.log("   Phase 6: ✅ Ready for production deployment");

  db.close();
} catch (error) {
  console.error("❌ Database initialization failed:", error);
  db.close();
  process.exit(1);
}
