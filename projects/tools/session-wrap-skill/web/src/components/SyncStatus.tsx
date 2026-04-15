import React, { useState, useEffect } from 'react'
import { SyncStatus as SyncStatusType } from '../types'
import { Cloud, AlertCircle, Check } from 'lucide-react'

interface SyncStatusProps {
  status: SyncStatusType
}

const SyncStatus: React.FC<SyncStatusProps> = ({ status }) => {
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (status.status === 'syncing') {
      const interval = setInterval(() => setPulse(p => !p), 1000)
      return () => clearInterval(interval)
    }
  }, [status.status])

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }

  const statusConfig = {
    synced: {
      icon: Check,
      label: 'Synced',
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
    syncing: {
      icon: Cloud,
      label: 'Syncing...',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    error: {
      icon: AlertCircle,
      label: 'Sync Error',
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
  }

  const config = statusConfig[status.status]
  const Icon = config.icon

  return (
    <div className={`${config.bg} border ${config.border} rounded-lg p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Cloud className="w-6 h-6 text-blue-600" /> Sync Status
        </h2>
        <div className="flex items-center gap-2">
          <Icon className={`w-6 h-6 ${config.color} ${status.status === 'syncing' && pulse ? 'opacity-50' : ''}`} />
          <span className={`font-semibold ${config.color}`}>{config.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Last Sync</p>
          <p className="text-lg font-semibold text-gray-900 mt-2">{formatTime(status.last_sync)}</p>
          <p className="text-xs text-gray-500 mt-1">{new Date(status.last_sync).toLocaleTimeString()}</p>
        </div>

        <div className="bg-white p-4 rounded border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Active Agents</p>
          <p className="text-lg font-semibold text-gray-900 mt-2">{status.agent_count}</p>
          <p className="text-xs text-gray-500 mt-1">{status.active_agents.length} online</p>
        </div>
      </div>

      {status.active_agents.length > 0 && (
        <div className="bg-white p-4 rounded border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Active Agents</p>
          <div className="flex flex-wrap gap-2">
            {status.active_agents.map((agent) => (
              <div key={agent} className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                <div className="w-2 h-2 bg-green-600 rounded-full" />
                {agent}
              </div>
            ))}
          </div>
        </div>
      )}

      {status.status === 'error' && (
        <div className="bg-red-100 border border-red-300 rounded p-3">
          <p className="text-sm text-red-800 font-medium">
            ⚠️ Sync connection failed. Check backend status and try refreshing.
          </p>
        </div>
      )}
    </div>
  )
}

export default SyncStatus
