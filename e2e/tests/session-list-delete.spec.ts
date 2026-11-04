import { test, expect } from '@playwright/test';
import { fetchSessionList, openSessionsTab, uploadThrowawaySession } from './support/session-list';

// Each test uploads a throwaway session: deleting a seeded one would break the specs that read it.

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

    await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);

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

    await expect(page.getByText(sessionId, { exact: true })).toBeVisible();
    const ids = (await fetchSessionList(request)).map((s) => s.session_id);
    expect(ids).toContain(sessionId);

    // Clean up through the API so the shared backend stays tidy.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Delete ${sessionId}` }).click();
    await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);
  });
});
