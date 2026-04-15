import { memo } from 'react'
import { AgentPerformance } from '../types'
import { TrendingUp } from 'lucide-react'

interface AgentLeaderboardProps {
  agents: AgentPerformance[]
}

const AgentLeaderboardComponent = ({ agents }: AgentLeaderboardProps) => {
  if (!agents || agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">No agent data available</p>
      </div>
    )
  }

  // Sort by efficiency score
  const sorted = [...agents].sort(
    (a, b) => (b.efficiency_score || 0) - (a.efficiency_score || 0)
  )

  const getMedalEmoji = (index: number) => {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return '·'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 font-semibold text-slate-700">#</th>
            <th className="text-left py-3 px-4 font-semibold text-slate-700">Agent</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-700">Tasks Created</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-700">Completed</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-700">Comments</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-700">Avg Response Time</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-700">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((agent, index) => (
            <tr
              key={agent.agent_name}
              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <td className="py-3 px-4">
                <span className="text-lg">{getMedalEmoji(index)}</span>
              </td>
              <td className="py-3 px-4 font-medium text-slate-900">
                {agent.agent_name}
              </td>
              <td className="py-3 px-4 text-center text-slate-600">
                {agent.tasks_created}
              </td>
              <td className="py-3 px-4 text-center text-slate-600">
                {agent.tasks_completed}
              </td>
              <td className="py-3 px-4 text-center text-slate-600">
                {agent.comments_added}
              </td>
              <td className="py-3 px-4 text-center text-slate-600">
                {agent.avg_response_time}ms
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp size={14} className="text-green-600" />
                  <span className="font-semibold text-slate-900">
                    {(agent.efficiency_score || 0).toFixed(1)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const AgentLeaderboard = memo(AgentLeaderboardComponent)
