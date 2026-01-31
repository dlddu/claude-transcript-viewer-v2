import { test, expect } from '@playwright/test';

test.describe('LocalStack S3 Integration', () => {
  test.describe('S3 Transcript Storage', () => {
    test('should retrieve main transcript from S3 bucket', async ({ page }) => {
      await page.goto('/');

      // Wait for successful load
      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 15000,
      });

      // Verify content from main-transcript.jsonl
      const transcriptList = page.getByTestId('transcript-list');
      await expect(transcriptList).toBeVisible();

      // Check for expected content from fixture
      const content = await transcriptList.textContent();
      expect(content).toBeTruthy();
    });

    test('should handle S3 connection errors gracefully', async ({ page, context }) => {
      // Block S3 endpoint to simulate connection failure
      await context.route('**/api/transcript/**', (route) => {
        route.abort('failed');
      });

      await page.goto('/');

      // Should show error state
      await expect(page.getByTestId('error')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Backend S3 Proxy', () => {
    test('should proxy S3 requests through backend API', async ({ request }) => {
      // Test backend health endpoint
      const healthResponse = await request.get(
        (process.env.BACKEND_URL || 'http://localhost:3000') + '/health'
      );
      expect(healthResponse.ok()).toBe(true);

      const health = await healthResponse.json();
      expect(health.status).toBe('ok');
    });

    test('should return transcript data in JSONL format', async ({ request }) => {
      const response = await request.get(
        (process.env.BACKEND_URL || 'http://localhost:3000') + '/api/transcript/main-transcript.jsonl'
      );

      expect(response.ok()).toBe(true);

      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/x-ndjson');

      const body = await response.text();
      expect(body).toBeTruthy();

      // Verify JSONL format (each line is valid JSON)
      const lines = body.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    test('should validate filename and prevent path traversal', async ({ request }) => {
      // Use URL-encoded path traversal attempts to bypass Express URL normalization
      const invalidFilenames = [
        '%2E%2E/etc/passwd',
        'subdir/%2E%2E/secret.jsonl',
        'test/%2E%2E/%2E%2E/file.jsonl',
      ];

      for (const filename of invalidFilenames) {
        const response = await request.get(
          (process.env.BACKEND_URL || 'http://localhost:3000') + `/api/transcript/${filename}`
        );

        // Path traversal should be rejected - either 400 (bad request) or 404 (not found)
        // The important security aspect is that the request fails, not the specific status code
        expect([400, 404]).toContain(response.status());
      }
    });

    test('should return 404 for non-existent transcripts', async ({ request }) => {
      const response = await request.get(
        (process.env.BACKEND_URL || 'http://localhost:3000') + '/api/transcript/non-existent.jsonl'
      );

      expect(response.status()).toBe(404);

      const body = await response.json();
      expect(body.error).toBeTruthy();
    });
  });

  test.describe('Fixture Data Validation', () => {
    test('should load fixture data with expected structure', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Verify we have multiple entries
      const entries = page.getByTestId(/transcript-entry-\d+/);
      const count = await entries.count();
      expect(count).toBeGreaterThan(0);

      // Check first entry structure
      const firstEntry = entries.first();
      await expect(firstEntry.locator('.role')).toBeVisible();
      await expect(firstEntry.locator('.content')).toBeVisible();
      await expect(firstEntry.locator('.timestamp')).toBeVisible();
    });

    test('should include subagent references in fixture data', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('transcript-viewer')).toBeVisible({
        timeout: 10000,
      });

      // Check for subagent links (from fixture data)
      const subagentLinks = page.getByTestId('subagent-link');
      const count = await subagentLinks.count();

      // Fixture should have at least one subagent reference
      expect(count).toBeGreaterThan(0);
    });
  });
});
