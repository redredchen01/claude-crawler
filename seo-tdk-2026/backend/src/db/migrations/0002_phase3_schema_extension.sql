/**
 * Migration: Phase 3 Schema Extension
 * Date: 2026-04-15
 *
 * Adds multi-page analysis fields to contentPlans table
 * and introduces feedback + cost tracking tables.
 */

-- =================================================================
-- Step 1: Extend contentPlans table (Phase 3 fields)
-- =================================================================

ALTER TABLE content_plans
ADD COLUMN IF NOT EXISTS topic_group_id TEXT; -- Multi-page topic grouping

ALTER TABLE content_plans
ADD COLUMN IF NOT EXISTS related_cluster_ids TEXT; -- Related pages (JSON)

ALTER TABLE content_plans
ADD COLUMN IF NOT EXISTS serp_data_json TEXT; -- SERP snapshot

ALTER TABLE content_plans
ADD COLUMN IF NOT EXISTS last_serp_fetched_at TEXT; -- SERP fetch timestamp


-- =================================================================
-- Step 2: Create tdk_feedback table
-- =================================================================

CREATE TABLE IF NOT EXISTS tdk_feedback (
  id TEXT PRIMARY KEY,
  content_plan_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  -- Feedback type
  type TEXT NOT NULL, -- 'positive', 'negative'

  -- Optional feedback text
  feedback_text TEXT, -- Max 500 chars

  -- SERP snapshot at time of feedback
  serp_snapshot_json TEXT,

  -- Metadata
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Create indexes for feedback queries
CREATE INDEX IF NOT EXISTS idx_feedback_content_plan_id ON tdk_feedback(content_plan_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project_id ON tdk_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON tdk_feedback(created_at);


-- =================================================================
-- Step 3: Create tdk_cost_log table
-- =================================================================

CREATE TABLE IF NOT EXISTS tdk_cost_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT,

  -- Operation type
  operation TEXT NOT NULL, -- 'generate', 'serp_fetch', 'analyze'

  -- Token and cost
  tokens_used INTEGER NOT NULL,
  estimated_cost REAL,

  -- Metadata
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);

-- Create indexes for cost queries
CREATE INDEX IF NOT EXISTS idx_cost_log_project_id ON tdk_cost_log(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_user_id ON tdk_cost_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON tdk_cost_log(created_at);


-- =================================================================
-- Step 4: Add index for topic_group_id
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_content_plans_topic_group_id ON content_plans(topic_group_id);


-- =================================================================
-- Backward Compatibility Notes
-- =================================================================
--
-- ✓ All new columns are nullable
-- ✓ Existing contentPlans rows are unaffected
-- ✓ New tables don't reference contentPlans with foreign keys
--   (allows deletion of contentPlans without cascade)
-- ✓ No data migration needed
--
