import { useState, useEffect, useCallback } from 'react'
import { workspaceAPI, rbacAPI } from '../api'
import * as types from '../types'

interface UseWorkspaceReturn {
  workspaces: types.Workspace[]
  currentWorkspace: types.Workspace | null
  members: types.WorkspaceMember[]
  roles: types.Role[]
  isLoading: boolean
  error: string | null
  setCurrentWorkspace: (workspace: types.Workspace | null) => void
  createWorkspace: (name: string, isPublic: boolean) => Promise<void>
  addMember: (userId: string, roleName: string) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  updateMember: (userId: string, roleName: string) => Promise<void>
}

export const useWorkspace = (): UseWorkspaceReturn => {
  const [workspaces, setWorkspaces] = useState<types.Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<types.Workspace | null>(null)
  const [members, setMembers] = useState<types.WorkspaceMember[]>([])
  const [roles, setRoles] = useState<types.Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch workspaces and roles
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        const [workspacesRes, rolesRes] = await Promise.all([
          workspaceAPI.list(),
          rbacAPI.getRoles()
        ])
        setWorkspaces(workspacesRes.data)
        setRoles(rolesRes.data)

        // Set first workspace as current
        if (workspacesRes.data.length > 0) {
          setCurrentWorkspace(workspacesRes.data[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Fetch members when workspace changes
  useEffect(() => {
    const loadMembers = async () => {
      if (!currentWorkspace) {
        setMembers([])
        return
      }

      try {
        const res = await workspaceAPI.getMembers(currentWorkspace.id)
        setMembers(res.data)
      } catch (err) {
        console.error('Failed to load members:', err)
      }
    }

    loadMembers()
  }, [currentWorkspace])

  const createWorkspace = useCallback(async (name: string, isPublic: boolean) => {
    try {
      const res = await workspaceAPI.create(name, isPublic)
      setWorkspaces([...workspaces, res.data])
    } catch (err) {
      throw err
    }
  }, [workspaces])

  const addMember = useCallback(async (userId: string, roleName: string) => {
    if (!currentWorkspace) throw new Error('No workspace selected')

    try {
      await workspaceAPI.addMember(currentWorkspace.id, userId, roleName)
      // Refresh members
      const res = await workspaceAPI.getMembers(currentWorkspace.id)
      setMembers(res.data)
    } catch (err) {
      throw err
    }
  }, [currentWorkspace])

  const removeMember = useCallback(async (userId: string) => {
    if (!currentWorkspace) throw new Error('No workspace selected')

    try {
      await workspaceAPI.removeMember(currentWorkspace.id, userId)
      setMembers(members.filter(m => m.id !== userId))
    } catch (err) {
      throw err
    }
  }, [currentWorkspace, members])

  const updateMember = useCallback(async (userId: string, roleName: string) => {
    if (!currentWorkspace) throw new Error('No workspace selected')

    try {
      await workspaceAPI.updateMember(currentWorkspace.id, userId, roleName)
      const res = await workspaceAPI.getMembers(currentWorkspace.id)
      setMembers(res.data)
    } catch (err) {
      throw err
    }
  }, [currentWorkspace])

  return {
    workspaces,
    currentWorkspace,
    members,
    roles,
    isLoading,
    error,
    setCurrentWorkspace,
    createWorkspace,
    addMember,
    removeMember,
    updateMember
  }
}
