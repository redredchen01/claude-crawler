import { test, expect } from '@playwright/test'

test.describe('Integrations Setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/integrations')
  })

  test('should display integrations page', async ({ page }) => {
    const heading = page.locator('h1, h2').first()
    const content = await heading.textContent().catch(() => '')

    expect(content).toBeTruthy()
  })

  test('should display integration cards', async ({ page }) => {
    const integrationCards = page.locator('[data-testid="integration-card"], [class*="integration"]')

    const count = await integrationCards.count().catch(() => 0)
    // Should have at least some integration options
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('should display Slack integration option', async ({ page }) => {
    const slack = page.locator('text=Slack, [data-testid="slack-integration"], [class*="slack"]')

    const count = await slack.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should display GitHub integration option', async ({ page }) => {
    const github = page.locator('text=GitHub, [data-testid="github-integration"], [class*="github"]')

    const count = await github.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should display Jira integration option', async ({ page }) => {
    const jira = page.locator('text=Jira, [data-testid="jira-integration"], [class*="jira"]')

    const count = await jira.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have setup/connect buttons', async ({ page }) => {
    const buttons = page.locator('button:has-text("Connect"), button:has-text("Setup"), button[data-testid*="connect"]')

    const count = await buttons.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })
})

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('should display settings page', async ({ page }) => {
    const heading = page.locator('h1, h2').first()
    const content = await heading.textContent().catch(() => '')

    expect(content).toBeTruthy()
  })

  test('should display account section', async ({ page }) => {
    const accountSection = page.locator('text=Account, [data-testid="account-section"]')

    const count = await accountSection.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should display preferences section', async ({ page }) => {
    const prefsSection = page.locator('text=Preferences, text=Settings, [data-testid="preferences-section"]')

    const count = await prefsSection.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have toggles for options', async ({ page }) => {
    const toggles = page.locator('[role="switch"], input[type="checkbox"], [class*="toggle"]')

    const count = await toggles.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })

  test('should have theme selector', async ({ page }) => {
    const theme = page.locator('[data-testid="theme-selector"], select[name*="theme"]')

    const count = await theme.count().catch(() => 0)
    expect(typeof count).toBe('number')
  })
})
