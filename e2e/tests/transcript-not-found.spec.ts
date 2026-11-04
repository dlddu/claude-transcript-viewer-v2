import { test, expect } from '@playwright/test';
import { API_URL, transcriptLine, uploadFile } from './support/transcript-api';

const NEVER_UPLOADED = 'not-found-e2e-never-existed';

test.describe('Unregistered Session 404 (LC-AC4)', () => {
  test('GET returns 404 with a not-found error for a session that was never uploaded', async ({
    request,
  }) => {
    const resp = await request.get(`${API_URL}/api/transcript/session/${NEVER_UPLOADED}`);
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(String(body.error).toLowerCase()).toContain('not found');
  });

  test('DELETE returns 404 with a not-found error for a session that was never uploaded', async ({
    request,
  }) => {
    const resp = await request.delete(`${API_URL}/api/transcript/session/${NEVER_UPLOADED}`);
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(String(body.error).toLowerCase()).toContain('not found');
  });

  test('both base paths answer 404 for an unregistered session', async ({ request }) => {
    // /api/transcript and /api/transcripts are aliases; neither invents a session.
    for (const base of ['transcript', 'transcripts']) {
      const resp = await request.get(`${API_URL}/api/${base}/session/${NEVER_UPLOADED}`);
      expect(resp.status(), `GET /api/${base}/session/...`).toBe(404);
    }
  });

  test('a session becomes unregistered once its mapping is deleted', async ({ request }) => {
    const sessionId = `not-found-e2e-deleted-${Date.now()}`;
    await uploadFile(
      request,
      sessionId,
      transcriptLine(sessionId, 'msg-001', 'about to be deleted', '2026-07-01T00:00:00Z')
    );

    expect((await request.get(`${API_URL}/api/transcript/session/${sessionId}`)).status()).toBe(200);

    expect((await request.delete(`${API_URL}/api/transcript/session/${sessionId}`)).status()).toBe(
      200
    );

    expect((await request.get(`${API_URL}/api/transcript/session/${sessionId}`)).status()).toBe(404);
    expect((await request.delete(`${API_URL}/api/transcript/session/${sessionId}`)).status()).toBe(
      404
    );
  });
});
