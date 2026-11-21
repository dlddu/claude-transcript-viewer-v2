import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startBackend } from './support/backend-instance';
import {
  API_URL,
  listS3Keys,
  newS3Client,
  transcriptLine,
  uploadFile,
} from './support/transcript-api';

/**
 * Retry-Safe Session Delete (LC-AC5)
 *
 * Purpose: exercise `DELETE /api/transcript/session/{sessionId}` end-to-end
 * against a running backend: upload a session through the presigned-URL flow,
 * delete it, and verify every trace is gone — the manifest stops resolving, the
 * session leaves the list, and no object remains in the bucket itself — while
 * other sessions stay intact.
 *
 * The 404 contract for a session that has no mapping is LC-AC4's job
 * (`transcript-not-found.spec.ts`); the 404s asserted below are read as
 * evidence that the mapping was dropped last, not as the not-found contract
 * itself.
 *
 * The delete *ordering* (objects → mapping) and retry safety need a real
 * `DeleteObject` failure. The last describe block produces it against the real
 * storage: a second backend instance runs with S3 credentials of a user whose
 * policy denies `s3:DeleteObject` (MinIO), then a healthy instance on the same
 * SQLite file retries. It needs `DELETE_DENIED_ACCESS_KEY_ID` /
 * `DELETE_DENIED_SECRET_ACCESS_KEY` (provisioned by the e2e-tests CI job) and
 * is skipped where the storage cannot enforce such a policy (LocalStack).
 *
 * Notes:
 * - Tests create their own throwaway sessions (unique id per attempt) instead
 *   of deleting seeded fixtures: other specs read those fixtures from the same
 *   shared backend, and CI retries would break on a fixed, already-deleted id.
 * - The S3-storage test talks to the bucket directly to prove objects are
 *   deleted from storage, not merely hidden by the dropped session mapping.
 */

