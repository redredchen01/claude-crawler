import { memo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  BarChart3,
  Folder,
  Shield,
  Zap,
  Settings
} from 'lucide-react'

const navigationItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/dashboard', label: 'Analytics', icon: BarChart3 },
  { path: '/workspaces', label: 'Workspaces', icon: Folder },
  { path: '/roles', label: 'Roles & Members', icon: Shield },
  { path: '/integrations', label: 'Integrations', icon: Zap },
  { path: '/settings', label: 'Settings', icon: Settings }
]

const SidebarComponent = () => {
  const location = useLocation()

  return (
    <aside className="w-64 bg-slate-900 text-white p-4 border-r border-slate-800 flex flex-col h-screen">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-blue-400">🎯</span> Session Wrap
        </h1>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1">
        {navigationItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 pt-4 text-xs text-slate-400">
        <p>v3.10.0</p>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
