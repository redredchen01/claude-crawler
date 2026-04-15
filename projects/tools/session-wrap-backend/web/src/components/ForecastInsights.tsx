import { memo } from 'react'
import { Lightbulb, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Insight {
  type: 'forecast' | 'anomaly' | 'health'
  message: string
  confidence?: string
  severity?: string
  anomalyCount?: number
  recommendation: string
}

interface ForecastInsightsProps {
  insights: Insight[]
  isLoading?: boolean
}

const InsightItemComponent = ({ insight }: { insight: Insight }) => {
  const typeConfig = {
    forecast: {
      icon: <TrendingUp size={18} className="text-blue-600" />,
      bg: 'bg-blue-50 border-blue-200',
      title: 'Forecast Insight'
    },
    anomaly: {
      icon: <AlertTriangle size={18} className="text-red-600" />,
      bg: 'bg-red-50 border-red-200',
      title: 'Anomaly Alert'
    },
    health: {
      icon: <CheckCircle2 size={18} className="text-green-600" />,
      bg: 'bg-green-50 border-green-200',
      title: 'Health Status'
    }
  }

  const config = typeConfig[insight.type]

  return (
    <div className={`${config.bg} border rounded-lg p-4`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            {config.title}
            {insight.confidence && (
              <span className="text-xs font-normal text-slate-600 bg-white px-2 py-0.5 rounded">
                {insight.confidence}
              </span>
            )}
            {insight.severity && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  insight.severity === 'high'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {insight.severity.toUpperCase()}
              </span>
            )}
          </h4>
          <p className="text-sm text-slate-700 mt-2">{insight.message}</p>
          <div className="mt-3 p-2 bg-white bg-opacity-60 rounded border border-slate-200">
            <p className="text-xs text-slate-600">
              <span className="font-semibold">Recommendation:</span> {insight.recommendation}
            </p>
          </div>
          {insight.anomalyCount !== undefined && (
            <p className="text-xs text-slate-600 mt-2">
              <span className="font-semibold">{insight.anomalyCount}</span> unresolved anomalies
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const InsightItem = memo(InsightItemComponent)

const ForecastInsightsComponent = ({ insights, isLoading }: ForecastInsightsProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading insights...</div>
      </div>
    )
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="text-center text-slate-600 py-12">
        <Lightbulb size={32} className="mx-auto mb-3 opacity-50" />
        <p>No insights available yet</p>
        <p className="text-sm text-slate-500 mt-1">Run a forecast to generate AI insights</p>
      </div>
    )
  }

  // Separate insights by type
  const forecastInsights = insights.filter((i) => i.type === 'forecast')
  const anomalyInsights = insights.filter((i) => i.type === 'anomaly')
  const healthInsights = insights.filter((i) => i.type === 'health')

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <Lightbulb size={20} className="text-yellow-600" />
        AI Insights & Recommendations
      </h3>

      {forecastInsights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Forecast Analysis</h4>
          <div className="space-y-3">
            {forecastInsights.map((insight, idx) => (
              <InsightItem key={`forecast-${idx}`} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {anomalyInsights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Anomaly Alerts</h4>
          <div className="space-y-3">
            {anomalyInsights.map((insight, idx) => (
              <InsightItem key={`anomaly-${idx}`} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {healthInsights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Workspace Health</h4>
          <div className="space-y-3">
            {healthInsights.map((insight, idx) => (
              <InsightItem key={`health-${idx}`} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {/* Summary Footer */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-slate-700">
          <span className="font-semibold">💡 Tip:</span> Insights are generated from historical
          data patterns, forecast trends, and anomaly analysis. Use these recommendations to
          optimize your workflow and prevent potential issues.
        </p>
      </div>
    </div>
  )
}

export const ForecastInsights = memo(ForecastInsightsComponent)
