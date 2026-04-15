import { authAPI } from './api'

const TOKEN_KEY = import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token'

export interface AuthState {
  token: string | null
  isAuthenticated: boolean
}

/**
 * 使用 Claude Code token 登入
 */
export const login = async (claudeToken: string) => {
  const response = await authAPI.login(claudeToken)
  const { token } = response.data

  // 保存 token
  localStorage.setItem(TOKEN_KEY, token)

  return response.data
}

/**
 * 驗證 token 是否有效
 */
export const verifyToken = async (token: string): Promise<boolean> => {
  try {
    const response = await authAPI.verify(token)
    return response.data.valid
  } catch {
    return false
  }
}

/**
 * 取得已保存的 token
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 檢查用戶是否已認證
 */
export const isAuthenticated = (): boolean => {
  return getAuthToken() !== null
}

/**
 * 登出
 */
export const logout = () => {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * 初始化認證狀態
 */
export const initAuth = async (): Promise<AuthState> => {
  const token = getAuthToken()

  if (!token) {
    return { token: null, isAuthenticated: false }
  }

  const isValid = await verifyToken(token)

  if (!isValid) {
    logout()
    return { token: null, isAuthenticated: false }
  }

  return { token, isAuthenticated: true }
}
