import { test, expect } from '@playwright/test';

/**
 * E2E Test: Transcript Viewer Basic Functionality
 *
 * This test verifies that the transcript viewer can:
 * 1. Load transcript data from LocalStack S3
 * 2. Display main transcript timeline
 * 3. Display subagent transcript events
 */

test.describe('Transcript Viewer', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the transcript viewer
    await page.goto('/');
  });

  test('should load and display transcript timeline from S3', async ({ page }) => {
    // Arrange: Fixture data is already uploaded to LocalStack S3 by setup

    // Act: Load a specific transcript
    const transcriptId = 'sample-main-transcript';
    await page.goto(`/transcript/${transcriptId}`);

    // Assert: Timeline should be visible
    const timeline = page.locator('[data-testid="transcript-timeline"]');
    await expect(timeline).toBeVisible();

    // Assert: Main transcript events should be displayed
    const mainEvents = page.locator('[data-testid="main-event"]');
    await expect(mainEvents).toHaveCount(await mainEvents.count(), { timeout: 5000 });
    expect(await mainEvents.count()).toBeGreaterThan(0);
  });

  test('should display subagent events in timeline', async ({ page }) => {
    // Arrange
    const transcriptId = 'sample-main-transcript';
    await page.goto(`/transcript/${transcriptId}`);

    // Act: Wait for timeline to load
    await page.waitForSelector('[data-testid="transcript-timeline"]');

    // Assert: Subagent events should be displayed
    const subagentEvents = page.locator('[data-testid="subagent-event"]');
    await expect(subagentEvents.first()).toBeVisible({ timeout: 5000 });
    expect(await subagentEvents.count()).toBeGreaterThan(0);
  });

  test('should expand subagent transcript when clicked', async ({ page }) => {
    // Arrange
    const transcriptId = 'sample-main-transcript';
    await page.goto(`/transcript/${transcriptId}`);
    await page.waitForSelector('[data-testid="subagent-event"]');

    // Act: Click on the first subagent event
    const firstSubagentEvent = page.locator('[data-testid="subagent-event"]').first();
    await firstSubagentEvent.click();

    // Assert: Subagent details should be visible
    const subagentDetails = page.locator('[data-testid="subagent-details"]');
    await expect(subagentDetails).toBeVisible();
  });

  test('should load transcript data from backend API', async ({ page }) => {
    // Arrange: Setup API response interceptor
    const transcriptId = 'sample-main-transcript';

    // Act: Navigate and trigger API call
    const responsePromise = page.waitForResponse(
      response => response.url().includes(`/api/transcript/${transcriptId}`) && response.status() === 200
    );
    await page.goto(`/transcript/${transcriptId}`);
    const response = await responsePromise;

    // Assert: Response should contain transcript data
    const data = await response.json();
    expect(data).toBeDefined();
    expect(data).toHaveProperty('events');
    expect(Array.isArray(data.events)).toBe(true);
  });

  test('should handle missing transcript gracefully', async ({ page }) => {
    // Act: Try to load non-existent transcript
    await page.goto('/transcript/non-existent-transcript');

    // Assert: Error message should be displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Transcript not found');
  });

  test('should display loading state while fetching data', async ({ page }) => {
    // Arrange: Slow down network to observe loading state
    await page.route('**/api/transcript/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });

    // Act
    const transcriptId = 'sample-main-transcript';
    await page.goto(`/transcript/${transcriptId}`);

    // Assert: Loading indicator should be visible initially
    const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
    await expect(loadingIndicator).toBeVisible();
  });
});
