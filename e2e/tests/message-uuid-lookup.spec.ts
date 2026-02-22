import { test, expect } from '@playwright/test';

/**
 * Message UUID Lookup E2E Tests
 *
 * Purpose: Test the message UUID lookup functionality that allows users to paste
 * a message containing a UUID v4 and extract it to search for the associated transcript.
 *
 * Test Status: SKIPPED (TDD Red Phase)
 * Reason: Tests are written before implementation. These tests will be enabled
 * after the Message UUID lookup UI and parsing logic are implemented (DLD-474).
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
 * Implementation Requirements (DLD-474):
 * 1. Render textarea and "Extract & Search" button in the "Message UUID" tab panel
 * 2. Disable "Extract & Search" button when textarea is empty
 * 3. Extract UUID v4 from pasted text on button click / Ctrl+Enter
 * 4. Display extracted UUID as a green badge
 * 5. Fetch and display transcript for the extracted UUID
 * 6. Show "No UUID found" error when input contains no UUID v4
 * 7. Show API error when UUID does not match any transcript
 * 8. Remove .skip from tests when implementation is complete
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - Contains messages with uuid fields (msg-001 through msg-006)
 *   - UUID used in tests: a representative UUID v4 embedded in natural language
 *
 * Linear Issue: DLD-473
 * Title: 작업 2-1: [메시지 UUID 파싱] e2e 테스트 작성 (skipped)
 * Parent: DLD-470 [Feature] Message UUID 조회 기능
 * Next: DLD-474 작업 2-2: [메시지 UUID 파싱] 구현 및 e2e 테스트 활성화
 */

// A UUID v4 that the test server will recognise and resolve to a transcript.
// Replace with an actual uuid from fixture data once the lookup API supports UUID v4 keys.
const KNOWN_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// Natural-language message that contains KNOWN_UUID embedded inside it.
const MESSAGE_WITH_UUID =
  `Here is the conversation reference you asked for: ${KNOWN_UUID}. ` +
  `Please look it up and show me the full transcript.`;

// Text that contains no UUID v4 whatsoever.
const MESSAGE_WITHOUT_UUID =
  'Hello, I would like to see a transcript but I forgot the identifier.';

// A UUID v4 that does not match any transcript in the test server.
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const MESSAGE_WITH_UNKNOWN_UUID =
  `The session reference is ${UNKNOWN_UUID}, please retrieve it.`;

test.describe('Message UUID Lookup', () => {
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

  test('should show "No UUID found" error when input contains no UUID v4', async ({ page }) => {
    // Arrange - paste text that has no UUID v4
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITHOUT_UUID);

    // Act - click "Extract & Search"
    await page.getByRole('button', { name: 'Extract & Search' }).click();

    // Assert - inline error message is shown
    await expect(page.getByText(/no uuid found/i)).toBeVisible();

    // Assert - transcript viewer should NOT appear
    await expect(page.getByTestId('transcript-viewer')).not.toBeVisible();
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

  test('should show API error when UUID does not match any transcript', async ({ page }) => {
    // Arrange - paste a message with a UUID v4 that the server does not recognise
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITH_UNKNOWN_UUID);

    // Act - click "Extract & Search"
    await page.getByRole('button', { name: 'Extract & Search' }).click();

    // Assert - extracted UUID badge is shown (extraction itself succeeded)
    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(UNKNOWN_UUID);

    // Assert - an API / not-found error message is displayed
    await expect(
      page.getByText(/not found|error|could not find/i)
    ).toBeVisible();

    // Assert - transcript viewer should NOT appear with content
    await expect(page.getByTestId('transcript-viewer')).not.toBeVisible();
  });
});
