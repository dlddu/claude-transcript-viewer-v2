import { test, expect } from '@playwright/test';

test.describe('Subagent Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    // Wait for transcript to load
    await expect(page.getByText('Data Analyzer Subagent')).toBeVisible();
  });

  test('should navigate to data analyzer subagent', async ({ page }) => {
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
  });

  test('should navigate to visualizer subagent', async ({ page }) => {
    await page.getByText('Visualization Subagent').click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
  });

  test('should collapse subagent when clicked again', async ({ page }) => {
    const subagentButton = page.getByText('Data Analyzer Subagent');
    await subagentButton.click();
    await expect(page.locator('.subagent-expanded')).toBeVisible();
    await subagentButton.click();
    await expect(page.locator('.subagent-expanded')).not.toBeVisible();
  });

  test('should display subagent metadata', async ({ page }) => {
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.getByText(/456.*tokens/i)).toBeVisible();
  });

  test('should show visualization results', async ({ page }) => {
    await page.getByText('Visualization Subagent').click();
    await expect(page.getByText(/Creating visualizations/i)).toBeVisible();
  });
});
