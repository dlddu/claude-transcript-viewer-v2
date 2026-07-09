import { test, expect } from '@playwright/test';
import { fetchSessionList, openSessionsTab, uploadThrowawaySession } from './support/session-list';

/**
 * Delete a Session from the List (SL-AC5)
 *
 * Purpose: a row can be deleted after confirmation and disappears from both the
 * list UI and the backend list. Cancelling the confirmation leaves the row
 * intact. A throwaway session is uploaded first, so the destructive path never
 * touches the read-only seeded fixtures other specs depend on.
 *
 * The backend's retry-safe delete ordering (objects → mapping) is LC-AC5's job
 * (`transcript-delete-api.spec.ts` + `backend/s3_test.go`); this spec covers the
 * list UI's side of the deletion.
 *
 * Test Status: ACTIVE
 */

test.describe('Session List Delete (SL-AC5)', () => {
  test('deletes a session from the list UI and the backend', async ({ page, request }) => {
    const sessionId = `session-list-delete-e2e-${Date.now()}`;
    await uploadThrowawaySession(request, sessionId);

    await openSessionsTab(page);

    // Locate it via search (the shared backend's list may be long).
    await page.getByTestId('session-search-input').fill(sessionId);
    await expect(page.getByText(sessionId, { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Delete ${sessionId}` }).click();

    // The row disappears from the list UI...
    await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);

    // ...and from the backend list.
    const ids = (await fetchSessionList(request)).map((s) => s.session_id);
    expect(ids).not.toContain(sessionId);
  });

  test('keeps the row when the confirmation is dismissed', async ({ page, request }) => {
    const sessionId = `session-list-keep-e2e-${Date.now()}`;
    await uploadThrowawaySession(request, sessionId);

    await openSessionsTab(page);
    await page.getByTestId('session-search-input').fill(sessionId);
    await expect(page.getByText(sessionId, { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: `Delete ${sessionId}` }).click();

    // Row survives, and so does the stored session.
    await expect(page.getByText(sessionId, { exact: true })).toBeVisible();
    const ids = (await fetchSessionList(request)).map((s) => s.session_id);
    expect(ids).toContain(sessionId);

    // Clean up through the API so the shared backend stays tidy.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Delete ${sessionId}` }).click();
    await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);
  });
});
