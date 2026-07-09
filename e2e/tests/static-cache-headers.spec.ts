import { test, expect } from '@playwright/test';

/**
 * Static Asset Cache Headers (DP-AC2)
 *
 * Verifies the single-workload server's cache policy end-to-end over HTTP: the
 * Go server that serves the built frontend must mark content-hashed assets
 * under /assets/ as immutable (so browsers cache them for a year) while making
 * index.html (and every SPA fallback route) revalidate on each load. This is
 * what lets a redeploy take effect immediately without clients pinning a stale
 * shell, yet keeps hashed bundles cache-friendly.
 *
 * Sibling coverage: backend/static_test.go asserts the same policy at the Go
 * handler level with an httptest server over a synthetic dir. This spec adds
 * the missing E2E: it drives the real running server (the same binary + built
 * dist that ships), so DP-AC2 is covered by an E2E and not only a unit test.
 *
 * Runtime: like the upload/delete API specs, this targets the deployed
 * configuration exercised by the CI e2e job — the Go server serving
 * frontend/dist at BASE_URL. It is not meaningful against a bare Vite dev
 * server, which does not emit /assets/ hashed files or these headers.
 */

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
    // The served index.html references the content-hashed entry bundle(s) that
    // Vite emitted under /assets/. Discover them from the shell rather than
    // hard-coding a hash that changes on every build.
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
    // A path that is not a real file must fall back to the SPA shell with the
    // revalidating policy — it must not be served as an immutable asset.
    const res = await request.get('/session/deep/client-route');

    expect(res.ok()).toBeTruthy();
    expect(res.headers()['cache-control']).toBe(REVALIDATE);
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });
});
