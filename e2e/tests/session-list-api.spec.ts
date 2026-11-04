import { test, expect } from '@playwright/test';
import { API_URL, SEEDED_IDS, fetchSessionList, uploadThrowawaySession } from './support/session-list';

test.describe('Session List API (SL-AC1)', () => {
  test('returns {session_id, created_at} summaries, newest-first', async ({ request }) => {
    const sessions = await fetchSessionList(request);
    expect(sessions.length).toBeGreaterThan(0);

    for (const session of sessions) {
      expect(typeof session.session_id).toBe('string');
      expect(session.session_id.length).toBeGreaterThan(0);
      expect(Number.isNaN(new Date(session.created_at).getTime())).toBe(false);
    }

    // created_at DESC: the backend is the source of truth for the order.
    for (let i = 1; i < sessions.length; i++) {
      expect(new Date(sessions[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(sessions[i].created_at).getTime()
      );
    }

    // Every seeded fixture is listed (seed stamps deterministic, spaced created_at).
    const ids = sessions.map((s) => s.session_id);
    for (const seeded of SEEDED_IDS) {
      expect(ids).toContain(seeded);
    }
  });

  test('lists a session as soon as it is uploaded', async ({ request }) => {
    const sessionId = `session-list-api-e2e-${Date.now()}`;
    await uploadThrowawaySession(request, sessionId);

    const sessions = await fetchSessionList(request);
    const uploaded = sessions.find((s) => s.session_id === sessionId);
    expect(uploaded, `${sessionId} should appear in the list`).toBeTruthy();
    expect(Number.isNaN(new Date(uploaded!.created_at).getTime())).toBe(false);

    // Clean up so the shared backend's list stays close to the seeded set.
    const deleted = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(deleted.ok()).toBeTruthy();
  });
});
