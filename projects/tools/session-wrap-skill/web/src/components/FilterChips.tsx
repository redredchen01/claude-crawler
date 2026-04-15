import React, { useState } from 'react'
import { Filter, X } from 'lucide-react'

export interface Filters {
  agent?: string
  startDate?: string
  endDate?: string
}

interface FilterChipsProps {
  agents: string[]
  onFiltersChange: (filters: Filters) => void
}

const FilterChips: React.FC<FilterChipsProps> = ({ agents, onFiltersChange }) => {
  const [filters, setFilters] = useState<Filters>({})
  const [showDatePicker, setShowDatePicker] = useState(false)

  const handleAgentChange = (agent: string) => {
    const newFilters = { ...filters }
    if (newFilters.agent === agent) {
      delete newFilters.agent
    } else {
      newFilters.agent = agent
    }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const newFilters = { ...filters, [field]: value }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearFilters = () => {
    setFilters({})
    onFiltersChange({})
  }

  const hasActiveFilters = Object.keys(filters).length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="w-4 h-4" /> Filters
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Agent Filter */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">By Agent</p>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent}
              onClick={() => handleAgentChange(agent)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.agent === agent
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {agent}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Filter */}
      <div>
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="text-xs font-medium text-gray-600 hover:text-gray-700 flex items-center gap-1"
        >
          {showDatePicker ? '▼' : '▶'} Date Range
        </button>

        {showDatePicker && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {filters.agent && (
            <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full text-xs">
              <span className="text-blue-700">Agent: {filters.agent}</span>
              <button
                onClick={() => handleAgentChange(filters.agent!)}
                className="text-blue-400 hover:text-blue-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {(filters.startDate || filters.endDate) && (
            <div className="inline-flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full text-xs">
              <span className="text-green-700">
                {filters.startDate && `From ${filters.startDate}`}
                {filters.startDate && filters.endDate && ' – '}
                {filters.endDate && `To ${filters.endDate}`}
              </span>
              <button
                onClick={() => {
                  setFilters({ ...filters, startDate: undefined, endDate: undefined })
                  onFiltersChange({ ...filters, startDate: undefined, endDate: undefined })
                }}
                className="text-green-400 hover:text-green-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FilterChips
