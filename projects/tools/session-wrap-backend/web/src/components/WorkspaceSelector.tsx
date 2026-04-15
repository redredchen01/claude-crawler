import { useState } from 'react'
import { useWorkspace } from '../hooks'
import { Plus, Lock, Globe } from 'lucide-react'

export const WorkspaceSelector = () => {
  const { workspaces, currentWorkspace, setCurrentWorkspace, createWorkspace, isLoading } =
    useWorkspace()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', isPublic: false })
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Workspace name is required')
      return
    }

    try {
      setIsCreating(true)
      setError(null)
      await createWorkspace(formData.name, formData.isPublic)
      setFormData({ name: '', isPublic: false })
      setShowCreateForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setIsCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Workspaces</h1>
        <p className="text-slate-600 mt-2">Manage your workspaces and collaboration spaces</p>
      </div>

      {/* Workspaces Grid */}
      <div className="grid grid-cols-3 gap-4">
        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            onClick={() => setCurrentWorkspace(workspace)}
            className={`card cursor-pointer transition-all ${
              currentWorkspace?.id === workspace.id
                ? 'border-blue-500 bg-blue-50'
                : 'hover:border-blue-300'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900">{workspace.name}</h3>
              <div className="text-slate-500">
                {workspace.is_public ? (
                  <Globe size={18} />
                ) : (
                  <Lock size={18} />
                )}
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {workspace.is_public ? 'Public' : 'Private'} workspace
            </p>
            {workspace.roles && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  {workspace.roles.length} role{workspace.roles.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Create New Workspace Card */}
        <button
          onClick={() => setShowCreateForm(true)}
          className="card border-2 border-dashed border-slate-300 hover:border-blue-400 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <Plus size={32} className="text-slate-400" />
          <span className="text-slate-600 font-medium">Create New</span>
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Create Workspace</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Engineering Team"
                  disabled={isCreating}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="cursor-pointer"
                  disabled={isCreating}
                />
                <label htmlFor="isPublic" className="text-sm text-slate-700 cursor-pointer">
                  Make this workspace public
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn btn-primary flex-1"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isCreating}
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
