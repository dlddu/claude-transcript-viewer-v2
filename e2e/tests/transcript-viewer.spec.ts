import { test, expect } from '@playwright/test';

test.describe('Transcript Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display application title', async ({ page }) => {
    // Arrange - page is already loaded via beforeEach

    // Act - get the heading element
    const heading = page.getByRole('heading', { name: /claude transcript viewer/i });

    // Assert - verify heading is visible
    await expect(heading).toBeVisible();
  });

  test('should display welcome message', async ({ page }) => {
    // Arrange - page is already loaded

    // Act - get the welcome text
    const welcomeText = page.getByText(/transcript viewer with s3 integration/i);

    // Assert - verify text is visible
    await expect(welcomeText).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    // Arrange & Act - get page title
    const title = await page.title();

    // Assert - verify title
    expect(title).toBe('Claude Transcript Viewer');
  });

  test('should load without console errors', async ({ page }) => {
    // Arrange - setup console error listener
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Act - reload the page
    await page.reload();

    // Assert - verify no console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('should be responsive', async ({ page }) => {
    // Arrange - set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Act - get heading on mobile
    const heading = page.getByRole('heading', { name: /claude transcript viewer/i });

    // Assert - verify heading is still visible on mobile
    await expect(heading).toBeVisible();
  });
});

test.describe('Transcript List', () => {
  test('should display transcript list component when implemented', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act - try to find transcript list (will fail until implemented)
    const transcriptList = page.getByTestId('transcript-list');

    // Assert - this test will fail initially (Red phase of TDD)
    // Once the component is implemented, this should pass
    await expect(transcriptList).toBeVisible();
  });

  test('should load transcripts from API when implemented', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act - wait for transcripts to load
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });

    // Assert - verify at least one transcript is displayed
    const transcriptItems = page.getByTestId('transcript-item');
    await expect(transcriptItems.first()).toBeVisible();
  });

  test('should display transcript metadata when implemented', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act - wait for transcript items
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });

    // Assert - verify metadata is displayed (filename, size, date)
    const firstTranscript = page.getByTestId('transcript-item').first();
    await expect(firstTranscript.getByTestId('transcript-filename')).toBeVisible();
    await expect(firstTranscript.getByTestId('transcript-size')).toBeVisible();
    await expect(firstTranscript.getByTestId('transcript-date')).toBeVisible();
  });
});

test.describe('Transcript Viewer', () => {
  test('should open transcript when clicked', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });

    // Act - click on first transcript
    await page.getByTestId('transcript-item').first().click();

    // Assert - verify transcript viewer is displayed
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display transcript messages', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });

    // Act - open transcript
    await page.getByTestId('transcript-item').first().click();

    // Assert - verify messages are displayed
    const messages = page.getByTestId('transcript-message');
    await expect(messages.first()).toBeVisible();
  });

  test('should display user and assistant messages differently', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });
    await page.getByTestId('transcript-item').first().click();

    // Act - get messages by role
    const userMessage = page.getByTestId('message-user').first();
    const assistantMessage = page.getByTestId('message-assistant').first();

    // Assert - verify both message types are visible
    await expect(userMessage).toBeVisible();
    await expect(assistantMessage).toBeVisible();
  });

  test('should display message timestamps', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });
    await page.getByTestId('transcript-item').first().click();

    // Act - get first message timestamp
    const timestamp = page.getByTestId('message-timestamp').first();

    // Assert - verify timestamp is visible
    await expect(timestamp).toBeVisible();
  });
});

test.describe('Subagent Transcripts', () => {
  test('should display subagent indicator when present', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });

    // Act - look for transcript with subagent
    const subagentIndicator = page.getByTestId('subagent-indicator').first();

    // Assert - verify subagent indicator is visible
    await expect(subagentIndicator).toBeVisible();
  });

  test('should expand subagent transcript when clicked', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });
    await page.getByTestId('transcript-item').first().click();

    // Act - click subagent indicator
    await page.getByTestId('subagent-indicator').first().click();

    // Assert - verify subagent transcript is expanded
    await expect(page.getByTestId('subagent-transcript')).toBeVisible();
  });

  test('should display subagent messages', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.waitForSelector('[data-testid="transcript-item"]', { timeout: 5000 });
    await page.getByTestId('transcript-item').first().click();
    await page.getByTestId('subagent-indicator').first().click();

    // Act - get subagent messages
    const subagentMessages = page.getByTestId('subagent-message');

    // Assert - verify at least one subagent message is displayed
    await expect(subagentMessages.first()).toBeVisible();
  });
});
