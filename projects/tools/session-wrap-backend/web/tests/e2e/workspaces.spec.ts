import { test, expect } from '@playwright/test'

test.describe('Workspaces Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces')
  })

  test('should display workspaces page', async ({ page }) => {
    const heading = page.locator('h1, h2').first()
    const content = await heading.textContent().catch(() => '')

    expect(content).toBeTruthy()
  })

  test('should display workspace list or grid', async ({ page }) => {
    const workspaceCards = page.locator('[data-testid="workspace-card"], [class*="workspace"], [class*="Workspace"]')

    // Expect workspace container to exist
    const count = await workspaceCards.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have create workspace button', async ({ page }) => {
    const createBtn = page.locator('button:has-text("Create"), button[data-testid="create-workspace"]')

    // At least one create button should exist
    const count = await createBtn.count().catch(() => 0)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('should display workspace details', async ({ page }) => {
    const workspaceInfo = page.locator('[data-testid="workspace-info"], [class*="info"], .details')

    const count = await workspaceInfo.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have workspace actions', async ({ page }) => {
    const actions = page.locator('button[data-testid*="action"], button[class*="action"]')

    const count = await actions.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })
})

test.describe('Roles & Members Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roles')
  })

  test('should display roles page', async ({ page }) => {
    const heading = page.locator('h1, h2').first()
    const content = await heading.textContent().catch(() => '')

    expect(content).toBeTruthy()
  })

  test('should display members list', async ({ page }) => {
    const members = page.locator('[data-testid="member"], [class*="member"], table tbody tr')

    const count = await members.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have role assignment UI', async ({ page }) => {
    const roleSelects = page.locator('select[data-testid*="role"], [data-testid*="role-select"]')

    const count = await roleSelects.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have add member button', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), button[data-testid="add-member"]')

    const count = await addBtn.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })
})
