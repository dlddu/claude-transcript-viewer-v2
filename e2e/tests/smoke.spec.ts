import { test, expect } from '@playwright/test';

/**
 * Smoke tests - Basic functionality tests to ensure app loads
 * These tests should fail until the implementation is complete (TDD Red Phase)
 */
test.describe('Smoke Tests', () => {
  test('should load the application homepage', async ({ page }) => {
    // Arrange & Act
    await page.goto('/');

    // Assert
    await expect(page).toHaveTitle(/Claude Transcript Viewer/i);
  });

  test('should display main navigation', async ({ page }) => {
    // Arrange & Act
    await page.goto('/');

    // Assert
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should have transcript viewer container', async ({ page }) => {
    // Arrange & Act
    await page.goto('/');

    // Assert
    const viewer = page.locator('[data-testid="transcript-viewer"]');
    await expect(viewer).toBeVisible();
  });

  test('should not have console errors on load', async ({ page }) => {
    // Arrange
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert
    expect(consoleErrors).toHaveLength(0);
  });
});
