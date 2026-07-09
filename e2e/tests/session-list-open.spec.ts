import { test, expect } from '@playwright/test';
import { openSessionsTab } from './support/session-list';

/**
 * Open a Session from the List (SL-AC4)
 *
 * Purpose: clicking a row opens that session in the timeline view, reusing the
 * same loadTranscript path as the lookup tabs (manifest → browser-direct S3
 * download). The list is replaced by the transcript (master-detail), so a large
 * session count never has to be scrolled past to reach a session's content, and
 * "back" returns to the list with the Sessions tab still active.
 *
 * Test Status: ACTIVE
 */

test.describe('Session List Open (SL-AC4)', () => {
  test('opens a session into a full-screen detail view and returns via back', async ({ page }) => {
    await openSessionsTab(page);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    await page.getByText('session-abc123', { exact: true }).click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
    await expect(page.getByTestId('session-list')).not.toBeVisible();

    await page.getByTestId('session-detail-back').click();
    await expect(page.getByTestId('session-list')).toBeVisible();
    await expect(page.getByTestId('transcript-viewer')).not.toBeVisible();
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
  });
});
