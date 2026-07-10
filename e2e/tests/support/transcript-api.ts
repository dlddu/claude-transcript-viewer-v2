import { expect, type APIRequestContext } from '@playwright/test';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Shared support for the transcript lifecycle API specs
 * (upload-url / session-prefix / delete / not-found).
 *
 * Each LC-AC owns exactly one spec file, so the fixtures they all need — the
 * throwaway-session helpers and the direct-S3 client used to prove that objects
 * really land in (and leave) the bucket — live here instead of being copied
 * between specs. Not a spec: Playwright's default testMatch only collects
 * `*.spec.ts`.
 *
 * Notes:
 * - Specs create their own throwaway sessions (unique id per attempt) and clean
 *   up afterwards, so the shared backend stays intact for other specs and CI
 *   retries never collide with a fixed id.
 * - In the kind job the presigned URL points at the cluster-internal S3 host
 *   (http://localstack:4566). CI port-forwards that endpoint on the same port,
 *   so the host is rewritten to localhost before the PUT. LocalStack skips S3
 *   signature validation by default, so the rewrite does not invalidate the
 *   signed request; against MinIO the URL is already localhost and unchanged.
 */

export const API_URL = process.env.API_URL || 'http://localhost:3000';
export const S3_ENDPOINT = process.env.AWS_ENDPOINT_URL || 'http://localhost:9000';
export const S3_BUCKET = process.env.S3_BUCKET || 'test-transcripts';

export function transcriptLine(
  sessionId: string,
  uuid: string,
  text: string,
  timestamp: string
): string {
  return JSON.stringify({
    type: 'user',
    sessionId,
    uuid,
    parentUuid: null,
    timestamp,
    message: { role: 'user', content: text },
  });
}

export function reachableFromHost(presignedUrl: string): string {
  const url = new URL(presignedUrl);
  url.hostname = 'localhost';
  return url.toString();
}

/** Everything up to and including "session_id=<id>/" — the session's Hive directory. */
export function hiveDirOf(key: string, sessionId: string): string {
  const marker = `session_id=${sessionId}/`;
  const idx = key.indexOf(marker);
  expect(idx, `key "${key}" contains "${marker}"`).toBeGreaterThanOrEqual(0);
  return key.slice(0, idx + marker.length);
}

export function newS3Client(): S3Client {
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

export async function listS3Keys(s3: S3Client, prefix: string): Promise<string[]> {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }));
  return (out.Contents ?? []).map((obj) => obj.Key ?? '').sort();
}

/** Issues a presigned PUT URL, uploads `body` to it, and returns the stored key. */
export async function uploadFile(
  request: APIRequestContext,
  sessionId: string,
  body: string,
  fileName?: string
): Promise<string> {
  const query = fileName ? `?file_name=${encodeURIComponent(fileName)}` : '';
  const urlResp = await request.post(`${API_URL}/api/transcripts/upload-url/${sessionId}${query}`);
  expect(urlResp.ok(), `upload-url for ${sessionId} ${fileName ?? '(main)'}`).toBeTruthy();
  const { url, key } = await urlResp.json();

  const putResp = await request.put(reachableFromHost(url), { data: body });
  expect(putResp.ok(), `presigned PUT for ${sessionId} ${fileName ?? '(main)'}`).toBeTruthy();
  return key;
}

/** Best-effort teardown; a 404 here just means the spec already deleted it. */
export async function cleanupSession(
  request: APIRequestContext,
  sessionId: string
): Promise<void> {
  await request.delete(`${API_URL}/api/transcript/session/${sessionId}`);
}
