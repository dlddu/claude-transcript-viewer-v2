import { test, expect } from '@playwright/test';
import {
  API_URL,
  cleanupSession,
  hiveDirOf,
  listS3Keys,
  newS3Client,
  reachableFromHost,
  transcriptLine,
} from './support/transcript-api';

/**
 * Transcript Upload URL API (LC-AC1)
 *
 * Purpose: exercise `POST /api/transcripts/upload-url/{sessionId}` as a
 * first-class contract against a running backend + S3:
 *
 * - the endpoint returns a presigned PUT URL whose key follows the Hive
 *   partition convention,
 * - the PUT lands the object in the bucket at that exact key,
 * - the `session_id → s3_prefix` mapping is persisted (observable because the
 *   download manifest later resolves the same key from SQLite),
 * - malformed `file_name` / session ids are rejected with 400.
 *
 * That a session's *later* files reuse one Hive directory is LC-AC2's job
 * (`transcript-session-prefix.spec.ts`).
 *
 * Test Status: ACTIVE
 */

test.describe('Transcript Upload URL API (LC-AC1)', () => {
  test('should issue a presigned PUT URL with the Hive-partitioned key contract', async ({
    request,
  }) => {
    const sessionId = `upload-e2e-contract-${Date.now()}`;

    try {
      const resp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
      expect(resp.status()).toBe(200);
      const body = await resp.json();

      // Response fields of the upload-url contract
      expect(body.method).toBe('PUT');
      expect(body.session_id).toBe(sessionId);
      expect(body.expires_in).toBeGreaterThan(0);
      expect(String(body.url)).toContain('X-Amz-');

      // The key follows the Hive partition convention and defaults to
      // <sessionId>.jsonl, allowing for an optional S3_PREFIX in front.
      const hivePattern = new RegExp(
        `(^|/)year=\\d{4}/month=\\d{2}/day=\\d{2}/hour=\\d{2}/session_id=${sessionId}/${sessionId}\\.jsonl$`
      );
      expect(String(body.key)).toMatch(hivePattern);

      // The presigned URL targets that same key (its path is URL-encoded,
      // so "=" appears as "%3D" — decode before comparing).
      expect(decodeURIComponent(new URL(body.url).pathname)).toContain(
        `session_id=${sessionId}/${sessionId}.jsonl`
      );
    } finally {
      await cleanupSession(request, sessionId);
    }
  });

  test('should store the uploaded object at the returned key and persist the session mapping', async ({
    request,
  }) => {
    const sessionId = `upload-e2e-store-${Date.now()}`;
    const s3 = newS3Client();

    try {
      const urlResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
      expect(urlResp.status()).toBe(200);
      const { url, key } = await urlResp.json();

      const putResp = await request.put(reachableFromHost(url), {
        data: transcriptLine(sessionId, 'msg-001', 'uploaded through presigned URL', '2026-07-01T00:00:00Z'),
      });
      expect(putResp.ok(), 'presigned PUT succeeds').toBeTruthy();

      // The object exists in the bucket at exactly the returned key.
      const stored = await listS3Keys(s3, hiveDirOf(key, sessionId));
      expect(stored).toEqual([key]);

      // The mapping was persisted: the download manifest resolves the session
      // from SQLite and points its main entry at the same key.
      const manifest = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
      expect(manifest.status()).toBe(200);
      const manifestBody = await manifest.json();
      expect(manifestBody.session_id).toBe(sessionId);
      expect(manifestBody.main.key).toBe(key);

      // And the session is listed. The list returns {session_id, created_at}
      // summary objects (newest-first), so match against the projected ids.
      const list = await request.get(`${API_URL}/api/transcripts`);
      expect(list.status()).toBe(200);
      const listedIds = ((await list.json()) as Array<{ session_id: string }>).map(
        (s) => s.session_id
      );
      expect(listedIds).toContain(sessionId);
    } finally {
      s3.destroy();
      await cleanupSession(request, sessionId);
    }
  });

  test('should reject file names outside the allowed upload patterns', async ({ request }) => {
    const sessionId = `upload-e2e-validation-${Date.now()}`;

    try {
      for (const fileName of ['evil.txt', 'subagents/../escape.jsonl', 'nested/dir/file.jsonl']) {
        const resp = await request.post(
          `${API_URL}/api/transcripts/upload-url/${sessionId}?file_name=${encodeURIComponent(fileName)}`
        );
        expect(resp.status(), `file_name "${fileName}" is rejected`).toBe(400);
        const body = await resp.json();
        expect(String(body.error)).toContain('.jsonl');
      }
    } finally {
      await cleanupSession(request, sessionId);
    }
  });

  test('should reject session ids with invalid characters', async ({ request }) => {
    const resp = await request.post(
      `${API_URL}/api/transcripts/upload-url/${encodeURIComponent('bad session id')}`
    );
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(String(body.error).toLowerCase()).toContain('invalid');
  });
});
