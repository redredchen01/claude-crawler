import { useSearchParams } from 'react-router-dom'
import { AnalyticsDashboard } from '../components'

export const DashboardPage = () => {
  const [searchParams] = useSearchParams()
  const workspaceId = searchParams.get('workspace')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <AnalyticsDashboard workspaceId={workspaceId} />
    </div>
  )
}
