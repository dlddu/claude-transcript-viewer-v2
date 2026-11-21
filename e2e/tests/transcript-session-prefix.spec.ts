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

test.describe('Session Prefix Reuse (LC-AC2)', () => {
  test("should reuse one Hive directory for all of a session's files", async ({ request }) => {
    const sessionId = `upload-e2e-prefix-${Date.now()}`;
    const s3 = newS3Client();

    try {
      const mainResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
      const main = await mainResp.json();
      const sessionDir = hiveDirOf(main.key, sessionId);

      const subResp = await request.post(
        `${API_URL}/api/transcripts/upload-url/${sessionId}?file_name=${encodeURIComponent(
          'subagents/agent-e2e-1.jsonl'
        )}`
      );
      const sub = await subResp.json();
      expect(sub.key).toBe(`${sessionDir}subagents/agent-e2e-1.jsonl`);

      const bareResp = await request.post(
        `${API_URL}/api/transcripts/upload-url/${sessionId}?file_name=agent-e2e-2.jsonl`
      );
      const bare = await bareResp.json();
      expect(bare.key).toBe(`${sessionDir}agent-e2e-2.jsonl`);

      // Re-issuing the main upload URL returns the identical key: the prefix
      // comes from the persisted mapping, not from the current clock.
      const againResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
      const again = await againResp.json();
      expect(again.key).toBe(main.key);

      for (const [target, uuid] of [
        [main, 'msg-main'],
        [sub, 'msg-sub'],
        [bare, 'msg-bare'],
      ] as const) {
        const putResp = await request.put(reachableFromHost(target.url), {
          data: transcriptLine(sessionId, uuid, `body for ${target.key}`, '2026-07-01T00:00:00Z'),
        });
        expect(putResp.ok(), `presigned PUT for ${target.key}`).toBeTruthy();
      }
      const stored = await listS3Keys(s3, sessionDir);
      expect(stored).toEqual([main.key, sub.key, bare.key].sort());

      const manifest = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
      expect(manifest.status()).toBe(200);
      const manifestBody = await manifest.json();
      expect(manifestBody.main.key).toBe(main.key);
      const subagentKeys = manifestBody.subagents.map((s: { key: string }) => s.key).sort();
      expect(subagentKeys).toEqual([sub.key, bare.key].sort());
    } finally {
      s3.destroy();
      await cleanupSession(request, sessionId);
    }
  });
});
