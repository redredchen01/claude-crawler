import React, { useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import MentionInput from './MentionInput'

export interface Comment {
  id: string
  author: string
  content: string
  timestamp: string
  mentions: string[]
}

interface CommentsSectionProps {
  comments: Comment[]
  agents: string[]
  currentAgent: string
  onAddComment: (content: string, mentions: string[]) => Promise<void>
  onDeleteComment?: (id: string) => Promise<void>
  isLoading?: boolean
}

const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  agents,
  currentAgent,
  onAddComment,
  onDeleteComment,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!inputValue.trim()) return

    setSubmitting(true)
    try {
      await onAddComment(inputValue, mentions)
      setInputValue('')
      setMentions([])
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!onDeleteComment) return

    setDeleting(id)
    try {
      await onDeleteComment(id)
    } catch (error) {
      console.error('Failed to delete comment:', error)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="font-semibold text-sm text-gray-900">Comments ({comments.length})</h4>

      {/* Comment List */}
      {comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{comment.author}</p>
                  <p className="text-xs text-gray-500">{formatTime(comment.timestamp)}</p>
                </div>
                {comment.author === currentAgent && onDeleteComment && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    disabled={deleting === comment.id}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
              {comment.mentions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {comment.mentions.map((mention) => (
                    <span key={mention} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      @{mention}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No comments yet</p>
      )}

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <MentionInput
          value={inputValue}
          onChange={setInputValue}
          onMentionsChange={setMentions}
          agents={agents}
          placeholder="Add a comment... (use @ to mention)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setInputValue('')
              setMentions([])
            }}
            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
            disabled={submitting}
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={!inputValue.trim() || submitting || isLoading}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
          >
            <Send className="w-4 h-4" /> {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CommentsSection
