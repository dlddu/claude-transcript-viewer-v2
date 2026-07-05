import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Session List E2E Tests
 *
 * Purpose: Exercise the "Sessions" browsing tab end-to-end against a running
 * stack, covering the session-list acceptance criteria that a browsing user
 * relies on:
 *
 * - SL-AC2: the list renders every stored session newest-first. The list API
 *   (GET /api/transcripts) is the source of truth for the order; the UI must
 *   preserve it. Seed stamps fixtures with deterministic, spaced created_at
 *   (backend/seed.go), so the seeded fixtures have a stable relative order.
 * - SL-AC3: the search box filters the list by session-id substring, restores
 *   on clear, and shows a "no matching sessions" message when nothing matches.
 * - SL-AC4: clicking a row opens that session in the timeline view, reusing the
 *   same loadTranscript path as the lookup tabs (browser-direct S3 download).
 * - SL-AC5: a row can be deleted (after confirmation) and disappears from both
 *   the list UI and the backend list. A throwaway session is uploaded for this
 *   so the destructive path never touches the read-only seeded fixtures.
 *
 * Test Status: ACTIVE
 *
 * Fixture Data (seeded via `server seed --dir e2e/fixtures`):
 * - session-abc123 (has subagents), session-xyz789, session-task-subagent,
 *   f47ac10b-58cc-4372-a567-0e02b2c3d479
 *
 * Notes:
 * - The newest-first assertion checks the RELATIVE order of the known seeded
 *   sessions, derived from the API response rather than hardcoded, so it stays
 *   robust against throwaway sessions other specs create on the shared backend.
 * - The presigned URL may point at the cluster-internal S3 host in CI; it is
 *   rewritten to localhost before the PUT, mirroring the upload/delete specs.
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Sessions that are always present from the seeded fixtures. Their relative
// newest-first order is asserted (derived from the API, not hardcoded).
const SEEDED_IDS = ['session-abc123', 'session-xyz789', 'session-task-subagent'];

interface SessionSummary {
  session_id: string;
  created_at: string;
}

function transcriptLine(sessionId: string, uuid: string, text: string, timestamp: string): string {
  return JSON.stringify({
    type: 'user',
    sessionId,
    uuid,
    parentUuid: null,
    timestamp,
    message: { role: 'user', content: text },
  });
}

function reachableFromHost(presignedUrl: string): string {
  const url = new URL(presignedUrl);
  url.hostname = 'localhost';
  return url.toString();
}

async function fetchSessionList(request: APIRequestContext): Promise<SessionSummary[]> {
  const resp = await request.get(`${API_URL}/api/transcripts`);
  expect(resp.status()).toBe(200);
  return (await resp.json()) as SessionSummary[];
}

async function uploadThrowawaySession(request: APIRequestContext, sessionId: string): Promise<void> {
  const urlResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
  expect(urlResp.ok(), `upload-url for ${sessionId}`).toBeTruthy();
  const { url } = await urlResp.json();
  const putResp = await request.put(reachableFromHost(url), {
    data: transcriptLine(sessionId, 'msg-1', 'session-list e2e throwaway', '2026-07-01T00:00:00Z'),
  });
  expect(putResp.ok(), `presigned PUT for ${sessionId}`).toBeTruthy();
}

test.describe('Session List', () => {
  test('renders seeded sessions newest-first (SL-AC2)', async ({ page, request }) => {
    // The API is the source of truth: it returns {session_id, created_at}
    // ordered newest-first. Verify the order is genuinely date-descending, then
    // that the UI preserves the seeded sessions' relative order.
    const apiList = await fetchSessionList(request);
    for (let i = 1; i < apiList.length; i++) {
      expect(new Date(apiList[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(apiList[i].created_at).getTime()
      );
    }
    const apiSeededOrder = apiList
      .map((s) => s.session_id)
      .filter((id) => SEEDED_IDS.includes(id));
    expect(apiSeededOrder.sort()).toEqual([...SEEDED_IDS].sort()); // all seeded present
    // Re-derive the API order (the sort above mutated the copy used for the check).
    const expectedOrder = apiList
      .map((s) => s.session_id)
      .filter((id) => SEEDED_IDS.includes(id));

    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page.getByTestId('session-list')).toBeVisible();
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    const renderedIds = await page.locator('.session-list__id').allTextContents();
    const renderedSeededOrder = renderedIds.filter((id) => SEEDED_IDS.includes(id));
    expect(renderedSeededOrder).toEqual(expectedOrder);
  });

  test('filters the list by search query and restores on clear (SL-AC3)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    const search = page.getByTestId('session-search-input');

    // Partial-match narrows the list.
    await search.fill('abc123');
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();
    await expect(page.getByText('session-xyz789', { exact: true })).toHaveCount(0);

    // Clearing restores the full list.
    await search.fill('');
    await expect(page.getByText('session-xyz789', { exact: true })).toBeVisible();

    // A query that matches nothing shows the no-results message.
    await search.fill('no-such-session-zzz-000');
    await expect(page.getByTestId('session-list-no-results')).toBeVisible();
    await expect(page.getByTestId('session-list-item')).toHaveCount(0);
  });

  test('opens a session from the list into the timeline view (SL-AC4)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page.getByText('session-abc123', { exact: true })).toBeVisible();

    // Click the row to open it (reuses the lookup loadTranscript path).
    await page.getByText('session-abc123', { exact: true }).click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });

  test('deletes a session from the list (SL-AC5)', async ({ page, request }) => {
    // Upload a throwaway session so the destructive delete never touches the
    // read-only seeded fixtures other specs depend on.
    const sessionId = `session-list-delete-e2e-${Date.now()}`;
    await uploadThrowawaySession(request, sessionId);

    await page.goto('/');
    await page.getByRole('tab', { name: 'Sessions' }).click();

    // Locate it via search (the shared backend's list may be long).
    await page.getByTestId('session-search-input').fill(sessionId);
    await expect(page.getByText(sessionId, { exact: true })).toBeVisible();

    // Accept the confirmation dialog, then delete.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Delete ${sessionId}` }).click();

    // The row disappears from the list UI...
    await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);

    // ...and from the backend list.
    const ids = (await fetchSessionList(request)).map((s) => s.session_id);
    expect(ids).not.toContain(sessionId);
  });
});
