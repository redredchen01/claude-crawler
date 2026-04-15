import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_URL: 'http://localhost:3000',
    VITE_JWT_STORAGE_KEY: 'auth_token',
    VITE_ENV: 'test'
  }
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
global.localStorage = localStorageMock as any

// Mock window.location.href
delete (window as any).location
window.location = { href: '' } as any

// Suppress console errors in tests
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn()
}
