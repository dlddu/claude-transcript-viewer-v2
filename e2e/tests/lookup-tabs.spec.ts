import { test, expect } from '@playwright/test';

/**
 * Lookup Tabs E2E Tests
 *
 * Test Status: SKIPPED (TDD Red Phase)
 * Reason: Tests are written before implementation. These tests will be enabled
 * after the tab UI switching feature is implemented (DLD-471).
 *
 * Expected Behavior:
 * - Main page displays two tabs: "Message UUID" and "Session ID"
 * - "Message UUID" tab is active by default on initial load
 * - Clicking "Session ID" tab reveals the session ID input and lookup button
 * - Existing session ID lookup flow works correctly under the "Session ID" tab
 *
 * Implementation Requirements (DLD-470 parent):
 * 1. Add tab UI component with "Message UUID" and "Session ID" tabs
 * 2. "Message UUID" tab is the default active tab
 * 3. "Session ID" tab shows the existing session-id-input and session-id-lookup-button
 * 4. Remove .skip from tests when implementation is complete
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - Contains messages accessible via session ID "session-abc123"
 *
 * Linear Issue: DLD-471
 * Title: 작업 1-1: [탭 UI] e2e 테스트 작성 (skipped)
 * Parent: DLD-470 [Feature] Message UUID 조회 기능
 */

test.describe('Lookup Tabs', () => {
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
