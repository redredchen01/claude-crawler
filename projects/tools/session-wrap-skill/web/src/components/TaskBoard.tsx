import React, { useState } from 'react'
import { Task } from '../types'
import { CheckCircle2, Circle, Clock, Edit2, Trash2, Save, X } from 'lucide-react'

interface TaskBoardProps {
  tasks: Task[]
  onUpdateTask?: (id: string, updates: Partial<Task>) => Promise<void>
  onDeleteTask?: (id: string) => Promise<void>
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onUpdateTask, onDeleteTask }) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Task>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const pending = tasks.filter(t => t.status === 'pending')
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const completed = tasks.filter(t => t.status === 'completed')

  const startEdit = (task: Task) => {
    setEditingId(task.id)
    setEditForm({
      description: task.description,
      status: task.status,
      assigned_to: task.assigned_to,
    })
  }

  const handleSave = async (taskId: string) => {
    if (onUpdateTask) {
      try {
        await onUpdateTask(taskId, editForm)
        setEditingId(null)
        setEditForm({})
      } catch (error) {
        console.error('Failed to update task:', error)
      }
    }
  }

  const handleDelete = async (taskId: string) => {
    if (onDeleteTask) {
      try {
        setDeletingId(taskId)
        await onDeleteTask(taskId)
      } catch (error) {
        console.error('Failed to delete task:', error)
        setDeletingId(null)
      }
    }
  }

  const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
    const isEditing = editingId === task.id

    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
        {isEditing ? (
          // Edit mode
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Status</label>
              <select
                value={editForm.status || 'pending'}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Task['status'] })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Description</label>
              <textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSave(task.id)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
              >
                <Save className="w-4 h-4" /> Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          // View mode
          <>
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-sm text-gray-900 flex-1">{task.id}</h4>
              <div className="flex gap-1">
                {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {task.status === 'in_progress' && <Clock className="w-5 h-5 text-blue-600" />}
                {task.status === 'pending' && <Circle className="w-5 h-5 text-gray-400" />}
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-2">{task.description}</p>

            {task.assigned_to && (
              <p className="text-xs text-blue-600 font-medium mb-1">👤 {task.assigned_to}</p>
            )}

            {task.depends_on.length > 0 && (
              <p className="text-xs text-gray-500 mb-3">depends: {task.depends_on.join(', ')}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => startEdit(task)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => handleDelete(task.id)}
                disabled={deletingId === task.id}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Circle className="w-5 h-5 text-gray-400" /> Pending ({pending.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pending.length > 0 ? pending.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No pending tasks</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" /> In Progress ({inProgress.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {inProgress.length > 0 ? inProgress.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No tasks in progress</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" /> Completed ({completed.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {completed.length > 0 ? completed.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No completed tasks yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskBoard
