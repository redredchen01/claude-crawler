import React, { useState, useMemo } from 'react'
import { Decision } from '../types'
import { Lightbulb } from 'lucide-react'
import SearchBar from './SearchBar'
import FilterChips, { Filters } from './FilterChips'

interface DecisionTimelineProps {
  decisions: Decision[]
  agents?: string[]
}

const DecisionTimeline: React.FC<DecisionTimelineProps> = ({ decisions, agents = [] }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({})

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Filter and search decisions
  const filtered = useMemo(() => {
    let result = [...decisions]

    // Search by keyword (topic, decision, reasoning)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.topic.toLowerCase().includes(query) ||
          d.decision.toLowerCase().includes(query) ||
          d.reasoning.toLowerCase().includes(query)
      )
    }

    // Filter by agent
    if (filters.agent) {
      result = result.filter((d) => d.agent === filters.agent)
    }

    // Filter by date range
    if (filters.startDate) {
      const startTime = new Date(filters.startDate).getTime()
      result = result.filter((d) => new Date(d.date).getTime() >= startTime)
    }
    if (filters.endDate) {
      const endTime = new Date(filters.endDate).getTime() + 86400000 // Add 24 hours to include entire day
      result = result.filter((d) => new Date(d.date).getTime() <= endTime)
    }

    // Sort by newest first
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [decisions, searchQuery, filters])

  const uniqueAgents = useMemo(() => {
    const agentSet = new Set(decisions.map((d) => d.agent))
    return Array.from(agentSet).sort()
  }, [decisions])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Lightbulb className="w-6 h-6 text-amber-500" /> Decision Timeline
      </h2>

      {/* Search and Filter Controls */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <SearchBar
          placeholder="Search decisions by topic, decision, or reasoning..."
          onSearch={setSearchQuery}
          debounceMs={300}
        />

        <FilterChips agents={uniqueAgents} onFiltersChange={setFilters} />

        {/* Results Count */}
        <div className="text-xs text-gray-600">
          {filtered.length} decision{filtered.length !== 1 ? 's' : ''} found
          {searchQuery && ` matching "${searchQuery}"`}
          {filters.agent && ` by ${filters.agent}`}
        </div>
      </div>

      {/* Decisions */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">
            {decisions.length === 0 ? 'No decisions recorded yet' : 'No decisions match your search'}
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-300 to-amber-500" />

          <div className="space-y-6 pl-24">
            {filtered.map((decision, idx) => (
              <div key={idx} className="relative">
                <div className="absolute left-[-24px] top-2 w-5 h-5 bg-white border-4 border-amber-500 rounded-full" />

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{decision.topic}</h4>
                      <p className="text-xs text-gray-500">
                        {formatDate(decision.date)} • {decision.agent}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Decision</p>
                      <p className="text-sm text-gray-900 mt-1">{decision.decision}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Reasoning</p>
                      <p className="text-sm text-gray-700 mt-1">{decision.reasoning}</p>
                    </div>

                    {decision.trade_offs && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Trade-offs</p>
                        <p className="text-sm text-gray-600 mt-1">{decision.trade_offs}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DecisionTimeline
