import { test, expect } from '../fixtures/test-fixtures';

/**
 * E2E Tests for Claude Transcript Viewer
 * Tests the complete user flow from loading transcripts to displaying messages
 */

test.describe('Transcript Viewer - Basic Functionality', () => {
  test.beforeEach(async ({ loadSampleData }) => {
    // Load sample transcripts into LocalStack S3 before each test
    await loadSampleData();
  });

  test('should display the application title', async ({ page }) => {
    await page.goto('/');

    // Assert: Application title is visible
    await expect(page).toHaveTitle(/Claude Transcript Viewer/i);
    await expect(page.locator('h1')).toContainText('Claude Transcript Viewer');
  });

  test('should load and display main transcript messages', async ({ page, bucketName, mainTranscriptKey }) => {
    // Arrange: Navigate to viewer with transcript URL
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);

    // Act: Wait for messages to load
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: All message types are displayed
    await expect(page.locator('[data-testid="message-type-system"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-type-human"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-type-assistant"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-type-tool_use"]')).toBeVisible();
  });

  test('should display message content correctly', async ({ page, bucketName, mainTranscriptKey }) => {
    // Arrange & Act
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Human message content is correct
    const humanMessage = page.locator('[data-testid="message-type-human"]').first();
    await expect(humanMessage).toContainText('Can you help me build a transcript viewer app?');

    // Assert: Assistant message content is correct
    const assistantMessage = page.locator('[data-testid="message-type-assistant"]').first();
    await expect(assistantMessage).toContainText("I'd be happy to help you build a transcript viewer app!");
  });

  test('should display timestamps for each message', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Timestamps are displayed
    const timestamps = page.locator('[data-testid="message-timestamp"]');
    await expect(timestamps.first()).toBeVisible();

    // Assert: Timestamp format is correct (should show relative time or formatted date)
    const timestampText = await timestamps.first().textContent();
    expect(timestampText).toBeTruthy();
  });
});

test.describe('Transcript Viewer - Tool Use Messages', () => {
  test.beforeEach(async ({ loadSampleData }) => {
    await loadSampleData();
  });

  test('should display tool use messages with proper formatting', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Tool use message is displayed
    const toolUseMessage = page.locator('[data-testid="message-type-tool_use"]').first();
    await expect(toolUseMessage).toBeVisible();

    // Assert: Tool name is displayed
    await expect(toolUseMessage).toContainText('task');
  });

  test('should display tool results linked to tool use', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Tool result message is displayed
    const toolResultMessage = page.locator('[data-testid="message-type-tool_result"]').first();
    await expect(toolResultMessage).toBeVisible();
    await expect(toolResultMessage).toContainText('Task created successfully');
  });

  test('should allow expanding/collapsing tool input', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    const toolUseMessage = page.locator('[data-testid="message-type-tool_use"]').first();

    // Assert: Expand button exists
    const expandButton = toolUseMessage.locator('[data-testid="expand-tool-input"]');
    await expect(expandButton).toBeVisible();

    // Act: Click expand button
    await expandButton.click();

    // Assert: Tool input is expanded and visible
    const toolInput = toolUseMessage.locator('[data-testid="tool-input-content"]');
    await expect(toolInput).toBeVisible();
    await expect(toolInput).toContainText('Create a modern transcript viewer web application');
  });
});

