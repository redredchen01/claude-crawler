import { memo } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface Anomaly {
  index: number
  value: number
  expectedValue: number
  deviation: string
  severity: 'critical' | 'high' | 'medium'
  zScore: string
}

interface AnomalyViewerProps {
  anomalies: Anomaly[]
  totalDataPoints: number
  threshold: number
}

const AnomalyRowComponent = ({ anomaly }: { anomaly: Anomaly }) => {
  const severityMap = {
    critical: {
      icon: <AlertTriangle size={16} className="text-red-600" />,
      bg: 'bg-red-50 border-red-200',
      badge: 'bg-red-100 text-red-800'
    },
    high: {
      icon: <AlertCircle size={16} className="text-yellow-600" />,
      bg: 'bg-yellow-50 border-yellow-200',
      badge: 'bg-yellow-100 text-yellow-800'
    },
    medium: {
      icon: <Info size={16} className="text-blue-600" />,
      bg: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-100 text-blue-800'
    }
  }

  const config = severityMap[anomaly.severity]

  return (
    <div className={`${config.bg} border rounded-lg p-4 flex items-start gap-3`}>
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-slate-900">
              Day {anomaly.index + 1}: {anomaly.value} (expected: {anomaly.expectedValue})
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Deviation: <span className="font-semibold">{anomaly.deviation}</span>
              {' • Z-score: '}
              <span className="font-semibold">{anomaly.zScore}</span>
            </p>
          </div>
          <span className={`${config.badge} text-xs font-semibold px-2 py-1 rounded`}>
            {anomaly.severity.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

const AnomalyRow = memo(AnomalyRowComponent)

const AnomalyViewerComponent = ({
  anomalies,
  totalDataPoints,
  threshold
}: AnomalyViewerProps) => {
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length
  const highCount = anomalies.filter((a) => a.severity === 'high').length
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Anomaly Detection ({anomalies.length} / {totalDataPoints} data points)
        </h3>

        {anomalies.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-800 font-medium">✓ No anomalies detected</p>
            <p className="text-sm text-green-700 mt-1">
              All metrics are performing normally (Z-score threshold: {threshold})
            </p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{anomalies.length}</p>
                <p className="text-xs text-slate-600 mt-1">Total Anomalies</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
                <p className="text-xs text-red-700 mt-1">Critical</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-600">{highCount}</p>
                <p className="text-xs text-yellow-700 mt-1">High</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{mediumCount}</p>
                <p className="text-xs text-blue-700 mt-1">Medium</p>
              </div>
            </div>

            {/* Anomalies List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {anomalies.map((anomaly) => (
                <AnomalyRow key={`anomaly-${anomaly.index}`} anomaly={anomaly} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Configuration Info */}
      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
        <p>
          <span className="font-medium">Detection Method:</span> Z-score threshold at {threshold}σ
        </p>
        <p className="mt-1">
          <span className="font-medium">Classification:</span> Critical (Z &gt; 4σ) • High (3-4σ) •
          Medium (2.5-3σ)
        </p>
      </div>
    </div>
  )
}

export const AnomalyViewer = memo(AnomalyViewerComponent)
