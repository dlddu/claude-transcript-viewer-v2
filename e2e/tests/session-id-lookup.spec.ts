import { test, expect } from '@playwright/test';

/**
 * Session ID Lookup (LK-AC2)
 *
 * Purpose: Test the session ID lookup functionality that allows users to search
 * for transcripts by entering a session ID — the input/button UI, a successful
 * lookup and the metadata it reveals, the loading state, pre-submit validation,
 * whitespace trimming, Enter-key submit, and re-searching a different session.
 *
 * Failure feedback (not-found errors, the pre-lookup guidance message) is
 * LK-AC4's job (`lookup-failure-feedback.spec.ts`).
 *
 * Test Status: ACTIVE
 *
 * Expected Flow:
 * 1. User enters a session ID in the search input field
 * 2. User clicks the search/lookup button
 * 3. System fetches transcript data associated with the session ID
 * 4. Transcript messages are displayed in the viewer
 *
 * Fixture Data: e2e/fixtures/session-abc123.jsonl is the main session transcript (session_id: "session-abc123")
 */
test.describe('Session ID Lookup (LK-AC2)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app home page
    await page.goto('/');

    // Click the "Session ID" tab to ensure session ID input is visible.
    // Required after DLD-471 tab UI introduction: "Message UUID" tab is the default,
    // so the "Session ID" tab must be selected before interacting with session-id-input.
    // Use count() instead of isVisible() to avoid auto-waiting: count() performs a
    // synchronous DOM query with no auto-waiting, minimizing timing side effects on
    // subsequent tests (e.g. "should show loading state while fetching transcript").
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
  });

  test('should display session ID input field and lookup button', async ({ page }) => {
    // Arrange & Assert - UI elements should be visible
    // The session ID input field should be present
    await expect(page.getByTestId('session-id-input')).toBeVisible();

    // The lookup button should be present
    await expect(page.getByTestId('session-id-lookup-button')).toBeVisible();

    // The input should have appropriate placeholder text
    await expect(page.getByTestId('session-id-input')).toHaveAttribute(
      'placeholder',
      /session.*id/i
    );
  });

  test('should load transcript when valid session ID is entered and button clicked', async ({ page }) => {
    // Arrange - prepare test data
    const testSessionId = 'session-abc123'; // From mock data in s3.ts

    // Act - enter session ID and click lookup button
    const sessionInput = page.getByTestId('session-id-input');
    await sessionInput.fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - transcript should be displayed
    // The transcript viewer should become visible
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    // The transcript content from the mock should be visible
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();

    // Session ID should be displayed in the metadata section
    await expect(page.getByTestId('session-id-display')).toBeVisible();
    await expect(page.getByTestId('session-id-display')).toContainText('session-abc123');
  });

  test('should show loading state while fetching transcript', async ({ page }) => {
    // Arrange
    const testSessionId = 'session-abc123';

    // Act - enter session ID and click lookup button
    await page.getByTestId('session-id-input').fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - loading indicator should appear briefly
    // Note: This may require network throttling or mock to be visible
    await expect(page.getByText(/loading/i)).toBeVisible();
  });

  test('should validate session ID format before lookup', async ({ page }) => {
    // Arrange - use invalid format
    const invalidFormat = '';

    // Act - fill with empty session ID
    await page.getByTestId('session-id-input').fill(invalidFormat);

    // Assert - lookup button should be disabled for empty input
    await expect(page.getByTestId('session-id-lookup-button')).toBeDisabled();
  });

  test('should display metadata and subagent sections after successful lookup', async ({ page }) => {
    // Arrange
    const testSessionId = 'session-abc123';

    // Act - perform successful lookup
    await page.getByTestId('session-id-input').fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - verify complete transcript structure is displayed
    // Main transcript content
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();

    // Metadata information - model is extracted from messages
    await expect(page.getByTestId('model-display')).toBeVisible();
    await expect(page.getByTestId('model-display')).toContainText('claude-sonnet-4-5');

    // Subagent sections should be visible (using mock data subagent name)
    // Use .first() to handle multiple occurrences (subagent-label, subagent-header, etc.)
    await expect(page.getByText('agent-a1b2c3d').first()).toBeVisible();
  });

  test('should allow searching for a different session ID after initial lookup', async ({ page }) => {
    // Arrange
    const firstSessionId = 'session-abc123';
    const secondSessionId = 'session-xyz789';

    // Act - perform first lookup
    await page.getByTestId('session-id-input').fill(firstSessionId);
    await page.getByTestId('session-id-lookup-button').click();
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    // Act - clear input and search for different session
    await page.getByTestId('session-id-input').clear();
    await page.getByTestId('session-id-input').fill(secondSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - new transcript should be loaded
    // (This test will need different fixture data to fully verify)
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should support keyboard interaction (Enter key to submit)', async ({ page }) => {
    // Arrange
    const testSessionId = 'session-abc123';

    // Act - enter session ID and press Enter key
    const sessionInput = page.getByTestId('session-id-input');
    await sessionInput.fill(testSessionId);
    await sessionInput.press('Enter');

    // Assert - lookup should be triggered without clicking button
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });

  test('should trim whitespace from session ID input', async ({ page }) => {
    // Arrange - session ID with leading/trailing whitespace
    const sessionIdWithSpaces = '  session-abc123  ';

    // Act - enter session ID with whitespace
    await page.getByTestId('session-id-input').fill(sessionIdWithSpaces);
    await page.getByTestId('session-id-lookup-button').click();

    // Assert - lookup should still succeed (whitespace trimmed)
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });
});
