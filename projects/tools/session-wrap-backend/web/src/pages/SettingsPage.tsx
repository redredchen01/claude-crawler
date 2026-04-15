import { useAuth } from '../hooks'
import { Save } from 'lucide-react'

export const SettingsPage = () => {
  const { user } = useAuth()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-2">Manage your preferences and account settings</p>
      </div>

      {/* User Profile Section */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">GitHub Login</label>
            <input
              type="text"
              value={user?.github_login || ''}
              disabled
              className="input w-full bg-slate-100"
            />
          </div>

          {user?.email && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="input w-full bg-slate-100"
              />
            </div>
          )}

          {user?.subscription && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">
                ✓ Subscription Active
              </p>
              <p className="text-xs text-green-700 mt-1">
                Expires: {new Date(user.subscription.expires_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Preferences Section */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <input type="checkbox" defaultChecked className="mr-2" />
              Email notifications
            </label>
            <p className="text-xs text-slate-600 ml-6">
              Receive email updates for important workspace events
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <input type="checkbox" defaultChecked className="mr-2" />
              Analytics summaries
            </label>
            <p className="text-xs text-slate-600 ml-6">
              Weekly analytics digest to your email
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <input type="checkbox" className="mr-2" />
              Slack notifications
            </label>
            <p className="text-xs text-slate-600 ml-6">
              Send real-time alerts to Slack (requires Slack integration)
            </p>
          </div>
        </div>
      </div>

      {/* Theme Section */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Theme</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="radio" name="theme" defaultChecked />
            <span className="text-sm">Light (default)</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="radio" name="theme" />
            <span className="text-sm">Dark</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="radio" name="theme" />
            <span className="text-sm">System</span>
          </label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button className="btn btn-primary flex items-center gap-2">
          <Save size={18} />
          Save Settings
        </button>
        <button className="btn btn-secondary">Cancel</button>
      </div>
    </div>
  )
}
