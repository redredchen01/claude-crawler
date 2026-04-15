import { test, expect } from "@playwright/test";

test.describe("Prompt Optimizer E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page before each test
    await page.goto("/");
  });

  test("TC-1: Load demo instantly without API call", async ({ page }) => {
    // Click "Load Demo" button
    const demoButton = page.getByRole("button", { name: /load demo/i });
    await demoButton.click();

    // Verify demo data loads instantly (< 500ms)
    const startTime = Date.now();
    await page.waitForSelector("text=Write code", { timeout: 500 });
    const loadTime = Date.now() - startTime;

    // Verify raw score displays
    await expect(page.locator("text=Raw Score:")).toBeVisible();
    await expect(page.locator("text=/Total.*35/i")).toBeVisible();

    // Verify optimized score displays with improvement
    await expect(page.locator("text=Optimized Score:")).toBeVisible();
    await expect(page.locator("text=/Total.*82/i")).toBeVisible();

    // Verify load time is acceptable
    expect(loadTime).toBeLessThan(500);
  });

  test("TC-2: Score a simple prompt", async ({ page }) => {
    // Assume demo is loaded or manually input prompt
    const promptInput = page.locator('textarea[name="raw_prompt"]');

    // Clear and enter new prompt
    await promptInput.fill("Write a function to calculate factorial");

    // Click Score button
    const scoreButton = page.getByRole("button", { name: /score/i });
    await scoreButton.click();

    // Wait for loading spinner to disappear
    await page.waitForSelector('[role="status"]', { state: "hidden" });

    // Verify score displays
    await expect(page.locator("text=Score:")).toBeVisible();

    // Verify dimensions are shown
    const dimensions = [
      "Specificity",
      "Context",
      "Output Spec",
      "Runnability",
      "Evaluation",
      "Safety",
    ];
    for (const dim of dimensions) {
      await expect(page.locator(`text=${dim}`)).toBeVisible();
    }

    // Verify missing slots identified
    await expect(page.locator("text=/Missing.*Slot/i")).toBeVisible();
  });

  test("TC-3: Full optimization pipeline", async ({ page }) => {
    // Use demo data (should be auto-loaded or use Load Demo)
    const optimizeButton = page.getByRole("button", {
      name: /optimize/i,
    });

    // Click Optimize
    await optimizeButton.click();

    // Wait for loading
    await page.waitForSelector('[role="status"]', {
      state: "hidden",
      timeout: 15000,
    });

    // Verify optimized prompt shows
    await expect(page.locator("text=/Optimized Prompt/i")).toBeVisible();

    // Verify explanation visible
    await expect(page.locator("text=/Explanation/i")).toBeVisible();

    // Verify score improvement shows
    await expect(page.locator("text=/Score.*Improvement/i")).toBeVisible();

    // Verify copy button works
    const copyButton = page.getByRole("button", { name: /copy/i });
    await copyButton.click();
    // Note: actual clipboard verification requires special setup
  });

  test("TC-4: Error handling - empty prompt", async ({ page }) => {
    const promptInput = page.locator('textarea[name="raw_prompt"]');
    const scoreButton = page.getByRole("button", { name: /score/i });

    // Clear input to leave empty
    await promptInput.fill("");

    // Try to score
    await scoreButton.click();

    // Should show error message
    await expect(page.locator("text=/error|empty|required/i")).toBeVisible();
  });

  test("TC-5: Error handling - API failure gracefully", async ({ page }) => {
    // Simulate API failure by intercepting response
    await page.route("**/api/score", (route) => {
      route.abort("failed");
    });

    const promptInput = page.locator('textarea[name="raw_prompt"]');
    const scoreButton = page.getByRole("button", { name: /score/i });

    await promptInput.fill("Test prompt");
    await scoreButton.click();

    // Should show error message without crashing
    await expect(page.locator("text=/error|failed|try again/i")).toBeVisible();

    // Page should remain functional
    await expect(scoreButton).toBeEnabled();
  });

  test("TC-6: Responsive design - mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate and load demo
    const demoButton = page.getByRole("button", { name: /load demo/i });
    await demoButton.click();

    // Wait for content
    await page.waitForSelector("text=Score", { timeout: 5000 });

    // Verify buttons are still clickable
    const scoreButton = page.getByRole("button", {
      name: /score/i,
    });
    await expect(scoreButton).toBeInViewport();
    await expect(scoreButton).toBeEnabled();

    // Verify text is readable (not cut off)
    const mainContent = page.locator("main");
    const boundingBox = await mainContent.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(375 + 10); // Allow small margin
  });

  test("TC-7: Responsive design - tablet viewport", async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    const demoButton = page.getByRole("button", { name: /load demo/i });
    await demoButton.click();

    await page.waitForSelector("text=Score", { timeout: 5000 });

    // Verify layout works on tablet
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();

    // Verify buttons aligned properly
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("TC-8: Navigation and page refresh", async ({ page }) => {
    // Load demo
    const demoButton = page.getByRole("button", { name: /load demo/i });
    await demoButton.click();

    await page.waitForSelector("text=Score", { timeout: 5000 });

    // Refresh page
    await page.reload();

    // Page should still be functional
    await expect(demoButton).toBeVisible();
  });

  test("TC-9: Multiple sequential operations", async ({ page }) => {
    // Load demo
    const demoButton = page.getByRole("button", { name: /load demo/i });
    await demoButton.click();

    await page.waitForSelector("text=Score", { timeout: 5000 });

    // Change prompt
    const promptInput = page.locator('textarea[name="raw_prompt"]');
    await promptInput.fill("New test prompt");

    // Score it
    const scoreButton = page.getByRole("button", { name: /score/i });
    await scoreButton.click();

    await page.waitForSelector('[role="status"]', {
      state: "hidden",
      timeout: 10000,
    });

    // Verify new score displayed
    await expect(page.locator("text=/Score:/i")).toBeVisible();

    // Change again and score again
    await promptInput.fill("Another prompt");
    await scoreButton.click();

    await page.waitForSelector('[role="status"]', {
      state: "hidden",
      timeout: 10000,
    });

    // Should show new score
    await expect(page.locator("text=/Score:/i")).toBeVisible();
  });

  test("TC-10: Long prompt handling", async ({ page }) => {
    const promptInput = page.locator('textarea[name="raw_prompt"]');

    // Create a long prompt (but under 50K limit)
    const longPrompt =
      "Write code that " +
      "implements a machine learning algorithm ".repeat(50);

    await promptInput.fill(longPrompt);

    const scoreButton = page.getByRole("button", { name: /score/i });
    await scoreButton.click();

    // Should process without error
    await page.waitForSelector('[role="status"]', {
      state: "hidden",
      timeout: 10000,
    });

    await expect(page.locator("text=/Score:/i")).toBeVisible();
  });
});
