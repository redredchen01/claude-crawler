import { memo, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { AnalyticsTrend } from '../types'

interface TrendChartProps {
  data: AnalyticsTrend[]
}

const TrendChartComponent = ({ data }: TrendChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-slate-500">No trend data available</p>
      </div>
    )
  }

  // Memoize chart data transformation
  const chartData = useMemo(() =>
    data.map((item) => ({
      date: new Date(item.snapshot_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
      completed: item.completed_tasks,
      pending: item.pending_tasks,
      inProgress: item.in_progress_tasks,
      decisions: item.total_decisions,
      quality: (item.avg_decision_quality * 100).toFixed(0) // Scale to 0-100 for visibility
    })), [data])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" stroke="#64748b" />
        <YAxis stroke="#64748b" />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem'
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="completed"
          stroke="#10b981"
          strokeWidth={2}
          name="Completed"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="inProgress"
          stroke="#3b82f6"
          strokeWidth={2}
          name="In Progress"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="pending"
          stroke="#f59e0b"
          strokeWidth={2}
          name="Pending"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="quality"
          stroke="#8b5cf6"
          strokeWidth={2}
          name="Decision Quality (%)"
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export const TrendChart = memo(TrendChartComponent)
