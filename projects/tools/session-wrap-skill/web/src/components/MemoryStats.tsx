import React from 'react'
import { MemoryStat } from '../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Database } from 'lucide-react'

interface MemoryStatsProps {
  stats: MemoryStat[]
}

const MemoryStats: React.FC<MemoryStatsProps> = ({ stats }) => {
  const totalSize = stats.reduce((sum, s) => sum + s.size_bytes, 0)
  const totalFiles = stats.reduce((sum, s) => sum + s.file_count, 0)

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  // Mock historical data for sparkline (in real app, would come from backend)
  const historicalData = [
    { time: '1d', size: totalSize * 0.8 },
    { time: '2d', size: totalSize * 0.85 },
    { time: '3d', size: totalSize * 0.88 },
    { time: '4d', size: totalSize * 0.92 },
    { time: '5d', size: totalSize * 0.96 },
    { time: '6d', size: totalSize * 0.99 },
    { time: '7d', size: totalSize },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Database className="w-6 h-6 text-blue-600" /> Memory Usage
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Size</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatBytes(totalSize)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {totalFiles} files across {stats.length} categories
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Growth (7 days)</p>
          <p className="text-3xl font-bold text-green-600 mt-2">+{Math.round((totalSize * 0.2) / 1024)} KB</p>
          <p className="text-xs text-gray-500 mt-1">Average ~{Math.round(totalSize * 0.2 / 7 / 1024)} KB/day</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Usage Trend</p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={historicalData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" tickFormatter={(value) => formatBytes(value)} width={80} />
            <Tooltip formatter={(value) => formatBytes(value as number)} />
            <Line
              type="monotone"
              dataKey="size"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Breakdown by Category</p>
        <div className="space-y-3">
          {stats.map((stat) => (
            <div key={stat.category} className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{stat.category}</p>
                <p className="text-xs text-gray-500">{stat.file_count} files</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatBytes(stat.size_bytes)}</p>
                <div className="w-24 h-2 bg-gray-200 rounded mt-1">
                  <div
                    className="h-full bg-blue-600 rounded"
                    style={{ width: `${(stat.size_bytes / totalSize) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MemoryStats
