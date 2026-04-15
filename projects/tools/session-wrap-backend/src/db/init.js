const pool = require('../config/database');

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id VARCHAR(255) UNIQUE,
  github_login VARCHAR(255) UNIQUE,
  email VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Claude Code subscriptions
CREATE TABLE IF NOT EXISTS claude_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  claude_token VARCHAR(1000) NOT NULL,
  subscription_status VARCHAR(50) DEFAULT 'active',
  verified_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session wraps storage
CREATE TABLE IF NOT EXISTS session_wraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_name VARCHAR(255),
  wrap_date TIMESTAMP,
  summary TEXT,
  memory_size BIGINT,
  obsidian_files_count INTEGER,
  metadata JSONB,
  s3_path VARCHAR(1000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API tokens for CLI auth
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  name VARCHAR(255),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces (Phase 8A - RBAC)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles (Phase 8A - RBAC)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Roles (Phase 8A - RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id, workspace_id)
);

-- Resource Permissions (Phase 8A - RBAC)
CREATE TABLE IF NOT EXISTS resource_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(50),
  resource_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission VARCHAR(50),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type, resource_id, user_id, permission)
);

-- Analytics Snapshots (Phase 8B)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_tasks INT DEFAULT 0,
  completed_tasks INT DEFAULT 0,
  pending_tasks INT DEFAULT 0,
  in_progress_tasks INT DEFAULT 0,
  avg_completion_time INTERVAL,
  total_decisions INT DEFAULT 0,
  avg_decision_quality NUMERIC(3,2),
  active_agents INT DEFAULT 0,
  agent_participation JSONB DEFAULT '{}',
  memory_usage JSONB DEFAULT '{}',
  PRIMARY KEY(workspace_id, snapshot_date)
);

-- Decision Analytics (Phase 8B)
CREATE TABLE IF NOT EXISTS decision_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_id VARCHAR(255),
  agent VARCHAR(100),
  sentiment_score NUMERIC(3,2),
  complexity_score NUMERIC(3,2),
  reasoning_quality NUMERIC(3,2),
  follow_up_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Performance (Phase 8B)
CREATE TABLE IF NOT EXISTS agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name VARCHAR(100),
  date DATE,
  tasks_created INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  comments_added INT DEFAULT 0,
  decisions_logged INT DEFAULT 0,
  response_time_ms INT,
  error_count INT DEFAULT 0,
  UNIQUE(workspace_id, agent_name, date)
);

-- Integrations (Phase 8C)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_name VARCHAR(50),
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, service_name)
);

-- Integration Events (Phase 8C)
CREATE TABLE IF NOT EXISTS integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  event_type VARCHAR(50),
  status VARCHAR(20),
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Forecasts (Phase 10A)
CREATE TABLE IF NOT EXISTS analytics_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  forecast_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  forecast_horizon INT DEFAULT 30,
  metric_type VARCHAR(50),
  predicted_value NUMERIC(10,2),
  confidence_score NUMERIC(3,2),
  lower_bound NUMERIC(10,2),
  upper_bound NUMERIC(10,2),
  actual_value NUMERIC(10,2),
  error_percentage NUMERIC(5,2),
  model_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(workspace_id, forecast_date, metric_type)
);

-- Anomaly Detections (Phase 10A)
CREATE TABLE IF NOT EXISTS anomaly_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  anomaly_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metric_type VARCHAR(50),
  metric_value NUMERIC(10,2),
  expected_value NUMERIC(10,2),
  deviation_percentage NUMERIC(5,2),
  severity VARCHAR(20),
  description TEXT,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Forecast Feedback (Phase 10A)
CREATE TABLE IF NOT EXISTS forecast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES analytics_forecasts(id) ON DELETE CASCADE,
  is_accurate BOOLEAN,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wraps_user_id ON session_wraps(user_id);
CREATE INDEX IF NOT EXISTS idx_wraps_created_at ON session_wraps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON claude_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token ON api_tokens(token);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_workspace ON user_roles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_resource_perms_resource ON resource_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_analytics_workspace ON analytics_snapshots(workspace_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_decision_analytics_workspace ON decision_analytics(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_perf_workspace ON agent_performance(workspace_id, agent_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_workspace ON integration_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_forecasts_workspace ON analytics_forecasts(workspace_id, forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_forecasts_metric ON analytics_forecasts(workspace_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_workspace ON anomaly_detections(workspace_id, anomaly_date DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_severity ON anomaly_detections(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_forecast_feedback_forecast ON forecast_feedback(forecast_id);
`;

async function initDB() {
  try {
    console.log('🔄 Creating schema...');
    await pool.query(schema);
    console.log('✅ Schema created/verified');
  } catch (error) {
    console.error('❌ Database init error:', error);
    throw error;
  }
}

module.exports = { initDB, pool };
