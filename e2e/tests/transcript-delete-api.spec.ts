import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Transcript Delete API E2E Tests
 *
 * Purpose: Exercise DELETE /api/transcript/session/{sessionId} end-to-end
 * against a running backend: upload a session through the presigned-URL flow,
 * delete it, and verify every trace is gone (read returns 404, the session
 * disappears from the list) while other sessions stay intact.
 *
 * Test Status: ACTIVE
 *
 * Expected Flow:
 * 1. POST /api/transcripts/upload-url/{id} issues a presigned PUT URL
 * 2. PUT the transcript body to that URL (main + subagents/ file)
 * 3. GET /api/transcript/session/{id} returns the merged transcript
 * 4. DELETE /api/transcript/session/{id} removes S3 objects + SQLite mapping
 * 5. Subsequent GET/DELETE return 404 and the list no longer includes the id
 *
 * Notes:
 * - Tests create their own throwaway sessions (unique id per attempt) instead
 *   of deleting seeded fixtures: other specs read those fixtures from the same
 *   shared backend, and CI retries would break on a fixed, already-deleted id.
 * - In the kind job the presigned URL points at the cluster-internal S3 host
 *   (http://localstack:4566). CI port-forwards that endpoint on the same port,
 *   so the host is rewritten to localhost before the PUT. LocalStack skips
 *   S3 signature validation by default, so the rewrite does not invalidate the
 *   signed request; against MinIO the URL is already localhost and unchanged.
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

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

async function uploadFile(
  request: APIRequestContext,
  sessionId: string,
  body: string,
  fileName?: string
): Promise<void> {
  const query = fileName ? `?file_name=${encodeURIComponent(fileName)}` : '';
  const urlResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}${query}`);
  expect(urlResp.ok(), `upload-url for ${sessionId} ${fileName ?? '(main)'}`).toBeTruthy();
  const { url } = await urlResp.json();

  const putResp = await request.put(reachableFromHost(url), { data: body });
  expect(putResp.ok(), `presigned PUT for ${sessionId} ${fileName ?? '(main)'}`).toBeTruthy();
}

test.describe('Transcript Delete API E2E', () => {
  test('should delete an uploaded session and all its files', async ({ request }) => {
    const sessionId = `delete-e2e-${Date.now()}`;

    // Arrange - upload a main transcript and a subagent file
    await uploadFile(
      request,
      sessionId,
      transcriptLine(sessionId, 'msg-001', 'main transcript to delete', '2026-07-01T00:00:00Z')
    );
    await uploadFile(
      request,
      'agent-del-1',
      transcriptLine('agent-del-1', 'msg-sub-001', 'subagent transcript to delete', '2026-07-01T00:00:01Z'),
      'subagents/agent-del-1.jsonl'
    );

    // Sanity - the session reads back before deletion
    const before = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(before.status()).toBe(200);
    const transcript = await before.json();
    expect(transcript.session_id).toBe(sessionId);
    expect(transcript.messages.length).toBeGreaterThan(0);

    // Act - delete the session
    const del = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(del.status()).toBe(200);
    expect(await del.json()).toEqual({ status: 'deleted', session_id: sessionId });

    // Assert - reading the session now returns 404
    const after = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(after.status()).toBe(404);

    // Assert - the session no longer appears in the list
    const list = await request.get(`${API_URL}/api/transcripts`);
    expect(list.status()).toBe(200);
    expect(await list.json()).not.toContain(sessionId);

    // Assert - a second delete reports not found (mapping already removed)
    const again = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(again.status()).toBe(404);
  });

  test('should return 404 when deleting a session that was never uploaded', async ({ request }) => {
    const resp = await request.delete(`${API_URL}/api/transcript/session/delete-e2e-never-existed`);
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(String(body.error).toLowerCase()).toContain('not found');
  });

  test('should support both /api/transcript and /api/transcripts base paths', async ({ request }) => {
    const sessionId = `delete-e2e-alias-${Date.now()}`;
    await uploadFile(
      request,
      sessionId,
      transcriptLine(sessionId, 'msg-001', 'alias path session', '2026-07-01T00:00:00Z')
    );

    const del = await request.delete(`${API_URL}/api/transcripts/session/${sessionId}`);
    expect(del.status()).toBe(200);

    const after = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(after.status()).toBe(404);
  });

  test('should leave other sessions intact after a delete', async ({ request }) => {
    const sessionId = `delete-e2e-isolation-${Date.now()}`;
    await uploadFile(
      request,
      sessionId,
      transcriptLine(sessionId, 'msg-001', 'isolated throwaway session', '2026-07-01T00:00:00Z')
    );

    const del = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(del.status()).toBe(200);

    // The seeded fixture session is untouched and still served
    const seeded = await request.get(`${API_URL}/api/transcript/session/session-abc123`);
    expect(seeded.status()).toBe(200);
    const body = await seeded.json();
    expect(body.session_id).toBe('session-abc123');
  });
});
