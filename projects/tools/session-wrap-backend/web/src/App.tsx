import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks'
import { Sidebar, Header } from './components'
import {
  HomePage,
  DashboardPage,
  WorkspacesPage,
  RolesPage,
  IntegrationsPage,
  SettingsPage
} from './pages'

// 登入頁面
const LoginPage = () => (
  <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-slate-900 mb-2">🎯 Session Wrap</h1>
      <p className="text-slate-600 mb-8">Connecting to auth service...</p>
      <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  </div>
)

interface AppLayoutProps {
  isAuthenticated: boolean
  children: React.ReactNode
}

const AppLayout = ({ isAuthenticated, children }: AppLayoutProps) => {
  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoginPage />
  }

  return (
    <AppLayout isAuthenticated={isAuthenticated}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppLayout>
  )
}
