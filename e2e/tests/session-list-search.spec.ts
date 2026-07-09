import { test, expect } from '@playwright/test';
import { openSessionsTab } from './support/session-list';

/**
 * Session List Search & Filter (SL-AC3)
 *
 * Purpose: the search box filters the rendered list by session-id substring
 * (case-insensitive), restores the full list when cleared, and shows the
 * "no matching sessions" message when nothing matches. Filtering is client-side
 * over the already-loaded list, so no refetch is expected.
 *
 * Test Status: ACTIVE
 */

test.describe('Session List Search (SL-AC3)', () => {
  test('narrows the list on partial match and restores on clear', async ({ page }) => {
    await openSessionsTab(page);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    const search = page.getByTestId('session-search-input');

    await search.fill('abc123');
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
    await expect(page.getByText('session-xyz789', { exact: true })).toHaveCount(0);

    await search.fill('');
    await expect(page.getByText('session-xyz789', { exact: true })).toBeVisible();
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
  });

  test('matches case-insensitively', async ({ page }) => {
    await openSessionsTab(page);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    await page.getByTestId('session-search-input').fill('ABC123');
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
    await expect(page.getByText('session-xyz789', { exact: true })).toHaveCount(0);
  });

  test('shows the no-results message when nothing matches', async ({ page }) => {
    await openSessionsTab(page);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    await page.getByTestId('session-search-input').fill('no-such-session-zzz-000');
    await expect(page.getByTestId('session-list-no-results')).toBeVisible();
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);
  });
});
