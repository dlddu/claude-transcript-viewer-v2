import { test, expect } from '@playwright/test';

/**
 * Transcript Viewer E2E Tests
 * Tests transcript loading and rendering functionality
 * These tests should fail until the implementation is complete (TDD Red Phase)
 */
test.describe('Transcript Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display transcript list', async ({ page }) => {
    // Arrange & Act
    const transcriptList = page.locator('[data-testid="transcript-list"]');

    // Assert
    await expect(transcriptList).toBeVisible();
  });

  test('should load and display main transcript', async ({ page }) => {
    // Arrange
    const transcriptSelector = page.locator('[data-testid="transcript-selector"]');
    const transcriptContent = page.locator('[data-testid="transcript-content"]');

    // Act
    await transcriptSelector.selectOption({ label: 'Main Transcript' });
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(transcriptContent).toBeVisible();
    await expect(transcriptContent).not.toBeEmpty();
  });

  test('should render transcript messages correctly', async ({ page }) => {
    // Arrange
    const transcriptSelector = page.locator('[data-testid="transcript-selector"]');

    // Act
    await transcriptSelector.selectOption({ label: 'Main Transcript' });
    await page.waitForLoadState('networkidle');

    // Assert
    const messages = page.locator('[data-testid^="message-"]');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(0);

    // Verify first message has required elements
    const firstMessage = messages.first();
    await expect(firstMessage).toBeVisible();
    await expect(firstMessage.locator('[data-testid="message-type"]')).toBeVisible();
    await expect(firstMessage.locator('[data-testid="message-content"]')).toBeVisible();
  });

  test('should switch between main and subagent transcripts', async ({ page }) => {
    // Arrange
    const transcriptSelector = page.locator('[data-testid="transcript-selector"]');
    const transcriptTitle = page.locator('[data-testid="transcript-title"]');

    // Act - Load main transcript
    await transcriptSelector.selectOption({ label: 'Main Transcript' });
    await page.waitForLoadState('networkidle');
    const mainTitle = await transcriptTitle.textContent();

    // Act - Switch to subagent transcript
    await transcriptSelector.selectOption({ label: 'Subagent Transcript' });
    await page.waitForLoadState('networkidle');
    const subagentTitle = await transcriptTitle.textContent();

    // Assert
    expect(mainTitle).not.toBe(subagentTitle);
    expect(mainTitle).toContain('Main');
    expect(subagentTitle).toContain('Subagent');
  });

  test('should handle loading errors gracefully', async ({ page }) => {
    // Arrange
    const transcriptSelector = page.locator('[data-testid="transcript-selector"]');

    // Simulate network error by selecting non-existent transcript
    await page.route('**/api/transcripts/invalid*', route => {
      route.abort('failed');
    });

    // Act
    await transcriptSelector.selectOption({ value: 'invalid-transcript' });

    // Assert
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/error|failed/i);
  });

  test('should display loading state while fetching transcript', async ({ page }) => {
    // Arrange
    const transcriptSelector = page.locator('[data-testid="transcript-selector"]');

    // Delay response to capture loading state
    await page.route('**/api/transcripts/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      route.continue();
    });

    // Act
    const loadingPromise = page.locator('[data-testid="loading-indicator"]').waitFor({ state: 'visible' });
    await transcriptSelector.selectOption({ label: 'Main Transcript' });

    // Assert
    await expect(loadingPromise).resolves.toBeUndefined();
  });
});
