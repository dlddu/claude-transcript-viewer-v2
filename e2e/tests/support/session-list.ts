import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Shared support for the session-list E2E specs.
 *
 * Each SL-AC now owns exactly one spec file (SL-AC1 → session-list-api,
 * SL-AC2 → session-list-order, ...), so the fixtures/helpers they all need live
 * here rather than being duplicated. This file is NOT a spec: Playwright's
 * default testMatch only collects `*.spec.ts`, so nothing here is auto-run.
 */

export const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Sessions that are always present from the seeded fixtures
 * (`server seed --dir e2e/fixtures`). Their relative newest-first order is
 * asserted by the order spec, derived from the API rather than hardcoded, so it
 * stays robust against throwaway sessions other specs create on the shared
 * backend.
 */
export const SEEDED_IDS = ['session-abc123', 'session-xyz789', 'session-task-subagent'];

export interface SessionSummary {
  session_id: string;
  created_at: string;
}

/** The list endpoint the "Sessions" tab reads. Also the route intercepted for SL-AC6. */
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
 * Uploads a one-line session through the real presigned-PUT path, so a
 * destructive spec never has to touch the read-only seeded fixtures that the
 * other specs depend on.
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

/** Opens the third ("Sessions") lookup tab and waits for the list container. */
export async function openSessionsTab(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.getByTestId('session-list')).toBeVisible();
}
