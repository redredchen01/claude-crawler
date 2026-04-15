import { useState, useEffect } from 'react'
import { useWorkspace } from '../hooks'
import { integrationAPI } from '../api'
import { Trash2, Plus, Check, AlertCircle } from 'lucide-react'

interface Integration {
  id: string
  service_name: 'slack' | 'github' | 'jira'
  is_active: boolean
  created_at: string
  updated_at: string
}

const ServiceConfig = {
  slack: {
    name: 'Slack',
    icon: '💬',
    description: 'Send notifications to Slack channels',
    fields: [
      { name: 'webhook_url', label: 'Webhook URL', type: 'password' },
      { name: 'channel_id', label: 'Channel ID', type: 'text' }
    ]
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    description: 'Sync tasks with GitHub Issues',
    fields: [
      { name: 'api_token', label: 'API Token', type: 'password' },
      { name: 'owner', label: 'Repository Owner', type: 'text' },
      { name: 'repo', label: 'Repository Name', type: 'text' }
    ]
  },
  jira: {
    name: 'Jira',
    icon: '📊',
    description: 'Integrate with Jira projects',
    fields: [
      { name: 'api_token', label: 'API Token', type: 'password' },
      { name: 'host', label: 'Jira Host', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'project_key', label: 'Project Key', type: 'text' }
    ]
  }
}

export const IntegrationManager = () => {
  const { currentWorkspace, isLoading: wsLoading } = useWorkspace()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSetupForm, setShowSetupForm] = useState<'slack' | 'github' | 'jira' | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load integrations
  useEffect(() => {
    if (!currentWorkspace) return

    const loadIntegrations = async () => {
      try {
        setIsLoading(true)
        const res = await integrationAPI.list(currentWorkspace.id)
        setIntegrations(res.data.integrations || [])
      } catch (err) {
        console.error('Failed to load integrations:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadIntegrations()
  }, [currentWorkspace])

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-600">Please select a workspace</p>
      </div>
    )
  }

  if (wsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const handleSetup = async (e: React.FormEvent, service: 'slack' | 'github' | 'jira') => {
    e.preventDefault()

    try {
      setIsSubmitting(true)
      setError(null)

      await integrationAPI.setup(currentWorkspace.id, service, formData)

      // Reload integrations
      const res = await integrationAPI.list(currentWorkspace.id)
      setIntegrations(res.data.integrations || [])

      setShowSetupForm(null)
      setFormData({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup integration')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggle = async (integrationId: string) => {
    try {
      await integrationAPI.toggle(integrationId)
      const res = await integrationAPI.list(currentWorkspace.id)
      setIntegrations(res.data.integrations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle integration')
    }
  }

  const handleDelete = async (integrationId: string) => {
    if (!window.confirm('Are you sure you want to remove this integration?')) return

    try {
      await integrationAPI.delete(integrationId)
      const res = await integrationAPI.list(currentWorkspace.id)
      setIntegrations(res.data.integrations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete integration')
    }
  }

  const handleTestIntegration = async (service: 'slack' | 'github' | 'jira') => {
    try {
      if (service === 'slack') {
        await integrationAPI.testSlack(currentWorkspace.id)
      } else if (service === 'github') {
        await integrationAPI.testGitHub(currentWorkspace.id)
      } else if (service === 'jira') {
        await integrationAPI.testJira(currentWorkspace.id)
      }
      alert('Test successful!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    }
  }

  const getIntegration = (service: 'slack' | 'github' | 'jira') => {
    return integrations.find((i) => i.service_name === service)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-slate-600 mt-2">
          Connect with external tools and services to enhance your workflow
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex gap-2">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-3 gap-6">
        {(Object.entries(ServiceConfig) as [string, any][]).map(([key, config]) => {
          const integration = getIntegration(key as any)
          const isConfigured = !!integration

          return (
            <div key={key} className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-3xl mb-2">{config.icon}</div>
                  <h3 className="text-lg font-semibold text-slate-900">{config.name}</h3>
                  <p className="text-sm text-slate-600 mt-1">{config.description}</p>
                </div>

                {isConfigured && (
                  <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Check size={12} />
                    Connected
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1">
                {isConfigured && (
                  <>
                    <button
                      onClick={() => handleTestIntegration(key as any)}
                      className="btn btn-secondary w-full text-sm"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={() => handleToggle(integration.id)}
                      className={`btn w-full text-sm ${
                        integration.is_active
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                    >
                      {integration.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setShowSetupForm(key as any)
                    setFormData({})
                  }}
                  className="btn btn-primary w-full text-sm flex items-center justify-center gap-2"
                >
                  <Plus size={14} />
                  {isConfigured ? 'Update' : 'Connect'}
                </button>

                {isConfigured && (
                  <button
                    onClick={() => handleDelete(integration.id)}
                    className="btn btn-secondary w-full text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} className="mx-auto" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Setup Form Modal */}
      {showSetupForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Configure {ServiceConfig[showSetupForm].name}
            </h2>

            <form
              onSubmit={(e) => handleSetup(e, showSetupForm)}
              className="space-y-4"
            >
              {ServiceConfig[showSetupForm].fields.map((field: any) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={formData[field.name] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [field.name]: e.target.value })
                    }
                    className="input w-full"
                    placeholder={field.label}
                    disabled={isSubmitting}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSetupForm(null)}
                  disabled={isSubmitting}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
