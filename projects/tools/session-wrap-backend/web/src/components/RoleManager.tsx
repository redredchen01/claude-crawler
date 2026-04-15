import { useState } from 'react'
import { useWorkspace } from '../hooks'
import { Trash2, Edit2, Plus } from 'lucide-react'

export const RoleManager = () => {
  const { currentWorkspace, members, roles, addMember, removeMember, updateMember, isLoading } =
    useWorkspace()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ userId: '', roleName: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-600">Please select a workspace</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.userId || !formData.roleName) {
      setError('Please fill in all fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await addMember(formData.userId, formData.roleName)
      setFormData({ userId: '', roleName: '' })
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      setError(null)
      await updateMember(memberId, newRole)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return

    try {
      setError(null)
      await removeMember(memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles & Members</h1>
          <p className="text-slate-600 mt-2">Manage workspace members and their permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Add Member
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Members Table */}
      <div className="card">
        {members.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No members yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Login</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Email</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Role</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {member.avatar_url && (
                          <img
                            src={member.avatar_url}
                            alt={member.github_login}
                            className="w-8 h-8 rounded-full"
                          />
                        )}
                        <span className="font-medium text-slate-900">
                          {member.github_login}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{member.email}</td>
                    <td className="py-3 px-4">
                      {editingId === member.id ? (
                        <select
                          value={member.roles[0] || ''}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                          className="input text-sm"
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.name}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge-success">{member.roles[0] || 'N/A'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            setEditingId(editingId === member.id ? null : member.id)
                          }
                          className="text-blue-600 hover:text-blue-700 p-2"
                          title="Edit role"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-red-600 hover:text-red-700 p-2"
                          title="Remove member"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Add Member</h2>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  User ID
                </label>
                <input
                  type="text"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="input w-full"
                  placeholder="GitHub user ID"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <select
                  value={formData.roleName}
                  onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
                  className="input w-full"
                  disabled={isSubmitting}
                >
                  <option value="">Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                  {isSubmitting ? 'Adding...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
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
