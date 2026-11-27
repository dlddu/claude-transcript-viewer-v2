import { test, expect, type Page, type Request } from '@playwright/test';


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
 * Records every network request the page makes and returns them once the transcript
 * (and any subagents) have rendered — which guarantees the manifest fetch and all
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
    const capture = await loadSessionAndCapture(page, 'session-abc123', 'agent-a1b2c3d');

    const manifestGets = backendManifestGets(capture);
    expect(manifestGets).toHaveLength(1);
    expect(manifestGets[0].url).toContain(`${MANIFEST_PATH_PREFIX}session-abc123`);

    expect(backendRequestsServingBytes(capture)).toHaveLength(0);

    const downloads = presignedDownloads(capture);
    expect(downloads).toHaveLength(3);
    expect(new Set(downloads.map((r) => r.url)).size).toBe(3);
  });

  test('keeps the backend request count constant while direct-S3 downloads scale with file count', async ({
    page,
  }) => {
    const withSubagents = await loadSessionAndCapture(page, 'session-abc123', 'agent-a1b2c3d');
    const mainOnly = await loadSessionAndCapture(page, 'session-xyz789');

    const manifestWithSubagents = backendManifestGets(withSubagents);
    const manifestMainOnly = backendManifestGets(mainOnly);

    expect(manifestWithSubagents).toHaveLength(1);
    expect(manifestMainOnly).toHaveLength(1);
    expect(manifestMainOnly.length).toBe(manifestWithSubagents.length);

    expect(backendRequestsServingBytes(withSubagents)).toHaveLength(0);
    expect(backendRequestsServingBytes(mainOnly)).toHaveLength(0);

    expect(presignedDownloads(withSubagents)).toHaveLength(3);
    expect(presignedDownloads(mainOnly)).toHaveLength(1);
  });
});
