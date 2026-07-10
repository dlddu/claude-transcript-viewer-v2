import { test, expect } from '@playwright/test';

/**
 * Tool Call Display (VW-AC4)
 *
 * VW-AC4 하나가 두 가지를 함께 보장한다: `tool_use` 메시지가 타임라인에 툴 이름을 인라인으로
 * 표시하고(Task 툴은 `Task [subagent_type]`, subagent_type이 없으면 `Task`만, 비-Task 툴은
 * 이름만), 클릭하면 상세 뷰에서 툴 입력을 포맷된 JSON으로 보여주고 다시 클릭하면 축소된다.
 * 예전에는 두 스펙 파일로 갈려 있었으나 AC 하나가 스펙 하나를 소유하도록 병합했다.
 *
 * 두 describe는 서로 다른 픽스처를 읽으므로 beforeEach를 각자 유지한다.
 *
 * Test Status: ACTIVE
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - msg-002 단일 tool_use (DataAnalyzer), msg-005 다중 tool_use (FileReader, SchemaValidator)
 * - e2e/fixtures/session-task-subagent.jsonl
 *   - msg-002 subagent_type "code"를 가진 Task, msg-005 subagent_type 없는 Task,
 *     msg-008 FileReader (대조군)
 *
 * Linear: DLD-252 (tool detail view), DLD-356/357/358 (Task subagent_type)
 */

test.describe('Tool Detail View (VW-AC4)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with tool_use
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    // Wait for transcript to load
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display tool_use message in timeline', async ({ page }) => {
    // Arrange & Assert - Timeline should show the message with tool_use
    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();

    // Message with tool_use should be present
    await expect(timeline.getByText(/I'd be happy to help you analyze the dataset/i)).toBeVisible();

    // Tool indicator should be visible (e.g., badge, icon, or special styling)
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    await expect(messageWithTool.getByTestId('tool-use-indicator')).toBeVisible();
  });

  test('should display tool name inline next to collapse button', async ({ page }) => {
    // Arrange & Assert - Tool name should be visible without expanding
    const timeline = page.getByTestId('timeline-view');

    // Single tool message
    const singleToolMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    const inlineNames = singleToolMessage.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('DataAnalyzer');

    // Multiple tools message
    const multiToolMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });
    const multiInlineNames = multiToolMessage.getByTestId('tool-names-inline');
    await expect(multiInlineNames).toBeVisible();
    await expect(multiInlineNames).toContainText('FileReader');
    await expect(multiInlineNames).toContainText('SchemaValidator');
  });

  test('should expand tool details when message with tool_use is clicked', async ({ page }) => {
    // Arrange - Find the message with tool_use
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Click on the message to expand details
    await messageWithTool.click();

    // Assert - Tool details should be visible
    // Tool detail view container should appear
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    // Tool name should be displayed
    await expect(page.getByTestId('tool-name')).toContainText('DataAnalyzer');

    // Tool input should be displayed
    await expect(page.getByTestId('tool-input')).toBeVisible();
    await expect(page.getByTestId('tool-input')).toContainText('input.csv');

    // Input parameter structure should be visible
    await expect(page.getByText(/file_path/i)).toBeVisible();
  });

  test('should display tool input in formatted JSON', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Click to expand
    await messageWithTool.click();

    // Assert - Input should be formatted as JSON
    const toolInput = page.getByTestId('tool-input');
    await expect(toolInput).toBeVisible();

    // JSON formatting should include proper structure
    // Check for JSON key-value pairs
    await expect(toolInput).toContainText('file_path');
    await expect(toolInput).toContainText('input.csv');

    // JSON should be properly indented/formatted (look for code block or pre element)
    const codeBlock = toolInput.locator('pre, code').first();
    await expect(codeBlock).toBeVisible();
  });

  test('should collapse tool details when clicked again', async ({ page }) => {
    // Arrange - Find and expand the message
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Click to expand
    await messageWithTool.click();
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    // Act - Click again to collapse
    await messageWithTool.click();

    // Assert - Tool details should be hidden
    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should show visual indicator when tool details are expanded', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Expand tool details
    await messageWithTool.click();

    // Assert - Visual indicator should show expanded state
    // The message element should have the 'expanded' class
    await expect(messageWithTool).toHaveClass(/expanded/);

    // Check for specific expand indicator
    const expandIndicator = messageWithTool.locator('[data-testid="expand-indicator"]');
    await expect(expandIndicator).toHaveAttribute('aria-expanded', 'true');
  });

  test('should show collapsed state indicator by default', async ({ page }) => {
    // Arrange & Assert
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Tool details should not be visible initially
    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();

    // Visual indicator should show collapsed state
    const expandIndicator = messageWithTool.locator('[data-testid="expand-indicator"]');
    await expect(expandIndicator).toHaveAttribute('aria-expanded', 'false');
  });

  test('should display tool ID in details', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Expand details
    await messageWithTool.click();

    // Assert - Tool ID should be visible
    const toolDetail = page.getByTestId('tool-detail-view');
    await expect(toolDetail.getByTestId('tool-id')).toBeVisible();
    await expect(toolDetail.getByTestId('tool-id')).toContainText('tool-001');
  });

  test('should handle multiple tool_use blocks in same message', async ({ page }) => {
    // Arrange - Find the message with multiple tool_use blocks (msg-005)
    const timeline = page.getByTestId('timeline-view');
    const messageWithMultipleTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });
    await expect(messageWithMultipleTools).toBeVisible();

    // Act - Click to expand
    await messageWithMultipleTools.click();

    // Assert - All tool details should be visible
    const toolDetailViews = messageWithMultipleTools.locator('[data-testid="tool-detail-view"]');
    await expect(toolDetailViews).toHaveCount(2);

    // Each tool should have its own section with correct names
    const toolNames = messageWithMultipleTools.locator('[data-testid="tool-name"]');
    await expect(toolNames.nth(0)).toContainText('FileReader');
    await expect(toolNames.nth(1)).toContainText('SchemaValidator');

    // Each tool should have its own ID
    const toolIds = messageWithMultipleTools.locator('[data-testid="tool-id"]');
    await expect(toolIds.nth(0)).toContainText('tool-002');
    await expect(toolIds.nth(1)).toContainText('tool-003');
  });

  test('should support keyboard navigation for expand/collapse', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Focus on message and press Enter or Space
    await messageWithTool.focus();
    await messageWithTool.press('Enter');

    // Assert - Tool details should expand
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    // Act - Press Enter/Space again
    await messageWithTool.press('Enter');

    // Assert - Tool details should collapse
    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should maintain scroll position when expanding/collapsing', async ({ page }) => {
    // Arrange - Scroll to message
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Act - Expand details
    await messageWithTool.click();
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    // Assert - Scroll position should be approximately the same
    // (allowing for small adjustments)
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const scrollDiff = Math.abs(scrollAfter - scrollBefore);
    expect(scrollDiff).toBeLessThan(100); // Allow small adjustments
  });

  test('should display message without tool_use normally', async ({ page }) => {
    // Arrange & Assert - Regular messages should not have tool indicators
    const timeline = page.getByTestId('timeline-view');

    // Find a message without tool_use (msg-001 or msg-003)
    const regularMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /Can you help me analyze this dataset/i
    });

    await expect(regularMessage).toBeVisible();

    // Should not have tool indicator
    await expect(regularMessage.getByTestId('tool-use-indicator')).not.toBeVisible();

    // Clicking should not expand any tool details
    await regularMessage.click();
    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should highlight syntax in tool input JSON', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Act - Expand details
    await messageWithTool.click();

    // Assert - JSON syntax highlighting should be applied
    const toolInput = page.getByTestId('tool-input');

    // Check for syntax highlighting classes
    const keyElements = toolInput.locator('.json-key');
    await expect(keyElements.first()).toBeVisible();

    const stringElements = toolInput.locator('.json-string');
    await expect(stringElements.first()).toBeVisible();
  });

  test('should be accessible via screen reader', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    // Assert - Accessibility attributes should be present
    // Should have appropriate ARIA attributes
    await expect(messageWithTool).toHaveAttribute('role', 'button');
    await expect(messageWithTool).toHaveAttribute('aria-expanded', 'false');

    // Tool detail view should have accessible labels
    await messageWithTool.click();
    await expect(messageWithTool).toHaveAttribute('aria-expanded', 'true');
    const toolDetail = page.getByTestId('tool-detail-view');
    await expect(toolDetail).toHaveAttribute('role', 'region');
    await expect(toolDetail).toHaveAttribute('aria-label', /Tool details for DataAnalyzer/);
  });
});

