import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/utils'
import { Sidebar } from '../Sidebar'

describe('Sidebar Component', () => {
  it('should render sidebar logo', () => {
    render(<Sidebar />)

    expect(screen.getByText(/Session Wrap/i)).toBeInTheDocument()
  })

  it('should render navigation items', () => {
    render(<Sidebar />)

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByText('Roles & Members')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('should have correct navigation links', () => {
    render(<Sidebar />)

    const homeLink = screen.getByRole('link', { name: /Home/i })
    expect(homeLink).toHaveAttribute('href', '/')

    const dashboardLink = screen.getByRole('link', { name: /Analytics/i })
    expect(dashboardLink).toHaveAttribute('href', '/dashboard')
  })

  it('should display version', () => {
    render(<Sidebar />)

    expect(screen.getByText('v3.9.0')).toBeInTheDocument()
  })
})
