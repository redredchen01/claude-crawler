/**
 * Database initialization using Drizzle ORM
 *
 * Handles SQLite connection and schema management
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";
import * as schema from "./schema";

// Database path
const dbPath = path.resolve(process.cwd(), "db", "tdk.db");
const dbDir = path.dirname(dbPath);

// Ensure db directory exists
mkdirSync(dbDir, { recursive: true });

// Initialize SQLite database
const sqlite = new Database(dbPath);

// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Initialize tables if they don't exist
export async function initializeDatabase() {
  try {
    // Create tables from Drizzle schema definitions
    const createContentPlansSQL = `
      CREATE TABLE IF NOT EXISTS content_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        updated_by TEXT,
        tdk_json TEXT,
        user_tdk_json TEXT,
        tdk_validations TEXT,
        tdk_generated_at TEXT,
        tdk_language TEXT,
        tdk_input_json TEXT,
        tdk_generation_count INTEGER DEFAULT 0,
        -- Phase 3: Multi-page analysis fields
        topic_group_id TEXT,
        related_cluster_ids TEXT,
        serp_data_json TEXT,
        last_serp_fetched_at TEXT
      )
    `;

    const createHistorySQL = `
      CREATE TABLE IF NOT EXISTS tdk_generation_history (
        id TEXT PRIMARY KEY,
        content_plan_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        keywords TEXT,
        content_snippet TEXT,
        language TEXT NOT NULL,
        generated_tdk TEXT NOT NULL,
        total_tokens_used INTEGER,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        model_version TEXT NOT NULL,
        generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        generated_by TEXT,
        was_approved INTEGER,
        approved_at TEXT,
        approved_by TEXT
      )
    `;

    // Phase 3: Feedback table
    const createFeedbackSQL = `
      CREATE TABLE IF NOT EXISTS tdk_feedback (
        id TEXT PRIMARY KEY,
        content_plan_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        feedback_text TEXT,
        serp_snapshot_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
      )
    `;

    // Phase 3: Cost tracking table
    const createCostLogSQL = `
      CREATE TABLE IF NOT EXISTS tdk_cost_log (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT,
        operation TEXT NOT NULL,
        tokens_used INTEGER NOT NULL,
        estimated_cost REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata_json TEXT
      )
    `;

    const createIndexesSQL = `
      CREATE INDEX IF NOT EXISTS idx_content_plans_project_id ON content_plans(project_id);
      CREATE INDEX IF NOT EXISTS idx_content_plans_cluster_id ON content_plans(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_content_plans_tdk_generated_at ON content_plans(tdk_generated_at);
      CREATE INDEX IF NOT EXISTS idx_content_plans_topic_group_id ON content_plans(topic_group_id);
      CREATE INDEX IF NOT EXISTS idx_history_content_plan_id ON tdk_generation_history(content_plan_id);
      CREATE INDEX IF NOT EXISTS idx_history_project_id ON tdk_generation_history(project_id);
      CREATE INDEX IF NOT EXISTS idx_history_generated_at ON tdk_generation_history(generated_at);
      CREATE INDEX IF NOT EXISTS idx_feedback_content_plan_id ON tdk_feedback(content_plan_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_project_id ON tdk_feedback(project_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON tdk_feedback(created_at);
      CREATE INDEX IF NOT EXISTS idx_cost_log_project_id ON tdk_cost_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_cost_log_user_id ON tdk_cost_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON tdk_cost_log(created_at);
    `;

    sqlite.exec(createContentPlansSQL);
    sqlite.exec(createHistorySQL);
    sqlite.exec(createFeedbackSQL);
    sqlite.exec(createCostLogSQL);
    sqlite.exec(createIndexesSQL);

    console.log("✓ Database tables initialized");
  } catch (error) {
    console.error("✗ Database initialization failed:", error);
    throw error;
  }
}

// Export types
export type Database = typeof db;
export { schema };
