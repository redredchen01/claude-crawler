import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

interface ForecastPoint {
  period: number
  value: number
  lowerBound: number
  upperBound: number
}

interface ForecastData {
  metricType: string
  historicalDays: number
  forecastHorizon: number
  currentTrend: 'increasing' | 'decreasing'
  trendStrength: number
  predictions: ForecastPoint[]
  confidenceLevel: string
  uncertainty: number
}

interface Anomaly {
  index: number
  value: number
  expectedValue: number
  deviation: string
  severity: 'critical' | 'high' | 'medium'
  zScore: string
}

interface AnomalyData {
  totalDataPoints: number
  anomaliesDetected: number
  threshold: number
  anomalies: Anomaly[]
}

interface InsightItem {
  type: 'forecast' | 'anomaly' | 'health'
  message: string
  confidence?: string
  severity?: string
  anomalyCount?: number
  recommendation: string
}

interface InsightData {
  data: InsightItem[]
}

interface UseForecastingReturn {
  forecast: ForecastData | null
  anomalies: AnomalyData | null
  insights: InsightItem[]
  isLoading: boolean
  error: string | null
  metricType: string
  setMetricType: (type: string) => void
  refresh: () => Promise<void>
}

export const useForecasting = (workspaceId: string | null): UseForecastingReturn => {
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null)
  const [insights, setInsights] = useState<InsightItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metricType, setMetricType] = useState('completed_tasks')

  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setForecast(null)
      setAnomalies(null)
      setInsights([])
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

      const [forecastRes, anomaliesRes, insightsRes] = await Promise.all([
        axios.get(`${apiUrl}/api/forecasting/forecast/${workspaceId}`, {
          params: { metricType, days: 30, forecastHorizon: 30 },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${apiUrl}/api/forecasting/anomalies/${workspaceId}`, {
          params: { days: 30, threshold: 2.5 },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${apiUrl}/api/forecasting/insights/${workspaceId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ])

      setForecast(forecastRes.data.data)
      setAnomalies(anomaliesRes.data.data)
      setInsights(insightsRes.data.data)
    } catch (err) {
      console.error('Forecasting error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load forecasting data')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, metricType])

  // Load data when workspace or metricType changes
  useEffect(() => {
    loadData()
  }, [loadData])

  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  return {
    forecast,
    anomalies,
    insights,
    isLoading,
    error,
    metricType,
    setMetricType,
    refresh
  }
}
