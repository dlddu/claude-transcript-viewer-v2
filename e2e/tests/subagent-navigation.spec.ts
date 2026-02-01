import { test, expect } from '@playwright/test';

test.describe('Subagent Navigation', () => {
  // These tests require full navigation implementation (DLD-248+)
  // Skipping for infrastructure setup issue

  test.skip('should navigate to data analyzer subagent', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
  });

  test.skip('should navigate to visualizer subagent', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await page.getByText('Visualization Subagent').click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
  });

  test.skip('should collapse subagent when clicked again', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    const subagentButton = page.getByText('Data Analyzer Subagent');
    await subagentButton.click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
    await subagentButton.click();
    await expect(page.locator('.subagent-expanded')).not.toBeVisible();
  });

  test.skip('should display subagent metadata', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.getByText(/567.*tokens/i)).toBeVisible();
  });

  test.skip('should show visualization results', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await page.getByText('Visualization Subagent').click();
    await expect(page.getByText(/line_chart/i)).toBeVisible();
  });
});
