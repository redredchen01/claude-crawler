-- Migration: Add TDK fields to content_plans table
-- Date: 2026-04-15
-- Description: Extends contentPlans table with TDK (Title/Description/Keywords) support

-- Add TDK-specific columns to existing content_plans table
-- All columns are nullable to maintain backward compatibility

-- AI-generated TDK recommendations (JSON)
ALTER TABLE content_plans ADD COLUMN tdk_json TEXT;

-- User-edited TDK (JSON, separate from AI recommendations)
ALTER TABLE content_plans ADD COLUMN user_tdk_json TEXT;

-- Validation results cache (JSON)
ALTER TABLE content_plans ADD COLUMN tdk_validations TEXT;

-- TDK generation timestamp
ALTER TABLE content_plans ADD COLUMN tdk_generated_at TEXT;

-- TDK language used during generation ('en' or 'zh')
ALTER TABLE content_plans ADD COLUMN tdk_language TEXT;

-- Original generation parameters (for reproducibility)
ALTER TABLE content_plans ADD COLUMN tdk_input_json TEXT;

-- Count of times TDK was generated
ALTER TABLE content_plans ADD COLUMN tdk_generation_count INTEGER DEFAULT 0;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_content_plans_tdk_generated_at ON content_plans(tdk_generated_at);
CREATE INDEX IF NOT EXISTS idx_content_plans_tdk_language ON content_plans(tdk_language);

-- Create tdk_generation_history table for audit trail
CREATE TABLE IF NOT EXISTS tdk_generation_history (
  id TEXT PRIMARY KEY,
  content_plan_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  -- Generation input
  topic TEXT NOT NULL,
  keywords TEXT,
  content_snippet TEXT,
  language TEXT NOT NULL,

  -- Generation output
  generated_tdk TEXT NOT NULL,
  total_tokens_used INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,

  -- Metadata
  model_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by TEXT,

  -- Approval tracking
  was_approved INTEGER,
  approved_at TEXT,
  approved_by TEXT
);

-- Create indexes for tdk_generation_history
CREATE INDEX IF NOT EXISTS idx_history_content_plan_id ON tdk_generation_history(content_plan_id);
CREATE INDEX IF NOT EXISTS idx_history_project_id ON tdk_generation_history(project_id);
CREATE INDEX IF NOT EXISTS idx_history_generated_at ON tdk_generation_history(generated_at);
