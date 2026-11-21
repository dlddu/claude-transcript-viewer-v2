import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startBackend } from './support/backend-instance';
import {
  listS3Keys,
  newS3Client,
  transcriptLine,
  uploadFile,
} from './support/transcript-api';

/**
 * Retry-Safe Delete under S3 DeleteObject failure (LC-AC5)
 *
 * Owns `docs/transcript-viewer-test-lifecycle.md#시나리오 1-B` — the delete
 * *ordering* (objects → mapping) and retry safety, which are only observable
 * when `DeleteObject` actually fails.
 *
 * The failure comes from real storage rather than a mock: a second backend
 * instance runs with S3 credentials of a user whose policy denies
 * `s3:DeleteObject` (MinIO), then a healthy instance on the same SQLite file
 * retries. It needs `DELETE_DENIED_ACCESS_KEY_ID` /
 * `DELETE_DENIED_SECRET_ACCESS_KEY` (provisioned by the e2e-tests CI job) and
 * is skipped where the storage cannot enforce such a policy (LocalStack).
 */

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
