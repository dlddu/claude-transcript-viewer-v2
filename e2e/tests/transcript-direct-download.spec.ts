import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * Transcript Direct Download (LC-AC3)
 *
 * Verifies the core LC-AC3 guarantee end-to-end in a real browser: the backend
 * serves only a small manifest of presigned S3 URLs, and every transcript file
 * (main + subagents) is downloaded by the browser directly from S3. Transcript
 * bytes never flow through the backend pod — that is what makes the app light
 * regardless of transcript size (value V3).
 *
 * Sibling coverage:
 *  - backend/s3_test.go / server_test.go / s3_integration_test.go assert the
 *    manifest shape + short presigned TTL.
 *  - frontend/src/utils/loadTranscript.test.ts asserts the same backend-vs-S3
 *    routing with fetch mocks at the unit level.
 * This spec adds the missing browser-level assertion so LC-AC3 is covered by a
 * dedicated E2E, not merely traversed by the lookup/timeline specs.
 *
 * Fixtures (seeded via `server seed --dir e2e/fixtures`):
 *  - session-abc123: main + 2 subagents (agent-a1b2c3d, agent-xyz789)
 *  - session-xyz789: main only, no subagents
 */

const MANIFEST_PATH_PREFIX = '/api/transcript/session/';

// AWS SigV4 presigned URLs (real S3 and MinIO alike) always carry this query
// parameter; the unit test classifies direct-S3 downloads the same way.
function isPresignedS3(url: string): boolean {
  return url.includes('X-Amz-Signature');
}

interface CapturedRequest {
  url: string;
  method: string;
}

interface LoadCapture {
  appOrigin: string;
  requests: CapturedRequest[];
}

/**
 * Loads a session through the Session ID lookup flow while recording every
 * network request the page makes, then returns them once the transcript (and
 * any subagents) have rendered — which guarantees the manifest fetch and all
 * file downloads have completed. Navigating to '/' reloads the bundle, so the
 * module-level transcript cache starts empty on each call.
 */
async function loadSessionAndCapture(
  page: Page,
  sessionId: string,
  subagentLabel?: string
): Promise<LoadCapture> {
  const requests: CapturedRequest[] = [];
  const handler = (req: Request) => requests.push({ url: req.url(), method: req.method() });
  page.on('request', handler);

  let appOrigin = '';
  try {
    await page.goto('/');
    appOrigin = new URL(page.url()).origin;

    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }

    await page.getByTestId('session-id-input').fill(sessionId);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    if (subagentLabel) {
      // Waiting for a subagent to render proves its file was downloaded.
      await expect(page.getByText(subagentLabel).first()).toBeVisible();
    }
    await page.waitForLoadState('networkidle');
  } finally {
    page.off('request', handler);
  }

  return { appOrigin, requests };
}

function backendManifestGets({ appOrigin, requests }: LoadCapture): CapturedRequest[] {
  return requests.filter((r) => {
    if (r.method !== 'GET') return false;
    const url = new URL(r.url);
    return url.origin === appOrigin && url.pathname.startsWith(MANIFEST_PATH_PREFIX);
  });
}

// The violation the AC forbids: the backend origin serving transcript bytes
// (a presigned URL or a .jsonl file). This must always be empty.
function backendRequestsServingBytes({ appOrigin, requests }: LoadCapture): CapturedRequest[] {
  return requests.filter((r) => {
    const url = new URL(r.url);
    if (url.origin !== appOrigin) return false;
    return isPresignedS3(r.url) || url.pathname.endsWith('.jsonl');
  });
}

function presignedDownloads({ appOrigin, requests }: LoadCapture): CapturedRequest[] {
  return requests.filter(
    (r) => r.method === 'GET' && isPresignedS3(r.url) && new URL(r.url).origin !== appOrigin
  );
}

test.describe('Transcript Direct Download (LC-AC3)', () => {
  test('downloads every transcript file directly from presigned S3, never through the backend', async ({
    page,
  }) => {
    // session-abc123 has a main file plus two subagent files.
    const capture = await loadSessionAndCapture(page, 'session-abc123', 'agent-a1b2c3d');

    // Backend is hit exactly once, only for the manifest of this session.
    const manifestGets = backendManifestGets(capture);
    expect(manifestGets).toHaveLength(1);
    expect(manifestGets[0].url).toContain(`${MANIFEST_PATH_PREFIX}session-abc123`);

    // The backend never serves transcript bytes (no presigned URL, no .jsonl).
    expect(backendRequestsServingBytes(capture)).toHaveLength(0);

    // Main + both subagents are each fetched from their own presigned S3 URL,
    // off the app origin, exactly once (no duplicated downloads).
    const downloads = presignedDownloads(capture);
    expect(downloads).toHaveLength(3);
    expect(new Set(downloads.map((r) => r.url)).size).toBe(3);
  });

  test('keeps the backend request count constant while direct-S3 downloads scale with file count', async ({
    page,
  }) => {
    // Multi-file session (main + 2 subagents).
    const withSubagents = await loadSessionAndCapture(page, 'session-abc123', 'agent-a1b2c3d');
    // Single-file session (main only). Re-navigating resets the bundle cache.
    const mainOnly = await loadSessionAndCapture(page, 'session-xyz789');

    const manifestWithSubagents = backendManifestGets(withSubagents);
    const manifestMainOnly = backendManifestGets(mainOnly);

    // The backend request stays a single manifest call regardless of how many
    // files the session has — the pod's load does not grow with transcript size.
    expect(manifestWithSubagents).toHaveLength(1);
    expect(manifestMainOnly).toHaveLength(1);
    expect(manifestMainOnly.length).toBe(manifestWithSubagents.length);

    // Neither load routes any transcript bytes through the backend.
    expect(backendRequestsServingBytes(withSubagents)).toHaveLength(0);
    expect(backendRequestsServingBytes(mainOnly)).toHaveLength(0);

    // Only the direct-S3 downloads scale: 3 files vs 1 file.
    expect(presignedDownloads(withSubagents)).toHaveLength(3);
    expect(presignedDownloads(mainOnly)).toHaveLength(1);
  });
});
