import { test, expect } from '@playwright/test';

// Targets the Go server serving frontend/dist at BASE_URL (CI e2e job); a bare Vite dev server emits neither hashed /assets/ files nor these headers.

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

test.describe('Static Asset Cache Headers (DP-AC2)', () => {
  test('serves index.html with no-cache so clients always revalidate the shell', async ({
    request,
  }) => {
    const res = await request.get('/');

    expect(res.ok()).toBeTruthy();
    expect(res.headers()['cache-control']).toBe(REVALIDATE);
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });

  test('serves content-hashed /assets/ files as immutable with a one-year max-age', async ({
    request,
  }) => {
    // Discover the entry bundle from the shell: its content hash changes on every build.
    const html = await (await request.get('/')).text();
    const assetPaths = [...new Set([...html.matchAll(/\/assets\/[^"']+?\.(?:js|css)/g)].map((m) => m[0]))];

    expect(assetPaths.length).toBeGreaterThan(0);

    for (const assetPath of assetPaths) {
      const res = await request.get(assetPath);
      expect(res.ok(), `expected ${assetPath} to be served`).toBeTruthy();
      expect(res.headers()['cache-control'], `Cache-Control for ${assetPath}`).toBe(IMMUTABLE);
    }
  });

  test('falls back deep client-side routes to index.html without inheriting asset caching', async ({
    request,
  }) => {
    const res = await request.get('/session/deep/client-route');

    expect(res.ok()).toBeTruthy();
    expect(res.headers()['cache-control']).toBe(REVALIDATE);
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });
});
