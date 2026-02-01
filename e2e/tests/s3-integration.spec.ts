import { test, expect } from '@playwright/test';

test.describe('S3 Integration - Backend API', () => {
  const baseURL = process.env.API_URL || 'http://localhost:3001';

  test('should connect to backend health endpoint', async ({ request }) => {
    // Arrange & Act - call health endpoint
    const response = await request.get(`${baseURL}/api/health`);

    // Assert - verify response is OK
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
  });

  test('should list transcripts from S3', async ({ request }) => {
    // Arrange - ensure LocalStack is running with test data
    const response = await request.get(`${baseURL}/api/transcripts`);

    // Act & Assert - verify response structure
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('files');
    expect(Array.isArray(data.files)).toBeTruthy();
  });

  test('should return transcript files with correct metadata', async ({ request }) => {
    // Arrange
    const response = await request.get(`${baseURL}/api/transcripts`);
    const data = await response.json();

    // Act - get first file
    const firstFile = data.files[0];

    // Assert - verify file metadata structure
    if (firstFile) {
      expect(firstFile).toHaveProperty('key');
      expect(firstFile).toHaveProperty('size');
      expect(firstFile).toHaveProperty('lastModified');
    }
  });

  test('should retrieve specific transcript from S3', async ({ request }) => {
    // Arrange - first get list of transcripts
    const listResponse = await request.get(`${baseURL}/api/transcripts`);
    const listData = await listResponse.json();

    // Skip if no files
    if (!listData.files || listData.files.length === 0) {
      test.skip();
      return;
    }

    const firstFileKey = listData.files[0].key;

    // Act - get specific transcript
    const transcriptResponse = await request.get(`${baseURL}/api/transcripts/${firstFileKey}`);

    // Assert - verify response
    expect(transcriptResponse.ok()).toBeTruthy();
    expect(transcriptResponse.headers()['content-type']).toContain('application/x-ndjson');

    const content = await transcriptResponse.text();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should parse JSONL transcript correctly', async ({ request }) => {
    // Arrange - get a transcript
    const listResponse = await request.get(`${baseURL}/api/transcripts`);
    const listData = await listResponse.json();

    if (!listData.files || listData.files.length === 0) {
      test.skip();
      return;
    }

    const firstFileKey = listData.files[0].key;
    const transcriptResponse = await request.get(`${baseURL}/api/transcripts/${firstFileKey}`);
    const content = await transcriptResponse.text();

    // Act - parse JSONL lines
    const lines = content.trim().split('\n');
    const messages = lines.map((line) => JSON.parse(line));

    // Assert - verify message structure
    expect(messages.length).toBeGreaterThan(0);

    const firstMessage = messages[0];
    expect(firstMessage).toHaveProperty('type');
    expect(firstMessage).toHaveProperty('timestamp');
  });

  test('should handle missing transcript gracefully', async ({ request }) => {
    // Arrange - request non-existent transcript
    const response = await request.get(`${baseURL}/api/transcripts/non-existent-file.jsonl`);

    // Act & Assert - verify error handling
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(500);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });
});

test.describe('S3 Integration - LocalStack', () => {
  test.skip('should connect to LocalStack S3', async ({ request }) => {
    // This test requires LocalStack to be running
    // It will be enabled in CI with docker-compose

    // Arrange - LocalStack endpoint
    const localstackEndpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

    // Act - try to list buckets
    const response = await request.get(`${localstackEndpoint}/health`);

    // Assert - verify LocalStack is running
    expect(response.ok()).toBeTruthy();
  });

  test.skip('should have test bucket created', async ({ request }) => {
    // This test will be enabled when LocalStack setup is complete

    // Arrange
    const baseURL = process.env.API_URL || 'http://localhost:3001';

    // Act - list transcripts (should work if bucket exists)
    const response = await request.get(`${baseURL}/api/transcripts`);

    // Assert
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('files');
  });
});

test.describe('S3 Integration - Frontend', () => {
  test('should load transcripts in UI from backend', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act - wait for transcript list to load from API
    await page.waitForResponse(
      (response) => response.url().includes('/api/transcripts') && response.status() === 200,
      { timeout: 10000 }
    );

    // Assert - verify transcripts are displayed
    const transcriptList = page.getByTestId('transcript-list');
    await expect(transcriptList).toBeVisible();
  });

  test('should display loading state while fetching transcripts', async ({ page }) => {
    // Arrange & Act
    await page.goto('/');

    // Assert - verify loading indicator appears
    const loadingIndicator = page.getByTestId('loading-indicator');
    await expect(loadingIndicator).toBeVisible();
  });

  test('should display error when backend is unavailable', async ({ page, context }) => {
    // Arrange - block API requests
    await context.route('**/api/transcripts', (route) => route.abort());

    // Act
    await page.goto('/');

    // Assert - verify error message is displayed
    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
  });

  test('should fetch and display transcript content when clicked', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 10000 });

    // Act - click on transcript and wait for content to load
    const firstTranscript = page.getByTestId('transcript-item').first();
    const transcriptKey = await firstTranscript.getAttribute('data-key');

    await firstTranscript.click();

    await page.waitForResponse(
      (response) => response.url().includes(`/api/transcripts/${transcriptKey}`) && response.ok(),
      { timeout: 10000 }
    );

    // Assert - verify transcript content is displayed
    const transcriptViewer = page.getByTestId('transcript-viewer');
    await expect(transcriptViewer).toBeVisible();

    const messages = page.getByTestId('transcript-message');
    await expect(messages.first()).toBeVisible();
  });
});

test.describe('S3 Integration - Performance', () => {
  test('should load transcript list within acceptable time', async ({ page }) => {
    // Arrange
    const startTime = Date.now();

    // Act
    await page.goto('/');
    await page.waitForResponse((response) => response.url().includes('/api/transcripts'));

    const loadTime = Date.now() - startTime;

    // Assert - should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should load transcript content within acceptable time', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 10000 });

    // Act
    const startTime = Date.now();
    await page.getByTestId('transcript-item').first().click();
    await page.waitForSelector('[data-testid="transcript-message"]');

    const loadTime = Date.now() - startTime;

    // Assert - should load within 2 seconds
    expect(loadTime).toBeLessThan(2000);
  });
});
