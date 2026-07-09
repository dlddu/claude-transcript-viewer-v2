import { test, expect } from '@playwright/test';
import { SEEDED_IDS, fetchSessionList, openSessionsTab } from './support/session-list';

/**
 * Session List Rendering & Newest-First Order (SL-AC2)
 *
 * Purpose: the "Sessions" tab renders every stored session, and preserves the
 * newest-first order the list API returns. The API contract itself (schema,
 * `created_at` DESC) is SL-AC1's job (`session-list-api.spec.ts`); here the API
 * is only read to derive the *expected* order, so this spec fails when the UI
 * re-sorts, reverses, or drops rows.
 *
 * Test Status: ACTIVE
 *
 * Notes:
 * - Only the RELATIVE order of the known seeded sessions is asserted, so the
 *   spec stays robust against throwaway sessions other specs create on the
 *   shared backend.
 */

test.describe('Session List Order (SL-AC2)', () => {
  test('renders seeded sessions newest-first, preserving API order', async ({ page, request }) => {
    const apiList = await fetchSessionList(request);
    const expectedOrder = apiList
      .map((s) => s.session_id)
      .filter((id) => SEEDED_IDS.includes(id));

    // All seeded sessions are present in the API response.
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
