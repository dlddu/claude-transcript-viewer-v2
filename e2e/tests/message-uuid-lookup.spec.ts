import { test, expect } from '@playwright/test';

/**
 * Message UUID Lookup (LK-AC3)
 *
 * Purpose: Test the message UUID lookup functionality that allows users to paste
 * a message containing a UUID v4 and extract it to search for the associated
 * transcript.
 *
 * Expected Flow:
 * 1. User is on the "Message UUID" tab (default active tab)
 * 2. User pastes a message text containing a UUID v4 into the textarea
 * 3. User clicks "Extract & Search" button (or presses Ctrl+Enter)
 * 4. System extracts the UUID v4 from the pasted text using regex
 * 5. Extracted UUID is displayed as a green badge
 * 6. System fetches the transcript associated with that UUID
 * 7. Transcript messages are displayed in the viewer
 *
 * UUID v4 regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
 *
 * Failure feedback ("No UUID found" for text without a UUID, the API error for a
 * well-formed but unknown UUID) is LK-AC4's job
 * (`lookup-failure-feedback.spec.ts`).
 *
 * Test Status: ACTIVE
 *
 * Fixture Data:
 * - e2e/fixtures/f47ac10b-58cc-4372-a567-0e02b2c3d479.jsonl
 *
 * Linear Issue: DLD-473 (parent: DLD-470 [Feature] Message UUID 조회 기능)
 */

// A UUID v4 that the test server will recognise and resolve to a transcript.
// Replace with an actual uuid from fixture data once the lookup API supports UUID v4 keys.
const KNOWN_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// Natural-language message that contains KNOWN_UUID embedded inside it.
const MESSAGE_WITH_UUID =
  `Here is the conversation reference you asked for: ${KNOWN_UUID}. ` +
  `Please look it up and show me the full transcript.`;

test.describe('Message UUID Lookup (LK-AC3)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app home page.
    // "Message UUID" tab is the default active tab (DLD-471), so no tab switch is needed.
    await page.goto('/');
  });

  test('should show textarea and "Extract & Search" button when "Message UUID" tab is active', async ({ page }) => {
    // Assert - "Message UUID" tab is the default and its panel content is visible
    const messageUuidTab = page.getByRole('tab', { name: 'Message UUID' });
    await expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');

    // The textarea for pasting the message should be visible
    await expect(page.getByRole('textbox')).toBeVisible();

    // The action button should be visible
    await expect(page.getByRole('button', { name: 'Extract & Search' })).toBeVisible();
  });

  test('should display a placeholder hint in the textarea', async ({ page }) => {
    // Assert - textarea has a descriptive placeholder guiding the user
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();

    // The placeholder should hint that the user should paste a message containing a UUID
    const placeholder = await textarea.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(0);
  });

  test('should disable "Extract & Search" button when textarea is empty', async ({ page }) => {
    // Arrange - ensure textarea is empty (default state)
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();
    await textarea.clear();

    // Assert - button is disabled while there is no input
    await expect(page.getByRole('button', { name: 'Extract & Search' })).toBeDisabled();
  });

  test('should extract UUID from pasted message, show green badge, and load transcript', async ({ page }) => {
    // Arrange - paste a message that contains a known UUID v4
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITH_UUID);

    // Act - click "Extract & Search"
    await page.getByRole('button', { name: 'Extract & Search' }).click();

    // Assert - extracted UUID is displayed as a green badge
    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(KNOWN_UUID);

    // Assert - transcript viewer becomes visible with content
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should trigger extraction and search with Ctrl+Enter keyboard shortcut', async ({ page }) => {
    // Arrange - paste a message containing a UUID v4
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITH_UUID);

    // Act - press Ctrl+Enter instead of clicking the button
    await textarea.press('Control+Enter');

    // Assert - extracted UUID badge appears (same result as button click)
    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(KNOWN_UUID);

    // Assert - transcript viewer becomes visible
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });
});
