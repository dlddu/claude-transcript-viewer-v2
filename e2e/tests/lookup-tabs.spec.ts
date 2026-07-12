import { test, expect } from '@playwright/test';

/**
 * Lookup Tabs (LK-AC1)
 *
 * Purpose: the main page shows the lookup tabs and lets a user complete a lookup
 * from them:
 * - "Message UUID" and "Session ID" tabs are displayed,
 * - "Message UUID" is the active tab by default on initial load,
 * - clicking "Session ID" reveals its input + lookup button,
 * - a full session-ID lookup completes from the "Session ID" tab.
 *
 * The third "Sessions" browsing tab is SL-AC2's job; this spec deliberately does
 * not assert the tab count, so it is unaffected by that tab's addition.
 *
 * Test Status: ACTIVE — the tab UI (DLD-470/DLD-471) is implemented and these
 * tests run unskipped. (This file was originally authored in a TDD red phase as
 * skipped; the `.skip` was removed when the feature landed. The tests below are
 * the current, active source of truth.)
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - Contains messages accessible via session ID "session-abc123"
 *
 * Linear: DLD-471 (parent DLD-470 [Feature] Message UUID 조회 기능)
 */

test.describe('Lookup Tabs (LK-AC1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display "Message UUID" tab and "Session ID" tab on main page', async ({ page }) => {
    // Assert - both tabs should be visible on initial load
    await expect(page.getByRole('tab', { name: 'Message UUID' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Session ID' })).toBeVisible();
  });

  test('should have "Message UUID" tab active by default', async ({ page }) => {
    // Assert - "Message UUID" tab should be the active/selected tab on initial load
    const messageUuidTab = page.getByRole('tab', { name: 'Message UUID' });
    await expect(messageUuidTab).toBeVisible();
    await expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');

    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    await expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
  });

  test('should display session-id-input when "Session ID" tab is clicked', async ({ page }) => {
    // Arrange - "Message UUID" is active by default, session-id-input should not be visible

    // Act - click the "Session ID" tab
    await page.getByRole('tab', { name: 'Session ID' }).click();

    // Assert - session ID input and lookup button should become visible
    await expect(page.getByTestId('session-id-input')).toBeVisible();
    await expect(page.getByTestId('session-id-lookup-button')).toBeVisible();
  });

  test('should complete session ID lookup flow from "Session ID" tab', async ({ page }) => {
    // Arrange - navigate to Session ID tab
    await page.getByRole('tab', { name: 'Session ID' }).click();
    await expect(page.getByTestId('session-id-input')).toBeVisible();

    // Act - enter a valid session ID and trigger lookup
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - transcript viewer should be displayed with expected content
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });
});
