import { memo, useMemo } from 'react'
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface ForecastPoint {
  period: number
  value: number
  lowerBound: number
  upperBound: number
}

interface ForecastChartProps {
  predictions: ForecastPoint[]
  metricType: string
  trend: 'increasing' | 'decreasing'
  trendStrength: number
  confidence: string
}

const ForecastChartComponent = ({
  predictions,
  metricType,
  trend,
  trendStrength,
  confidence
}: ForecastChartProps) => {
  const chartData = useMemo(() => {
    return predictions.map((p, idx) => ({
      period: `Day ${p.period}`,
      value: Math.round(p.value),
      upper: Math.round(p.upperBound),
      lower: Math.round(Math.max(0, p.lowerBound))
    }))
  }, [predictions])

  const metricLabel = metricType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {metricLabel} Forecast
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Trend: <span className={trend === 'increasing' ? 'text-green-600' : 'text-red-600'}>
              {trend === 'increasing' ? '↑' : '↓'} {metricLabel} ({trendStrength.toFixed(2)})
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">Confidence</p>
          <p className="text-2xl font-bold text-blue-600">{confidence}</p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem'
            }}
            formatter={(value: number) => [value.toLocaleString(), 'Forecast']}
          />
          <Legend />

          {/* Confidence Bounds */}
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="#8884d8"
            fillOpacity={0.1}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#fff"
            fillOpacity={1}
            isAnimationActive={false}
          />

          {/* Forecast Line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8884d8"
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Forecast"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className="text-slate-600">Predicted Value</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-200 rounded"></div>
          <span className="text-slate-600">95% Confidence Bounds</span>
        </div>
        <div className="text-slate-600">
          <span className="font-medium">{predictions.length}</span> periods
        </div>
      </div>
    </div>
  )
}

export const ForecastChart = memo(ForecastChartComponent)
