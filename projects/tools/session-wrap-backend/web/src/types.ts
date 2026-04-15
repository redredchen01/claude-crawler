/**
 * TypeScript 類型定義 - 與後端 API 對應
 */

// 認證
export interface User {
  id: string
  github_login: string
  email?: string
  created_at: string
  subscription?: {
    subscription_status: 'active' | 'expired'
    verified_at: string
    expires_at: string
  }
}

// 工作區
export interface Workspace {
  id: string
  name: string
  owner_id: string
  is_public: boolean
  created_at: string
  updated_at: string
  roles?: string[]
}

export interface WorkspaceMember {
  id: string
  github_login: string
  email: string
  avatar_url: string | null
  roles: string[]
}

// 分析
export interface AnalyticsDashboard {
  snapshot: {
    id: string
    workspace_id: string
    snapshot_date: string
    total_tasks: number
    completed_tasks: number
    pending_tasks: number
    in_progress_tasks: number
    total_decisions: number
    avg_decision_quality: number
    active_agents: number
    agent_participation: Record<string, number>
  }
  completion_rate: number
  trends: AnalyticsTrend[]
  top_agents: AgentPerformance[]
  period_days: number
  timestamp: string
}

export interface AnalyticsTrend {
  snapshot_date: string
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
  in_progress_tasks: number
  total_decisions: number
  avg_decision_quality: number
  active_agents: number
}

export interface AgentPerformance {
  agent_name: string
  tasks_created: number
  tasks_completed: number
  comments_added: number
  decisions_logged: number
  avg_response_time: number
  error_count: number
  efficiency_score?: number
}

export interface Insight {
  type: 'positive' | 'warning' | 'info'
  message: string
  recommendation: string
}

// 集成
export interface Integration {
  id: string
  service_name: 'slack' | 'github' | 'jira'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface IntegrationEvent {
  id: string
  event_type: string
  status: 'success' | 'failed'
  error_message: string | null
  payload: Record<string, any>
  created_at: string
}

// 角色
export interface Role {
  id: string
  name: string
  description: string
  permissions: Record<string, string[]>
}

export interface UserRole {
  id: string
  user_id: string
  role_id: string
  workspace_id: string
  granted_by: string
  granted_at: string
}

// Session Wraps
export interface SessionWrap {
  id: string
  workspace_name: string
  wrap_date: string
  summary: string
  memory_size: number
  obsidian_files_count: number
  created_at: string
  updated_at: string
}

// 預測和異常檢測 (Phase 10A)
export interface ForecastPoint {
  period: number
  value: number
  lowerBound: number
  upperBound: number
}

export interface ForecastData {
  metricType: string
  historicalDays: number
  forecastHorizon: number
  currentTrend: 'increasing' | 'decreasing'
  trendStrength: number
  predictions: ForecastPoint[]
  confidenceLevel: string
  uncertainty: number
}

export interface Anomaly {
  index: number
  value: number
  expectedValue: number
  deviation: string
  severity: 'critical' | 'high' | 'medium'
  zScore: string
}

export interface AnomalyData {
  totalDataPoints: number
  anomaliesDetected: number
  threshold: number
  anomalies: Anomaly[]
}

export interface ForecastInsight {
  type: 'forecast' | 'anomaly' | 'health'
  message: string
  confidence?: string
  severity?: string
  anomalyCount?: number
  recommendation: string
}
