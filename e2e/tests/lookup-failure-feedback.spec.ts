import { test, expect } from '@playwright/test';

/**
 * Lookup Failure Feedback (LK-AC4)
 *
 * Purpose: when a lookup cannot produce a transcript, the user is told why —
 * and never left staring at a stale or half-rendered viewer:
 *
 * - a session ID with no stored transcript surfaces the backend's not-found
 *   error (the API side of that 404 is LC-AC4, `transcript-not-found.spec.ts`),
 * - pasted text with no UUID v4 in it shows "No UUID found" before any request
 *   is made,
 * - a well-formed but unknown UUID extracts successfully (badge shown) and then
 *   surfaces the API error,
 * - before any lookup, a guidance message tells the user what to enter.
 *
 * The happy paths live in `session-id-lookup.spec.ts` (LK-AC2) and
 * `message-uuid-lookup.spec.ts` (LK-AC3).
 *
 * Test Status: ACTIVE
 */

// "Message UUID" is the default active tab; the Session ID tab needs a click.
async function openSessionIdTab(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
  if ((await sessionIdTab.count()) > 0) {
    await sessionIdTab.click();
  }
}

// Text that contains no UUID v4 whatsoever.
const MESSAGE_WITHOUT_UUID =
  'Hello, I would like to see a transcript but I forgot the identifier.';

// A well-formed UUID v4 that does not match any transcript in the test server.
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const MESSAGE_WITH_UNKNOWN_UUID = `The session reference is ${UNKNOWN_UUID}, please retrieve it.`;

test.describe('Lookup Failure Feedback (LK-AC4)', () => {
  test('shows an error when the session ID has no stored transcript', async ({ page }) => {
    await openSessionIdTab(page);

    await page.getByTestId('session-id-input').fill('session-nonexistent-999');
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByText(/session.*not.*found|no.*transcript.*found/i)).toBeVisible();

    // No transcript content leaks through on failure.
    await expect(page.getByText(/Can you help me analyze this dataset/i)).not.toBeVisible();
  });

  test('shows a guidance message before any lookup has been made', async ({ page }) => {
    await openSessionIdTab(page);

    await expect(page.getByText(/enter.*session.*id|search.*session/i)).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).not.toBeVisible();
  });

  test('shows "No UUID found" when the pasted text contains no UUID v4', async ({ page }) => {
    await page.goto('/'); // "Message UUID" is the default tab.

    await page.getByRole('textbox').fill(MESSAGE_WITHOUT_UUID);
    await page.getByRole('button', { name: 'Extract & Search' }).click();

    await expect(page.getByText(/no uuid found/i)).toBeVisible();
    await expect(page.getByTestId('transcript-viewer')).not.toBeVisible();
  });

  test('extracts an unknown UUID, then surfaces the API error', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('textbox').fill(MESSAGE_WITH_UNKNOWN_UUID);
    await page.getByRole('button', { name: 'Extract & Search' }).click();

    // Extraction itself succeeded — the badge distinguishes "no UUID in your
    // text" from "that UUID resolves to nothing".
    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(UNKNOWN_UUID);

    await expect(page.getByText(/not found|error|could not find/i)).toBeVisible();
    await expect(page.getByTestId('transcript-viewer')).not.toBeVisible();
  });
});
