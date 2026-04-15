import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../hooks'
import { BarChart3, Users, Zap, ArrowRight } from 'lucide-react'

export const HomePage = () => {
  const navigate = useNavigate()
  const { currentWorkspace } = useWorkspace()

  const features = [
    {
      icon: BarChart3,
      title: 'Analytics Dashboard',
      description: 'Track task completion, decision quality, and agent performance in real-time.',
      color: 'blue',
      href: '/dashboard'
    },
    {
      icon: Users,
      title: 'Workspace Management',
      description: 'Manage team members and control access with role-based permissions.',
      color: 'green',
      href: '/workspaces'
    },
    {
      icon: Zap,
      title: 'Integrations',
      description: 'Connect with Slack, GitHub, and Jira to enhance your workflow.',
      color: 'yellow',
      href: '/integrations'
    }
  ]

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Hero Section */}
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Welcome to Session Wrap
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl">
            Empower your team with real-time analytics, collaboration tools, and seamless integrations.
          </p>
        </div>

        {/* Quick Stats */}
        {currentWorkspace && (
          <div className="grid grid-cols-3 gap-4 mb-12">
            <div className="card">
              <p className="text-sm text-slate-600">Current Workspace</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{currentWorkspace.name}</p>
              <p className="text-xs text-slate-500 mt-2">
                {currentWorkspace.is_public ? '🌍 Public' : '🔒 Private'}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600">Member Access</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {currentWorkspace.roles?.length || 0}
              </p>
              <p className="text-xs text-slate-500 mt-2">roles configured</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600">Features</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">6+</p>
              <p className="text-xs text-slate-500 mt-2">available modules</p>
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Core Features</h2>
          <div className="grid grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description, color, href }) => (
              <button
                key={href}
                onClick={() => navigate(href)}
                className={`card border-2 transition-all hover:shadow-lg cursor-pointer ${
                  colorClasses[color as keyof typeof colorClasses]
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <Icon size={32} />
                  <ArrowRight size={18} className="opacity-0 group-hover:opacity-100" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 text-left mb-2">
                  {title}
                </h3>
                <p className="text-sm text-slate-600 text-left">
                  {description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/workspaces')}
              className="btn btn-primary text-left"
            >
              🏢 Create Workspace
            </button>
            <button
              onClick={() => navigate('/roles')}
              className="btn btn-secondary text-left"
            >
              👥 Manage Members
            </button>
            <button
              onClick={() => navigate('/integrations')}
              className="btn btn-secondary text-left"
            >
              ⚡ Setup Integrations
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="btn btn-secondary text-left"
            >
              ⚙️ Adjust Settings
            </button>
          </div>
        </div>

        {/* Getting Started Tips */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Getting Started</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              <span className="font-semibold">1. Create a Workspace</span> — Start by creating a workspace for your team
            </li>
            <li>
              <span className="font-semibold">2. Add Members</span> — Invite team members and assign roles
            </li>
            <li>
              <span className="font-semibold">3. Setup Integrations</span> — Connect with Slack, GitHub, or Jira
            </li>
            <li>
              <span className="font-semibold">4. Monitor Analytics</span> — Track progress and performance
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
