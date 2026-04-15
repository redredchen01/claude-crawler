export interface Task {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  assigned_to: string | null
  depends_on: string[]
  created_at: string
  completed_at?: string
}

export interface Decision {
  id: string
  date: string
  agent: string
  topic: string
  decision: string
  reasoning: string
  trade_offs?: string
}

export interface MemoryStat {
  category: string
  size_bytes: number
  file_count: number
}

export interface SyncStatus {
  last_sync: string
  status: 'synced' | 'syncing' | 'error'
  agent_count: number
  active_agents: string[]
}

export interface DashboardState {
  tasks: Task[]
  decisions: Decision[]
  memory: MemoryStat[]
  sync: SyncStatus
}
