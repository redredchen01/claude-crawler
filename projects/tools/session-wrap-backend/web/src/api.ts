import axios, { AxiosInstance } from 'axios'
import * as types from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// 創建 Axios 實例
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 請求攔截器 - 添加認證令牌
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 響應攔截器 - 處理錯誤
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// 認證端點
export const authAPI = {
  login: (claudeToken: string) =>
    api.post<{ token: string; user: types.User }>('/api/auth/login', { claudeToken }),
  verify: (token: string) =>
    api.post<{ valid: boolean }>('/api/auth/verify', { token })
}

// 用戶端點
export const userAPI = {
  getProfile: () =>
    api.get<{ user: types.User }>('/api/users/profile'),
  getStorage: () =>
    api.get<any>('/api/users/storage')
}

// 工作區端點
export const workspaceAPI = {
  list: () =>
    api.get<types.Workspace[]>('/api/workspaces'),
  create: (name: string, isPublic: boolean = false) =>
    api.post<types.Workspace>('/api/workspaces', { name, is_public: isPublic }),
  get: (id: string) =>
    api.get<types.Workspace>(`/api/workspaces/${id}`),
  getMembers: (workspaceId: string) =>
    api.get<types.WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`),
  addMember: (workspaceId: string, userId: string, roleName: string) =>
    api.post(`/api/workspaces/${workspaceId}/members`, { user_id: userId, role_name: roleName }),
  updateMember: (workspaceId: string, userId: string, roleName: string) =>
    api.put(`/api/workspaces/${workspaceId}/members/${userId}`, { role_name: roleName }),
  removeMember: (workspaceId: string, userId: string) =>
    api.delete(`/api/workspaces/${workspaceId}/members/${userId}`)
}

// RBAC 端點
export const rbacAPI = {
  getRoles: () =>
    api.get<types.Role[]>('/api/roles'),
  getPermissions: (workspaceId?: string) =>
    api.get(`/api/me/permissions${workspaceId ? `?workspaceId=${workspaceId}` : ''}`),
  checkPermission: (resourceType: string, resourceId: string, permission: string) =>
    api.get(`/api/permissions/check`, {
      params: { resource_type: resourceType, resource_id: resourceId, permission }
    })
}

// 分析端點
export const analyticsAPI = {
  getDashboard: (workspaceId: string, days: number = 30) =>
    api.get<types.AnalyticsDashboard>(`/api/analytics/dashboard/${workspaceId}`, {
      params: { days }
    }),
  getTrends: (workspaceId: string, days: number = 30) =>
    api.get<any>(`/api/analytics/trends/${workspaceId}`, {
      params: { days }
    }),
  getAgents: (workspaceId: string, days: number = 30) =>
    api.get<{ agents: types.AgentPerformance[] }>(`/api/analytics/agents/${workspaceId}`, {
      params: { days }
    }),
  getDecisions: (workspaceId: string, days: number = 30) =>
    api.get<any>(`/api/analytics/decisions/${workspaceId}`, {
      params: { days }
    }),
  getInsights: (workspaceId: string, days: number = 30) =>
    api.get<{ insights: types.Insight[] }>(`/api/analytics/insights/${workspaceId}`, {
      params: { days }
    })
}

// 集成端點
export const integrationAPI = {
  list: (workspaceId: string) =>
    api.get<{ integrations: types.Integration[] }>(`/api/integrations/${workspaceId}`),
  setup: (workspaceId: string, serviceName: string, config: any) =>
    api.post(`/api/integrations/${workspaceId}/setup`, { service_name: serviceName, config }),
  toggle: (integrationId: string) =>
    api.put(`/api/integrations/${integrationId}/toggle`),
  delete: (integrationId: string) =>
    api.delete(`/api/integrations/${integrationId}`),
  getEvents: (integrationId: string) =>
    api.get<{ events: types.IntegrationEvent[] }>(`/api/integrations/${integrationId}/events`),
  testSlack: (workspaceId: string) =>
    api.post(`/api/integrations/${workspaceId}/slack/test`),
  testGitHub: (workspaceId: string) =>
    api.post(`/api/integrations/${workspaceId}/github/test`),
  testJira: (workspaceId: string) =>
    api.post(`/api/integrations/${workspaceId}/jira/test`)
}

// 健康檢查
export const healthAPI = {
  check: () => api.get('/health')
}

export default api
