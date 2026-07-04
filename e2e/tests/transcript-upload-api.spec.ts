import { test, expect, type APIRequestContext } from '@playwright/test';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Transcript Upload API E2E Tests
 *
 * Purpose: Exercise POST /api/transcripts/upload-url/{sessionId} as a
 * first-class contract, covering the two acceptance criteria that were
 * previously only verified indirectly through the seed subcommand:
 *
 * - LC-AC1 (docs/transcript-viewer-prd-lifecycle.md): the endpoint returns a
 *   presigned PUT URL whose key follows the Hive partition convention, the
 *   PUT lands the object in the bucket at that exact key, and the
 *   session_id → s3_prefix mapping is persisted (observable because the
 *   download manifest later resolves the same key from SQLite).
 * - LC-AC2: every later upload for the same session — subagents/<name>.jsonl,
 *   bare agent-<name>.jsonl, or a re-issued main URL — reuses the stored
 *   prefix so all of a session's files share one Hive directory.
 *
 * Test Status: ACTIVE
 *
 * Notes:
 * - Tests create their own throwaway sessions (unique id per attempt) and
 *   delete them afterwards so the shared backend stays clean for other specs
 *   and CI retries never collide with a fixed id.
 * - In the kind job the presigned URL points at the cluster-internal S3 host
 *   (http://localstack:4566). CI port-forwards that endpoint on the same
 *   port, so the host is rewritten to localhost before the PUT — same
 *   approach as transcript-delete-api.spec.ts.
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const S3_ENDPOINT = process.env.AWS_ENDPOINT_URL || 'http://localhost:9000';
const S3_BUCKET = process.env.S3_BUCKET || 'test-transcripts';

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

/** Everything up to and including "session_id=<id>/" — the session's Hive directory. */
function hiveDirOf(key: string, sessionId: string): string {
  const marker = `session_id=${sessionId}/`;
  const idx = key.indexOf(marker);
  expect(idx, `key "${key}" contains "${marker}"`).toBeGreaterThanOrEqual(0);
  return key.slice(0, idx + marker.length);
}

function newS3Client(): S3Client {
  return new S3Client({
    endpoint: S3_ENDPOINT,
    region: process.env.AWS_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
    },
  });
}

async function listS3Keys(s3: S3Client, prefix: string): Promise<string[]> {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }));
  return (out.Contents ?? []).map((obj) => obj.Key ?? '').sort();
}

async function cleanup(request: APIRequestContext, sessionId: string): Promise<void> {
  await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
}

test.describe('Transcript Upload API E2E', () => {
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
      await cleanup(request, sessionId);
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

      // And the session is listed.
      const list = await request.get(`${API_URL}/api/transcripts`);
      expect(list.status()).toBe(200);
      expect(await list.json()).toContain(sessionId);
    } finally {
      s3.destroy();
      await cleanup(request, sessionId);
    }
  });

  test('should reuse one Hive directory for all of a session\'s files', async ({ request }) => {
    const sessionId = `upload-e2e-prefix-${Date.now()}`;
    const s3 = newS3Client();

    try {
      // Main transcript establishes the session's Hive directory.
      const mainResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}`);
      const main = await mainResp.json();
      const sessionDir = hiveDirOf(main.key, sessionId);

      // A subagents/ file reuses the stored prefix.
      const subResp = await request.post(
        `${API_URL}/api/transcripts/upload-url/${sessionId}?file_name=${encodeURIComponent(
          'subagents/agent-e2e-1.jsonl'
        )}`
      );
      const sub = await subResp.json();
      expect(sub.key).toBe(`${sessionDir}subagents/agent-e2e-1.jsonl`);

      // A bare agent-<id>.jsonl in the session directory reuses it too.
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

      // Upload all three and verify the bucket holds them under one directory.
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

      // The manifest surfaces both subagent files alongside the main one.
      const manifest = await request.get(`${API_URL}/api/transcript/session/${sessionId}`);
      expect(manifest.status()).toBe(200);
      const manifestBody = await manifest.json();
      expect(manifestBody.main.key).toBe(main.key);
      const subagentKeys = manifestBody.subagents.map((s: { key: string }) => s.key).sort();
      expect(subagentKeys).toEqual([sub.key, bare.key].sort());
    } finally {
      s3.destroy();
      await cleanup(request, sessionId);
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
      await cleanup(request, sessionId);
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
