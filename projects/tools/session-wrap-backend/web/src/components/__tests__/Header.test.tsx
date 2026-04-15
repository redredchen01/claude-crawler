import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/utils'
import { Header } from '../Header'

vi.mock('../../hooks', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      github_login: 'testuser',
      email: 'test@example.com',
      created_at: '2026-01-01'
    },
    logout: vi.fn()
  }),
  useWorkspace: () => ({
    currentWorkspace: {
      id: '1',
      name: 'Test Workspace',
      owner_id: 'user1',
      is_public: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01'
    },
    workspaces: [
      {
        id: '1',
        name: 'Test Workspace',
        owner_id: 'user1',
        is_public: false,
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
      }
    ],
    setCurrentWorkspace: vi.fn()
  })
}))

describe('Header Component', () => {
  it('should render header with title', () => {
    render(<Header title="Test Dashboard" />)

    expect(screen.getByText('Test Dashboard')).toBeInTheDocument()
  })

  it('should display user login name', () => {
    render(<Header />)

    expect(screen.getByText('testuser')).toBeInTheDocument()
  })

  it('should have logout button', () => {
    render(<Header />)

    expect(screen.getByText('Logout')).toBeInTheDocument()
  })

  it('should show workspace selector', () => {
    render(<Header />)

    const select = screen.getByDisplayValue('Test Workspace')
    expect(select).toBeInTheDocument()
  })
})
