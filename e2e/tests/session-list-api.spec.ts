import { test, expect } from '@playwright/test';
import { API_URL, SEEDED_IDS, fetchSessionList, uploadThrowawaySession } from './support/session-list';

/**
 * Session List API (SL-AC1)
 *
 * Purpose: assert the `GET /api/transcripts` contract that the browsing tab is
 * built on, against a running backend + S3:
 *
 * - the response is an array of `{session_id, created_at}` summaries
 *   (the schema that replaced the original bare `[]string`),
 * - `created_at` is an RFC3339 timestamp,
 * - rows are ordered newest-first (`created_at` DESC) by the backend, so the UI
 *   never has to sort,
 * - a session becomes listable as soon as it is uploaded.
 *
 * The UI's *preservation* of this order is SL-AC2's job
 * (`session-list-order.spec.ts`); this spec stops at the API boundary.
 *
 * Test Status: ACTIVE
 */

test.describe('Session List API (SL-AC1)', () => {
  test('returns {session_id, created_at} summaries, newest-first', async ({ request }) => {
    const sessions = await fetchSessionList(request);
    expect(sessions.length).toBeGreaterThan(0);

    for (const session of sessions) {
      expect(typeof session.session_id).toBe('string');
      expect(session.session_id.length).toBeGreaterThan(0);
      // RFC3339 / ISO-8601, parseable — the UI formats it as "YYYY-MM-DD HH:mm UTC".
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
