import { useState, useEffect, useCallback } from 'react'
import * as authService from '../auth'
import { userAPI } from '../api'
import * as types from '../types'

interface UseAuthReturn {
  user: types.User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (claudeToken: string) => Promise<void>
  logout: () => void
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<types.User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      const authState = await authService.initAuth()
      setIsAuthenticated(authState.isAuthenticated)

      if (authState.isAuthenticated) {
        try {
          const response = await userAPI.getProfile()
          setUser(response.data.user)
        } catch (error) {
          console.error('Failed to fetch user profile:', error)
          authService.logout()
          setIsAuthenticated(false)
        }
      }

      setIsLoading(false)
    }

    initAuth()
  }, [])

  const login = useCallback(async (claudeToken: string) => {
    setIsLoading(true)
    try {
      const response = await authService.login(claudeToken)
      setUser(response.user)
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout
  }
}
