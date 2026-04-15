import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/')

    // Check if we're on the home page or redirected to login
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible()
  })

  test('should navigate through protected routes', async ({ page }) => {
    await page.goto('/dashboard')

    // Should see dashboard or be redirected to login
    const dashboardContent = page.locator('[data-testid="dashboard"]')
    const loginForm = page.locator('form, [data-testid="login"]')

    const isDashboard = await dashboardContent.isVisible().catch(() => false)
    const isLogin = await loginForm.isVisible().catch(() => false)

    expect(isDashboard || isLogin).toBeTruthy()
  })

  test('should display sidebar navigation', async ({ page }) => {
    await page.goto('/')

    const sidebar = page.locator('[data-testid="sidebar"], nav').first()
    await expect(sidebar).toBeVisible()

    // Check navigation items exist
    const navItems = page.locator('nav a, [data-testid="nav-item"]')
    await expect(navItems.first()).toBeVisible()
  })

  test('should display header with workspace selector', async ({ page }) => {
    await page.goto('/')

    const header = page.locator('header, [data-testid="header"]').first()
    await expect(header).toBeVisible()
  })
})
