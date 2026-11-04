import { test, expect } from '@playwright/test';
import { openSessionsTab } from './support/session-list';

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
