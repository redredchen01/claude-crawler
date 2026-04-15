import React, { useState, useRef } from 'react'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionsChange: (mentions: string[]) => void
  agents: string[]
  placeholder?: string
  className?: string
}

const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  onMentionsChange,
  agents,
  placeholder,
  className,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [mentionStart, setMentionStart] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Extract mentions from text
  const extractMentions = (text: string): string[] => {
    const regex = /@(\w+)/g
    const matches: string[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      const mention = match[1]
      if (agents.includes(mention)) {
        matches.push(mention)
      }
    }
    return [...new Set(matches)]
  }

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)

    // Update mentions
    onMentionsChange(extractMentions(newValue))

    // Check for @ trigger
    const cursorPos = e.target.selectionStart
    const textBefore = newValue.substring(0, cursorPos)
    const lastAtIndex = textBefore.lastIndexOf('@')

    if (lastAtIndex !== -1 && (lastAtIndex === 0 || /\s/.test(textBefore[lastAtIndex - 1]))) {
      const mentionText = textBefore.substring(lastAtIndex + 1).toLowerCase()
      const filtered = agents.filter((agent) => agent.toLowerCase().startsWith(mentionText) && agent !== mentionText)

      if (filtered.length > 0) {
        setSuggestions(filtered)
        setMentionStart(lastAtIndex + 1)
        setShowSuggestions(true)
        setSelectedSuggestion(0)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  // Handle suggestion selection
  const selectSuggestion = (agent: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0
    const textBefore = value.substring(0, mentionStart - 1)
    const textAfter = value.substring(cursorPos)
    const newValue = `${textBefore}@${agent} ${textAfter}`

    onChange(newValue)
    onMentionsChange(extractMentions(newValue))
    setShowSuggestions(false)

    // Move cursor after mention
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = mentionStart + agent.length + 1
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        inputRef.current.focus()
      }
    }, 0)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestion((prev) => (prev + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestion((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        selectSuggestion(suggestions[selectedSuggestion])
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        break
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        rows={3}
      />

      {/* Mention Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 w-48">
          {suggestions.map((agent, idx) => (
            <button
              key={agent}
              onClick={() => selectSuggestion(agent)}
              onMouseEnter={() => setSelectedSuggestion(idx)}
              className={`w-full px-3 py-2 text-left text-sm ${
                idx === selectedSuggestion ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-900'
              }`}
            >
              @{agent}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default MentionInput
