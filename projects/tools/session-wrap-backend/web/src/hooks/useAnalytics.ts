import { useState, useEffect, useCallback } from 'react'
import { analyticsAPI } from '../api'
import * as types from '../types'

interface UseAnalyticsReturn {
  dashboard: types.AnalyticsDashboard | null
  insights: types.Insight[]
  trends: types.AnalyticsTrend[]
  agents: types.AgentPerformance[]
  isLoading: boolean
  error: string | null
  days: number
  setDays: (days: number) => void
  refresh: () => Promise<void>
}

export const useAnalytics = (workspaceId: string | null): UseAnalyticsReturn => {
  const [dashboard, setDashboard] = useState<types.AnalyticsDashboard | null>(null)
  const [insights, setInsights] = useState<types.Insight[]>([])
  const [trends, setTrends] = useState<types.AnalyticsTrend[]>([])
  const [agents, setAgents] = useState<types.AgentPerformance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setDashboard(null)
      setInsights([])
      setTrends([])
      setAgents([])
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const [dashboardRes, insightsRes, agentsRes] = await Promise.all([
        analyticsAPI.getDashboard(workspaceId, days),
        analyticsAPI.getInsights(workspaceId, days),
        analyticsAPI.getAgents(workspaceId, days)
      ])

      setDashboard(dashboardRes.data)
      setInsights(insightsRes.data.insights)
      setAgents(agentsRes.data.agents)
      setTrends(dashboardRes.data.trends)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, days])

  // Load data when workspace or days changes
  useEffect(() => {
    loadData()
  }, [loadData])

  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  return {
    dashboard,
    insights,
    trends,
    agents,
    isLoading,
    error,
    days,
    setDays,
    refresh
  }
}
