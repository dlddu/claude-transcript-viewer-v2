import { test, expect } from '@playwright/test';

// Does not assert the tab count, so adding the Sessions tab (SL-AC2) leaves it unaffected.

test.describe('Lookup Tabs (LK-AC1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display "Message UUID" tab and "Session ID" tab on main page', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Message UUID' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Session ID' })).toBeVisible();
  });

  test('should have "Message UUID" tab active by default', async ({ page }) => {
    const messageUuidTab = page.getByRole('tab', { name: 'Message UUID' });
    await expect(messageUuidTab).toBeVisible();
    await expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');

    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    await expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
  });

  test('should display session-id-input when "Session ID" tab is clicked', async ({ page }) => {
    await page.getByRole('tab', { name: 'Session ID' }).click();

    await expect(page.getByTestId('session-id-input')).toBeVisible();
    await expect(page.getByTestId('session-id-lookup-button')).toBeVisible();
  });

  test('should complete session ID lookup flow from "Session ID" tab', async ({ page }) => {
    await page.getByRole('tab', { name: 'Session ID' }).click();
    await expect(page.getByTestId('session-id-input')).toBeVisible();

    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });
});
