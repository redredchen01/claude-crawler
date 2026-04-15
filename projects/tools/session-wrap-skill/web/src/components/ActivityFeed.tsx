import React, { useState, useEffect } from 'react'
import { MessageCircle, CheckCircle, Plus, User, Clock } from 'lucide-react'

export interface ActivityEvent {
  id: string
  type: 'task-created' | 'task-completed' | 'decision-logged' | 'task-commented' | 'agent-joined'
  agent: string
  timestamp: string
  data: {
    taskId?: string
    taskTitle?: string
    decisionTopic?: string
    comment?: string
  }
}

interface ActivityFeedProps {
  events: ActivityEvent[]
  onTaskClick?: (taskId: string) => void
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, onTaskClick }) => {
  const [displayEvents, setDisplayEvents] = useState<ActivityEvent[]>([])

  useEffect(() => {
    setDisplayEvents(
      events
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20) // Show latest 20 events
    )
  }, [events])

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'task-created':
        return <Plus className="w-4 h-4 text-blue-600" />
      case 'task-completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'decision-logged':
        return <MessageCircle className="w-4 h-4 text-amber-600" />
      case 'task-commented':
        return <MessageCircle className="w-4 h-4 text-purple-600" />
      case 'agent-joined':
        return <User className="w-4 h-4 text-teal-600" />
      default:
        return <Clock className="w-4 h-4 text-gray-600" />
    }
  }

  const getEventMessage = (event: ActivityEvent) => {
    switch (event.type) {
      case 'task-created':
        return `created task "${event.data.taskTitle}"`
      case 'task-completed':
        return `completed task "${event.data.taskTitle}"`
      case 'decision-logged':
        return `logged decision: "${event.data.decisionTopic}"`
      case 'task-commented':
        return `commented on task "${event.data.taskTitle}"`
      case 'agent-joined':
        return 'joined the project'
      default:
        return 'activity event'
    }
  }

  if (displayEvents.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {displayEvents.map((event) => (
        <div
          key={event.id}
          className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">{getEventIcon(event.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-sm">
                  <span className="font-semibold text-gray-900">{event.agent}</span>{' '}
                  <span className="text-gray-700">{getEventMessage(event)}</span>
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1">{formatTime(event.timestamp)}</p>
            </div>
            {event.data.taskId && onTaskClick && (
              <button
                onClick={() => onTaskClick(event.data.taskId!)}
                className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
              >
                View
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default ActivityFeed
