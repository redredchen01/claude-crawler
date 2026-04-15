import React, { useState, useEffect, useCallback } from 'react'
import { DashboardState } from './types'
import { apiClient, WsMessage } from './api'
import TaskBoard from './components/TaskBoard'
import DecisionTimeline from './components/DecisionTimeline'
import MemoryStats from './components/MemoryStats'
import SyncStatus from './components/SyncStatus'
import CreateTaskModal from './components/CreateTaskModal'
import { Plus } from 'lucide-react'
import './App.css'

function App() {
  const [state, setState] = useState<DashboardState>({
    tasks: [],
    decisions: [],
    memory: [],
    sync: {
      last_sync: new Date().toISOString(),
      status: 'syncing',
      agent_count: 0,
      active_agents: [],
    },
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'decisions' | 'memory'>('overview')
  const [wsConnected, setWsConnected] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleCreateTask = useCallback(async (taskData: any) => {
    try {
      await apiClient.createTask(taskData)
      // Task will appear via WebSocket update
    } catch (error) {
      console.error('Failed to create task:', error)
      throw error
    }
  }, [])

  const handleUpdateTask = useCallback(async (id: string, updates: any) => {
    try {
      await apiClient.updateTask(id, updates)
      // Update will appear via WebSocket update
    } catch (error) {
      console.error('Failed to update task:', error)
      throw error
    }
  }, [])

  const handleDeleteTask = useCallback(async (id: string) => {
    try {
      await apiClient.deleteTask(id)
      // Delete will appear via WebSocket update
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  }, [])

  // Handle WebSocket messages (real-time updates)
  const handleWsMessage = useCallback((message: WsMessage) => {
    console.log('📨 Received WebSocket message:', message.type)

    setState((prevState) => {
      const newState = { ...prevState }

      // Handle task updates
      if (message.type === 'TaskCreated' || message.type === 'TaskUpdated') {
        const updatedTask = message.data
        newState.tasks = newState.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t))
        if (message.type === 'TaskCreated' && !newState.tasks.find((t) => t.id === updatedTask.id)) {
          newState.tasks.push(updatedTask)
        }
      }

      // Handle task deletion
      if (message.type === 'TaskDeleted') {
        newState.tasks = newState.tasks.filter((t) => t.id !== message.data.id)
      }

      // Handle decision updates
      if (message.type === 'DecisionLogged') {
        newState.decisions.unshift(message.data)
      }

      // Handle sync status updates
      if (message.type === 'SyncStatus') {
        newState.sync = message.data
      }

      // Handle activity events (future)
      if (message.type === 'ActivityEvent') {
        console.log('Activity:', message.data)
      }

      // Update last sync time
      newState.sync = {
        ...newState.sync,
        last_sync: new Date().toISOString(),
      }

      return newState
    })
  }, [])

  useEffect(() => {
    const loadState = async () => {
      setLoading(true)
      try {
        const newState = await apiClient.getDashboardState()
        setState(newState)
      } catch (error) {
        console.error('Failed to load dashboard state:', error)
      } finally {
        setLoading(false)
      }
    }

    // Load initial state
    loadState()

    // Subscribe to WebSocket messages
    const unsubscribeWs = apiClient.subscribeToWebSocket((message) => {
      setWsConnected(true)
      handleWsMessage(message)
    })

    // Fallback to polling if WebSocket unavailable
    let pollInterval: NodeJS.Timeout | null = null

    // Try WebSocket first, but fallback to polling after 3 seconds
    const pollFallback = setTimeout(() => {
      console.log('WebSocket not responding, falling back to polling...')
      setWsConnected(false)

      pollInterval = apiClient.subscribeToUpdates((newState) => {
        setState(newState)
      }, 5000)
    }, 3000)

    return () => {
      clearTimeout(pollFallback)
      if (pollInterval) clearInterval(pollInterval)
      unsubscribeWs()
    }
  }, [handleWsMessage])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Session Wrap Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Multi-agent project coordination & memory management</p>
            </div>
            <div className="flex items-center gap-4">
              {activeTab === 'tasks' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" /> New Task
                </button>
              )}
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  {wsConnected ? '🟢 WebSocket' : state.sync.status === 'synced' ? '✅ Polling' : '⚠️ ' + state.sync.status}
                </p>
                <p className="text-xs text-gray-500 mt-1">Last sync: {new Date(state.sync.last_sync).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-8" role="tablist">
            {(['overview', 'tasks', 'decisions', 'memory'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <SyncStatus status={state.sync} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Tasks</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.tasks.length}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.tasks.filter(t => t.status === 'completed').length} completed
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Decisions Made</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.decisions.length}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.decisions.slice(0, 1)[0]?.date ? 'Latest: ' + new Date(state.decisions[0].date).toLocaleDateString() : 'No decisions yet'}
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Agents Active</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.sync.agent_count}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.sync.active_agents.join(', ') || 'None online'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <TaskBoard
                tasks={state.tasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
              />
            )}

            {/* Decisions Tab */}
            {activeTab === 'decisions' && (
              <DecisionTimeline decisions={state.decisions} agents={state.sync.active_agents} />
            )}

            {/* Memory Tab */}
            {activeTab === 'memory' && <MemoryStats stats={state.memory} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-600">
          <p>🎉 Session Wrap v3.7.0 • WebSocket Sync, Task Editing, Search, Team Collaboration</p>
        </div>
      </footer>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTask}
        agents={state.sync.active_agents}
        isLoading={loading}
      />
    </div>
  )
}

export default App