test.describe('Transcript Delete API (LC-AC5)', () => {
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
      sessionId,
      transcriptLine('agent-del-1', 'msg-sub-001', 'subagent transcript to delete', '2026-07-01T00:00:01Z'),
      'subagents/agent-del-1.jsonl'
    );

    // Sanity - the session's file manifest reads back before deletion
    const before = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(before.status()).toBe(200);
    const manifest = await before.json();
    expect(manifest.session_id).toBe(sessionId);
    expect(manifest.main.url).toContain('X-Amz-');
    expect(manifest.subagents.length).toBe(1);

    // Act - delete the session
    const del = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(del.status()).toBe(200);
    expect(await del.json()).toEqual({ status: 'deleted', session_id: sessionId });

    // Assert - the mapping is gone: the session no longer resolves...
    const after = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
    expect(after.status()).toBe(404);

    // ...and no longer appears in the list. The list returns {session_id,
    // created_at} summary objects, so match against the ids.
    const list = await request.get(`${API_URL}/api/transcripts`);
    expect(list.status()).toBe(200);
    const listedIds = ((await list.json()) as Array<{ session_id: string }>).map(
      (s) => s.session_id
    );
    expect(listedIds).not.toContain(sessionId);
  });

  test('should remove the session files from S3 storage itself', async ({ request }) => {
    const sessionId = `delete-e2e-s3-${Date.now()}`;

    // Arrange - upload a main transcript and a subagent file, keeping their keys
    const mainKey = await uploadFile(
      request,
      sessionId,
      transcriptLine(sessionId, 'msg-001', 'main transcript stored in s3', '2026-07-01T00:00:00Z')
    );
    const subKey = await uploadFile(
      request,
      sessionId,
      transcriptLine('agent-del-s3', 'msg-sub-001', 'subagent stored in s3', '2026-07-01T00:00:01Z'),
      'subagents/agent-del-s3.jsonl'
    );

    // Both keys share the session's Hive directory
    const sessionPrefix = mainKey.slice(0, mainKey.lastIndexOf('/') + 1);
    expect(subKey.startsWith(sessionPrefix)).toBeTruthy();

    const s3 = newS3Client();
    try {
      // Sanity - both objects exist in the bucket before deletion
      const before = await listS3Keys(s3, sessionPrefix);
      expect(before).toEqual([mainKey, subKey].sort());

      // Act - delete the session through the API
      const del = await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
      expect(del.status()).toBe(200);

      // Assert - the bucket itself holds nothing under the session's directory,
      // proving the objects were deleted from storage rather than merely
      // hidden by the dropped session mapping.
      const after = await listS3Keys(s3, sessionPrefix);
      expect(after).toEqual([]);
    } finally {
      s3.destroy();
    }
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

test.describe('Retry-Safe Delete under S3 DeleteObject failure (LC-AC5)', () => {
  const deniedKeyId = process.env.DELETE_DENIED_ACCESS_KEY_ID;
  const deniedSecret = process.env.DELETE_DENIED_SECRET_ACCESS_KEY;

  test.skip(
    !deniedKeyId || !deniedSecret,
    'needs a storage user whose policy denies s3:DeleteObject (MinIO job only)'
  );

  test('should keep the session resolvable after a failed delete and finish it on retry', async ({ request }) => {
    const sessionId = `delete-fault-${Date.now()}`;
    const dir = mkdtempSync(path.join(tmpdir(), 'delete-fault-'));
    const dbPath = path.join(dir, 'fault.db');
    const s3 = newS3Client();
    const denied = await startBackend({
      dbPath,
      env: { AWS_ACCESS_KEY_ID: deniedKeyId!, AWS_SECRET_ACCESS_KEY: deniedSecret! },
    });
    let healthy: Awaited<ReturnType<typeof startBackend>> | undefined;
    let stopDenied = true;

    try {
      // Arrange - upload through the instance whose storage user may write but not delete
      const mainKey = await uploadFile(
        request,
        sessionId,
        transcriptLine(sessionId, 'msg-001', 'main kept by failed delete', '2026-07-01T00:00:00Z'),
        undefined,
        denied.baseURL
      );
      const subKey = await uploadFile(
        request,
        sessionId,
        transcriptLine('agent-fault-1', 'msg-sub-001', 'subagent kept by failed delete', '2026-07-01T00:00:01Z'),
        'subagents/agent-fault-1.jsonl',
        denied.baseURL
      );
      const sessionPrefix = mainKey.slice(0, mainKey.lastIndexOf('/') + 1);
      expect(subKey.startsWith(sessionPrefix)).toBeTruthy();

      // Act - the delete hits a real AccessDenied from storage
      const failed = await request.delete(`${denied.baseURL}/api/transcript/session/${sessionId}`);
      expect(failed.status()).toBe(500);

      // Assert - the mapping survived (objects are deleted before the mapping)
      // and the session still resolves with its main and subagent files...
      const manifestResp = await request.get(`${denied.baseURL}/api/transcript/session/${sessionId}`);
      expect(manifestResp.status()).toBe(200);
      const manifest = await manifestResp.json();
      expect(manifest.main.url).toContain('X-Amz-');
      expect(manifest.subagents.length).toBe(1);

      // ...and the bucket still holds every object.
      expect(await listS3Keys(s3, sessionPrefix)).toEqual([mainKey, subKey].sort());

      // Act - the failure clears: the same SQLite file is served by an instance
      // with healthy storage credentials, and the delete is retried.
      await denied.stop();
      stopDenied = false;
      healthy = await startBackend({ dbPath });
      const retried = await request.delete(`${healthy.baseURL}/api/transcript/session/${sessionId}`);
      expect(retried.status()).toBe(200);

      // Assert - objects and mapping are both gone.
      expect(await listS3Keys(s3, sessionPrefix)).toEqual([]);
      const after = await request.get(`${healthy.baseURL}/api/transcript/session/${sessionId}`);
      expect(after.status()).toBe(404);
    } finally {
      if (stopDenied) await denied.stop();
      await healthy?.stop();
      s3.destroy();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
