import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from '../useAuth'
import * as authService from '../../auth'

vi.mock('../../auth')
vi.mock('../../api', () => ({
  userAPI: {
    getProfile: vi.fn(() =>
      Promise.resolve({
        data: {
          user: {
            id: '1',
            github_login: 'testuser',
            email: 'test@example.com',
            created_at: '2026-01-01'
          }
        }
      })
    )
  }
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(authService.initAuth as any).mockResolvedValue({
      token: null,
      isAuthenticated: false
    })
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('should handle login', async () => {
    ;(authService.login as any).mockResolvedValue({
      user: {
        id: '1',
        github_login: 'testuser',
        email: 'test@example.com',
        created_at: '2026-01-01'
      }
    })

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.login('test-token')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.github_login).toBe('testuser')
  })

  it('should handle logout', async () => {
    ;(authService.logout as any).mockImplementation(() => {})

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      result.current.logout()
    })

    expect(authService.logout).toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('should catch login errors', async () => {
    ;(authService.login as any).mockRejectedValue(
      new Error('Auth failed')
    )

    const { result } = renderHook(() => useAuth())

    await expect(
      act(async () => {
        await result.current.login('invalid-token')
      })
    ).rejects.toThrow('Auth failed')
  })
})
