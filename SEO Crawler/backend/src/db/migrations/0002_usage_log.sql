-- Migration: Add usage_log table for tracking token usage
-- Date: 2026-04-15

-- Create usage_log table
CREATE TABLE IF NOT EXISTS usage_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd VARCHAR(50) NOT NULL,
  analysis_type VARCHAR(50),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS usage_log_user_id_idx ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS usage_log_recorded_at_idx ON usage_log(recorded_at);

-- Update jobs table: Convert uniqueIndex to regular index for non-unique columns
-- Note: This requires dropping and recreating the indexes
DROP INDEX IF EXISTS jobs_user_id_idx;
DROP INDEX IF EXISTS jobs_status_idx;
DROP INDEX IF EXISTS jobs_created_at_idx;

CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at);

-- Update results table: Convert uniqueIndex to regular index for non-unique columns
DROP INDEX IF EXISTS results_job_id_idx;
DROP INDEX IF EXISTS results_keyword_idx;

CREATE INDEX IF NOT EXISTS results_job_id_idx ON results(job_id);
CREATE INDEX IF NOT EXISTS results_keyword_idx ON results(normalized_keyword);

-- Add unique constraint separately for email/username which should be unique
-- (Already exists in schema, no change needed)
