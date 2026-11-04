import { test, expect } from '@playwright/test';
import { SEEDED_IDS, fetchSessionList, openSessionsTab } from './support/session-list';

// Asserts only the relative order of the seeded sessions, so throwaway sessions from other specs on the shared backend do not matter.

test.describe('Session List Order (SL-AC2)', () => {
  test('renders seeded sessions newest-first, preserving API order', async ({ page, request }) => {
    const apiList = await fetchSessionList(request);
    const expectedOrder = apiList
      .map((s) => s.session_id)
      .filter((id) => SEEDED_IDS.includes(id));

    expect([...expectedOrder].sort()).toEqual([...SEEDED_IDS].sort());

    await openSessionsTab(page);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    const renderedIds = await page.locator('.session-list__id').allTextContents();
    const renderedSeededOrder = renderedIds.filter((id) => SEEDED_IDS.includes(id));
    expect(renderedSeededOrder).toEqual(expectedOrder);
  });

  test('renders each row with its session id and upload date', async ({ page }) => {
    await openSessionsTab(page);

    const firstRow = page.getByTestId('session-list-item').first();
    await expect(firstRow.locator('.session-list__id')).not.toBeEmpty();
    // Dates render in UTC ("YYYY-MM-DD HH:mm UTC") so they are timezone-stable.
    await expect(firstRow.locator('.session-list__date')).toContainText(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/
    );
  });
});