test.describe('Task Tool Subagent Type Display (VW-AC4)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with Task tool_use
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-task-subagent');
    await page.getByTestId('session-id-lookup-button').click();

    // Wait for transcript to load
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display Task tool with subagent_type as "Task [code]" in inline view', async ({ page }) => {

    // Arrange - Find the message with Task tool_use that has subagent_type: "code"
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    // Assert - Inline tool names should show "Task [code]"
    const inlineNames = messageWithTaskTool.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task [code]');

    // Should not show just "Task" without the subagent type
    const inlineText = await inlineNames.textContent();
    expect(inlineText).not.toBe('Task');
    expect(inlineText).toMatch(/Task \[code\]/);
  });

  test('should display Task tool with subagent_type as "Task [code]" in detail view header', async ({ page }) => {

    // Arrange - Find and expand the message with Task tool_use
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    // Act - Click to expand tool details
    await messageWithTaskTool.click();

    // Assert - Tool detail header should show "Tool: Task [code]"
    const toolDetailView = page.getByTestId('tool-detail-view');
    await expect(toolDetailView).toBeVisible();

    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toBeVisible();
    await expect(toolName).toContainText('Task [code]');

    // Verify the exact format in the detail header
    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task \[code\]|Task \[code\]/);
  });

  test('should display non-Task tools (FileReader) with name only, no brackets', async ({ page }) => {

    // Arrange - Find the message with FileReader tool_use
    const timeline = page.getByTestId('timeline-view');
    const messageWithFileReader = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the configuration file/i,
    });

    // Assert - Inline should show "FileReader" without brackets
    const inlineNames = messageWithFileReader.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('FileReader');

    const inlineText = await inlineNames.textContent();
    // Should not have brackets for non-Task tools
    expect(inlineText).not.toMatch(/\[.*\]/);

    // Act - Expand to check detail view
    await messageWithFileReader.click();

    // Assert - Detail view should also show "FileReader" without brackets
    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('FileReader');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });

  test('should display Task tool without subagent_type as "Task" only (edge case)', async ({ page }) => {

    // Arrange - Find the message with Task tool_use that has NO subagent_type
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskNoSubagent = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate the test analysis/i,
    });

    // Assert - Inline should show just "Task" without brackets
    const inlineNames = messageWithTaskNoSubagent.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task');

    const inlineText = await inlineNames.textContent();
    // Should not have brackets when subagent_type is absent
    expect(inlineText).toBe('Task');
    expect(inlineText).not.toMatch(/\[.*\]/);

    // Act - Expand to check detail view
    await messageWithTaskNoSubagent.click();

    // Assert - Detail view should also show just "Task"
    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('Task');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task$|^Task$/);
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });
});
