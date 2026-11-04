import { test, expect } from '@playwright/test';
import { LIST_ROUTE } from './support/session-list';
import { startEmptyBackend, type EmptyBackend } from './support/empty-backend';

test.describe('Session List States (SL-AC6)', () => {
  test.describe('empty backend', () => {
    let empty: EmptyBackend;
    test.beforeAll(async () => {
      empty = await startEmptyBackend();
    });
    test.afterAll(async () => {
      await empty?.stop();
    });

    test('shows the empty state with entry-path hints when nothing is stored', async ({ page }) => {
      await page.goto(`${empty.baseURL}/`);
      await page.getByRole('tab', { name: 'Sessions' }).click();

      await expect(page.getByTestId('session-list-empty')).toBeVisible();
      await expect(page.getByText('No sessions stored yet.')).toBeVisible();
      await expect(page.getByText(/Message UUID or Session ID tabs/i)).toBeVisible();

      await expect(page.getByTestId('session-search-input')).toHaveCount(0);
      await expect(page.getByTestId('session-list-item')).toHaveCount(0);
    });
  });

  test('shows the loading indicator while the list request is in flight', async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    // mock-exception: LAT — the local backend answers instantly, so the in-flight window cannot be held open from the real side
    await page.route(LIST_ROUTE, async (route) => {
      await held;
      await route.continue();
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
    // mock-exception: ERR — the list endpoint reads only SQLite; a request-time failure cannot be induced on the shared seeded DB
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

    await expect(page.getByTestId('session-list-empty')).toHaveCount(0);
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);
  });
});
