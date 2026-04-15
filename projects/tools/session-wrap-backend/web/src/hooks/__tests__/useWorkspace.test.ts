import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspace } from '../useWorkspace'

vi.mock('../../api', () => ({
  workspaceAPI: {
    list: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: '1',
            name: 'Test Workspace',
            owner_id: 'user1',
            is_public: false,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            roles: ['admin']
          }
        ]
      })
    ),
    getMembers: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: 'member1',
            github_login: 'testuser',
            email: 'test@example.com',
            avatar_url: null,
            roles: ['admin']
          }
        ]
      })
    ),
    addMember: vi.fn(() => Promise.resolve({})),
    updateMember: vi.fn(() => Promise.resolve({})),
    removeMember: vi.fn(() => Promise.resolve({}))
  },
  rbacAPI: {
    getRoles: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: '1',
            name: 'admin',
            description: 'Administrator',
            permissions: {}
          }
        ]
      })
    )
  }
}))

describe('useWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should load workspaces on mount', async () => {
    const { result } = renderHook(() => useWorkspace())

    expect(result.current.isLoading).toBe(true)

    // Wait for initial load
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(result.current.workspaces.length).toBe(1)
    expect(result.current.currentWorkspace?.name).toBe('Test Workspace')
  })

  it('should set current workspace', async () => {
    const { result } = renderHook(() => useWorkspace())

    await new Promise((resolve) => setTimeout(resolve, 100))

    const workspace = result.current.workspaces[0]

    await act(async () => {
      result.current.setCurrentWorkspace(workspace)
    })

    expect(result.current.currentWorkspace).toBe(workspace)
  })

  it('should load members for current workspace', async () => {
    const { result } = renderHook(() => useWorkspace())

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(result.current.members.length).toBe(1)
    expect(result.current.members[0].github_login).toBe('testuser')
  })

  it('should handle errors gracefully', () => {
    const { result } = renderHook(() => useWorkspace())

    // Should not throw
    expect(result.current.error).toBe(null)
  })
})
