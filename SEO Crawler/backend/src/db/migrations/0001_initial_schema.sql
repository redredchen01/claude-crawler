-- Initial Schema Migration for SEO Crawler

-- ============== Create Users Table ==============
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- ============== Create API Keys Table ==============
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);

-- ============== Create Jobs Table ==============
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed VARCHAR(500) NOT NULL,
  sources VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting',
  result_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  metadata JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at);

-- ============== Create Results Table ==============
CREATE TABLE IF NOT EXISTS results (
  id VARCHAR(100) PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  normalized_keyword VARCHAR(500) NOT NULL,
  raw_keyword VARCHAR(500) NOT NULL,
  source VARCHAR(50) NOT NULL,
  intent VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  roi_score INTEGER NOT NULL,
  search_volume INTEGER,
  trend_direction VARCHAR(20),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS results_job_id_idx ON results(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS results_keyword_idx ON results(normalized_keyword);

-- ============== Create Webhooks Table ==============
CREATE TABLE IF NOT EXISTS webhooks (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  events VARCHAR(500) NOT NULL,
  filters JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhooks_user_id_idx ON webhooks(user_id);

-- ============== Create Webhook Attempts Table ==============
CREATE TABLE IF NOT EXISTS webhook_attempts (
  id SERIAL PRIMARY KEY,
  webhook_id VARCHAR(100) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_attempts_webhook_id_idx ON webhook_attempts(webhook_id);

-- ============== Create Analysis Cache Table ==============
CREATE TABLE IF NOT EXISTS analysis_cache (
  id VARCHAR(100) PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  token_estimate INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_cache_job_id_idx ON analysis_cache(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS analysis_cache_type_idx ON analysis_cache(analysis_type);

-- ============== Create Audit Log Table ==============
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);

-- ============== Create Default Admin User ==============
INSERT INTO users (username, email, password_hash, role, is_active)
VALUES ('admin', 'admin@seo-crawler.local', '$2b$10$placeholder', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- ============== End of Migration ==============
