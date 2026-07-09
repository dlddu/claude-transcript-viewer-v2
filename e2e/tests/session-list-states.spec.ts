import { test, expect } from '@playwright/test';
import { LIST_ROUTE } from './support/session-list';

/**
 * Session List Empty / Loading / Failure States (SL-AC6)
 *
 * Purpose: the "Sessions" tab tells the user what is going on when there is no
 * list to show — an empty-state hint pointing at the other entry paths, a
 * loading indicator while the request is in flight, and an error message when
 * the list request fails.
 *
 * These three states cannot be forced from the shared seeded backend (it always
 * has sessions, and responds fast and successfully), so the list response is
 * intercepted at the browser boundary with `page.route`. Everything below the
 * fetch — component state machine, markup, copy — is the real thing. Only
 * `GET /api/transcripts` is stubbed; the upload/delete endpoints are untouched.
 *
 * Test Status: ACTIVE
 */

test.describe('Session List States (SL-AC6)', () => {
  test('shows the empty state with entry-path hints when nothing is stored', async ({ page }) => {
    await page.route(LIST_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();

    await expect(page.getByTestId('session-list-empty')).toBeVisible();
    await expect(page.getByText('No sessions stored yet.')).toBeVisible();
    await expect(page.getByText(/Message UUID or Session ID tabs/i)).toBeVisible();

    // No search box and no rows when there is nothing to search.
    await expect(page.getByTestId('session-search-input')).toHaveCount(0);
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);
  });

  test('shows the loading indicator while the list request is in flight', async ({ page }) => {
    // Hold the response open, assert the loading state, then release it and
    // assert the list replaces the indicator.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(LIST_ROUTE, async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ session_id: 'session-abc123', created_at: '2026-07-01T00:00:00Z' }]),
      });
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();

    await expect(page.getByTestId('session-list-loading')).toBeVisible();
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);

    release();

    await expect(page.getByTestId('session-list-loading')).toHaveCount(0);
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
  });

  test('surfaces the backend error message when the list request fails', async ({ page }) => {
    await page.route(LIST_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'failed to list sessions' }),
      })
    );

    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();

    const error = page.getByTestId('session-list-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText('failed to list sessions');

    // The failed state does not pretend to be an empty list.
    await expect(page.getByTestId('session-list-empty')).toHaveCount(0);
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);
  });
});
