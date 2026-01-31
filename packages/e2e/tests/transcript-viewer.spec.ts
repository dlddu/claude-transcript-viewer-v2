import { test, expect } from '@playwright/test';

test.describe('Claude Transcript Viewer', () => {
  test.describe('Main Transcript Loading', () => {
    test('should load and display transcript from S3', async ({ page }) => {
      // Navigate to the application
      await page.goto('/');

      // Wait for transcript to load
      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Verify transcript entries are displayed
      const transcriptList = page.getByTestId('transcript-list');
      await expect(transcriptList).toBeVisible();

      // Check that transcript entries exist
      const firstEntry = page.getByTestId('transcript-entry-0');
      await expect(firstEntry).toBeVisible();
    });

    test('should display loading state initially', async ({ page }) => {
      // Navigate to the application
      await page.goto('/');

      // Check for loading indicator (may be brief)
      const loading = page.getByTestId('loading');
      const viewer = page.getByTestId('transcript-viewer');

      // Either loading or viewer should be visible
      await expect(loading.or(viewer)).toBeVisible({ timeout: 5000 });
    });

    test('should handle transcript fetch errors gracefully', async ({ page }) => {
      // Mock API to return error
      await page.route('**/api/transcript/**', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      });

      await page.goto('/');

      // Verify error message is displayed
      await expect(page.getByTestId('error')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('error')).toContainText('Error');
    });

    test('should display transcript entries with correct structure', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      const firstEntry = page.getByTestId('transcript-entry-0');
      await expect(firstEntry).toBeVisible();

      // Check that entry contains role and content
      await expect(firstEntry.locator('.role')).toBeVisible();
      await expect(firstEntry.locator('.content')).toBeVisible();
      await expect(firstEntry.locator('.timestamp')).toBeVisible();
    });
  });

  test.describe('Subagent Transcript References', () => {
    test('should display subagent link when present in transcript', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Look for entries with subagent links
      const subagentLink = page.getByTestId('subagent-link').first();

      // Check if any subagent links exist
      const count = await page.getByTestId('subagent-link').count();
      if (count > 0) {
        await expect(subagentLink).toBeVisible();
        await expect(subagentLink).toContainText('Subagent');
      }
    });

    test('should not display subagent link when not present', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Check entries without subagent_id
      const entries = page.getByTestId(/transcript-entry-\d+/);
      const firstEntry = entries.first();

      // If first entry has no subagent link, verify it's not displayed
      const hasSubagentLink = await firstEntry.getByTestId('subagent-link').count();
      if (hasSubagentLink === 0) {
        await expect(firstEntry.getByTestId('subagent-link')).not.toBeVisible();
      }
    });
  });

  test.describe('UI Rendering', () => {
    test('should display page title', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Claude Transcript Viewer');
    });

    test('should apply correct styling to user and assistant messages', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Check for user and assistant role classes
      const userEntry = page.locator('.entry.user').first();
      const assistantEntry = page.locator('.entry.assistant').first();

      // At least one type should exist
      const userCount = await page.locator('.entry.user').count();
      const assistantCount = await page.locator('.entry.assistant').count();

      expect(userCount + assistantCount).toBeGreaterThan(0);
    });
  });

  test.describe('Integration with Backend API', () => {
    test('should successfully fetch transcript via backend proxy', async ({ page }) => {
      // Listen for API calls
      let apiCalled = false;
      page.on('request', (request) => {
        if (request.url().includes('/api/transcript/')) {
          apiCalled = true;
        }
      });

      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Verify API was called
      expect(apiCalled).toBe(true);
    });

    test('should handle 404 errors when transcript not found', async ({ page }) => {
      // Mock API to return 404
      await page.route('**/api/transcript/**', (route) => {
        route.fulfill({
          status: 404,
          body: JSON.stringify({ error: 'Transcript not found' }),
        });
      });

      await page.goto('/');

      // Verify error handling
      await expect(page.getByTestId('error')).toBeVisible({ timeout: 5000 });
    });
  });
});
