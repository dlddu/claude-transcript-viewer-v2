import { test, expect } from '@playwright/test';

test.describe('Transcript Viewer E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should display the session ID lookup interface', async ({ page }) => {
    // Assert - basic smoke test for new UI flow
    // After session lookup feature, home page shows session-id-input instead of transcript-viewer
    await expect(page.getByTestId('session-id-input')).toBeVisible();
    await expect(page.getByTestId('session-id-lookup-button')).toBeVisible();
  });

  test('should load and display sample main transcript', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await expect(page.getByText(/Can you help me analyze/i)).toBeVisible();
  });

  test('should display subagent sections', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await expect(page.getByText('Data Analyzer Subagent')).toBeVisible();
  });

  test('should expand subagent transcript when clicked', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.getByText(/Starting data analysis/i)).toBeVisible();
  });

  test('should display metadata and statistics', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await expect(page.getByText(/1234.*tokens/i)).toBeVisible();
  });

  test('should handle missing transcript gracefully', async ({ page }) => {
    await page.goto('/transcript/non-existent');
    await expect(page.getByText(/transcript not found/i)).toBeVisible();
  });

  test('should display tools used in transcript', async ({ page }) => {
    await page.goto('/transcript/transcript-20260201-001');
    await expect(page.getByText(/file_reader/i)).toBeVisible();
  });
});