test.describe('Transcript Viewer - Subagent Transcripts', () => {
  test.beforeEach(async ({ loadSampleData }) => {
    await loadSampleData();
  });

  test('should display subagent transcript indicator', async ({ page, bucketName, subagentTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${subagentTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Subagent indicator is visible
    const subagentIndicator = page.locator('[data-testid="subagent-indicator"]');
    await expect(subagentIndicator).toBeVisible();
  });

  test('should display parent task ID for subagent messages', async ({ page, bucketName, subagentTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${subagentTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Parent task ID is displayed
    const parentTaskId = page.locator('[data-testid="parent-task-id"]').first();
    await expect(parentTaskId).toBeVisible();
    await expect(parentTaskId).toContainText('task-001');
  });

  test('should allow navigation between main and subagent transcripts', async ({ page, bucketName, mainTranscriptKey, subagentTranscriptKey }) => {
    // Start with main transcript
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Act: Click on task link to view subagent transcript
    const taskLink = page.locator('[data-testid="task-link"]').first();
    await expect(taskLink).toBeVisible();
    await taskLink.click();

    // Assert: Navigated to subagent transcript
    await expect(page).toHaveURL(new RegExp(subagentTranscriptKey));
    await expect(page.locator('[data-testid="subagent-indicator"]')).toBeVisible();
  });
});

test.describe('Transcript Viewer - Error Handling', () => {
  test('should display error message when transcript not found', async ({ page, bucketName }) => {
    await page.goto(`/?bucket=${bucketName}&key=non-existent.jsonl`);

    // Assert: Error message is displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/not found|error loading/i);
  });

  test('should display error message when bucket does not exist', async ({ page }) => {
    await page.goto('/?bucket=non-existent-bucket&key=test.jsonl');

    // Assert: Error message is displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
  });

  test('should handle invalid JSONL format gracefully', async ({ page, s3Client, bucketName }) => {
    // Arrange: Upload invalid JSONL
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'invalid.jsonl',
      Body: 'not a valid json\n{broken json}',
      ContentType: 'application/jsonl',
    }));

    // Act
    await page.goto(`/?bucket=${bucketName}&key=invalid.jsonl`);

    // Assert: Error message is displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/parse error|invalid format/i);
  });
});

test.describe('Transcript Viewer - UI Interactions', () => {
  test.beforeEach(async ({ loadSampleData }) => {
    await loadSampleData();
  });

  test('should support searching messages', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Act: Enter search query
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('transcript viewer');

    // Assert: Only matching messages are visible
    const visibleMessages = page.locator('[data-testid^="message-type-"]:visible');
    const count = await visibleMessages.count();
    expect(count).toBeGreaterThan(0);

    // Assert: All visible messages contain search term
    for (let i = 0; i < count; i++) {
      const text = await visibleMessages.nth(i).textContent();
      expect(text?.toLowerCase()).toContain('transcript viewer');
    }
  });

  test('should support filtering by message type', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Act: Filter to show only assistant messages
    const filterSelect = page.locator('[data-testid="message-type-filter"]');
    await filterSelect.selectOption('assistant');

    // Assert: Only assistant messages are visible
    const visibleMessages = page.locator('[data-testid^="message-type-"]:visible');
    const count = await visibleMessages.count();

    for (let i = 0; i < count; i++) {
      const messageType = await visibleMessages.nth(i).getAttribute('data-testid');
      expect(messageType).toBe('message-type-assistant');
    }
  });

  test('should display message count', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Message count is displayed
    const messageCount = page.locator('[data-testid="message-count"]');
    await expect(messageCount).toBeVisible();

    const countText = await messageCount.textContent();
    expect(countText).toMatch(/\d+ messages?/i);
  });
});

test.describe('Transcript Viewer - Mobile Responsiveness', () => {
  test.beforeEach(async ({ loadSampleData }) => {
    await loadSampleData();
  });

  test('should be responsive on mobile devices', async ({ page, bucketName, mainTranscriptKey }) => {
    // Arrange: Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Act
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Content is visible and not overflowing
    const messageList = page.locator('[data-testid="message-list"]');
    await expect(messageList).toBeVisible();

    const boundingBox = await messageList.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(375);
  });

  test('should have touch-friendly controls on mobile', async ({ page, bucketName, mainTranscriptKey }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/?bucket=${bucketName}&key=${mainTranscriptKey}`);
    await page.waitForSelector('[data-testid="message-list"]');

    // Assert: Interactive elements are large enough for touch
    const expandButtons = page.locator('[data-testid="expand-tool-input"]');
    const firstButton = expandButtons.first();

    if (await firstButton.isVisible()) {
      const boundingBox = await firstButton.boundingBox();
      // Touch targets should be at least 44x44 pixels
      expect(boundingBox?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
