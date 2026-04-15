import { memo } from 'react'
import { useAuth, useWorkspace } from '../hooks'
import { LogOut, User } from 'lucide-react'

interface HeaderProps {
  title?: string
}

const HeaderComponent = ({ title = 'Dashboard' }: HeaderProps) => {
  const { user, logout } = useAuth()
  const { currentWorkspace, workspaces, setCurrentWorkspace } = useWorkspace()

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

          {/* Workspace Selector */}
          <select
            value={currentWorkspace?.id || ''}
            onChange={(e) => {
              const workspace = workspaces.find(w => w.id === e.target.value)
              setCurrentWorkspace(workspace || null)
            }}
            className="input text-sm"
          >
            <option value="" disabled>
              Select workspace...
            </option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <User size={16} />
            <span>{user?.github_login}</span>
          </div>

          <button
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
            className="btn btn-secondary btn-sm flex items-center gap-2"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

export const Header = memo(HeaderComponent)
