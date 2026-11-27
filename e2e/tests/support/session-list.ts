import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Not a spec: Playwright's default testMatch only collects `*.spec.ts`.

export const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Seeded fixtures always present (`server seed --dir e2e/fixtures`); the order
 * spec derives their newest-first order from the API, not from this list, so
 * throwaway sessions other specs create do not break it.
 */
export const SEEDED_IDS = ['session-abc123', 'session-xyz789', 'session-task-subagent'];

export interface SessionSummary {
  session_id: string;
  created_at: string;
}

// mock-exception: ERR/LAT — intercept target of the two SL-AC6 exceptions (loading, failure); same entries as in the policy allowlist
export const LIST_ROUTE = '**/api/transcripts';

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

/**
 * The presigned URL may point at the cluster-internal S3 host in CI; rewrite it
 * to localhost before the PUT, mirroring the upload/delete specs.
 */
function reachableFromHost(presignedUrl: string): string {
  const url = new URL(presignedUrl);
  url.hostname = 'localhost';
  return url.toString();
}

export async function fetchSessionList(request: APIRequestContext): Promise<SessionSummary[]> {
  const resp = await request.get(`${API_URL}/api/transcripts`);
  expect(resp.status()).toBe(200);
  return (await resp.json()) as SessionSummary[];
}

/**
 * Uploads a throwaway session through the real presigned-PUT path so a
 * destructive spec never touches the read-only seeded fixtures other specs use.
 */
export async function uploadThrowawaySession(
  request: APIRequestContext,
  sessionId: string
): Promise<void> {
  const urlResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
  expect(urlResp.ok(), `upload-url for ${sessionId}`).toBeTruthy();
  const { url } = await urlResp.json();
  const putResp = await request.put(reachableFromHost(url), {
    data: transcriptLine(sessionId, 'msg-1', 'session-list e2e throwaway', '2026-07-01T00:00:00Z'),
  });
  expect(putResp.ok(), `presigned PUT for ${sessionId}`).toBeTruthy();
}

export async function openSessionsTab(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.getByTestId('session-list')).toBeVisible();
}
