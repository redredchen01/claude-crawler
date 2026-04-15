import axios, { AxiosInstance } from 'axios'
import type { Task, Decision, MemoryStat, SyncStatus, DashboardState } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws'

export interface WsMessage {
  type: 'TaskCreated' | 'TaskUpdated' | 'TaskDeleted' | 'DecisionLogged' | 'CommentAdded' | 'ActivityEvent' | 'SyncStatus'
  data: any
  timestamp: string
  agent: string
}

class APIClient {
  private client: AxiosInstance
  private wsCallbacks: Array<(message: WsMessage) => void> = []

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    try {
      const res = await this.client.get('/tasks')
      return res.data.tasks || []
    } catch {
      console.error('Failed to fetch tasks')
      return []
    }
  }

  async createTask(task: Omit<Task, 'created_at' | 'completed_at'>): Promise<Task | null> {
    try {
      const res = await this.client.post('/tasks', task)
      return res.data.task || null
    } catch (error) {
      console.error('Failed to create task:', error)
      return null
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    try {
      await this.client.patch(`/tasks/${id}`, updates)
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await this.client.delete(`/tasks/${id}`)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  // Comments
  async addComment(taskId: string, content: string, mentions: string[] = []): Promise<any> {
    try {
      const res = await this.client.post(`/tasks/${taskId}/comments`, {
        content,
        mentions,
      })
      return res.data.comment || null
    } catch (error) {
      console.error('Failed to add comment:', error)
      return null
    }
  }

  async getComments(taskId: string): Promise<any[]> {
    try {
      const res = await this.client.get(`/tasks/${taskId}/comments`)
      return res.data.comments || []
    } catch (error) {
      console.error('Failed to fetch comments:', error)
      return []
    }
  }

  async deleteComment(taskId: string, commentId: string): Promise<void> {
    try {
      await this.client.delete(`/tasks/${taskId}/comments/${commentId}`)
    } catch (error) {
      console.error('Failed to delete comment:', error)
    }
  }

  // Decisions
  async getDecisions(filters?: { q?: string; agent?: string; start_date?: string; end_date?: string }): Promise<Decision[]> {
    try {
      const res = await this.client.get('/decisions', { params: filters })
      return res.data.decisions || []
    } catch {
      console.error('Failed to fetch decisions')
      return []
    }
  }

  // Memory stats
  async getMemoryStats(): Promise<MemoryStat[]> {
    try {
      const res = await this.client.get('/memory/stats')
      return res.data.stats || []
    } catch {
      console.error('Failed to fetch memory stats')
      return []
    }
  }

  // Sync status
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const res = await this.client.get('/sync/status')
      return res.data.status || { last_sync: '', status: 'error', agent_count: 0, active_agents: [] }
    } catch {
      console.error('Failed to fetch sync status')
      return { last_sync: '', status: 'error', agent_count: 0, active_agents: [] }
    }
  }

  // Full dashboard state
  async getDashboardState(): Promise<DashboardState> {
    const [tasks, decisions, memory, sync] = await Promise.all([
      this.getTasks(),
      this.getDecisions(),
      this.getMemoryStats(),
      this.getSyncStatus(),
    ])

    return { tasks, decisions, memory, sync }
  }

  // Subscribe to WebSocket updates
  subscribeToWebSocket(callback: (message: WsMessage) => void): () => void {
    this.wsCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      this.wsCallbacks = this.wsCallbacks.filter(cb => cb !== callback)
    }
  }

  // Emit WebSocket messages to all subscribers
  private emitWsMessage(message: WsMessage) {
    this.wsCallbacks.forEach(callback => {
      try {
        callback(message)
      } catch (error) {
        console.error('Error in WebSocket callback:', error)
      }
    })
  }

  // Initialize WebSocket connection
  initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          console.log('✓ WebSocket connected')
          resolve()
        }

        ws.onmessage = (event) => {
          try {
            const message: WsMessage = JSON.parse(event.data)
            this.emitWsMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(new Error('WebSocket connection failed'))
        }

        ws.onclose = () => {
          console.log('WebSocket disconnected, falling back to polling')
          // Attempt reconnect
          setTimeout(() => this.initWebSocket(), 5000)
        }
      } catch (error) {
        console.error('Failed to establish WebSocket:', error)
        reject(error)
      }
    })
  }

  // Legacy polling fallback (for when WebSocket is unavailable)
  subscribeToUpdates(callback: (state: DashboardState) => void, interval = 5000) {
    const poll = async () => {
      const state = await this.getDashboardState()
      callback(state)
    }

    poll()
    return setInterval(poll, interval)
  }
}

export const apiClient = new APIClient()

// Try to connect WebSocket on init, but don't block if it fails
apiClient.initWebSocket().catch(() => {
  console.warn('WebSocket unavailable, polling will be used as fallback')
})
