import { test, expect } from '@playwright/test';

/**
 * Tool Detail View E2E Tests (DLD-252)
 *
 * Purpose: Test the tool detail view functionality that displays tool_use input/output
 * details in an expandable/collapsible view when users click on messages containing tool_use.
 *
 * Test Status: ACTIVE (all 13 tests enabled)
 *
 * Expected Behavior:
 * - Messages containing tool_use can be clicked to expand details
 * - Expanded view shows tool name, input parameters, and output (if available)
 * - Clicking again collapses the details
 * - Visual indication shows whether details are expanded or collapsed
 * - JSON input is rendered with syntax highlighting
 * - Accessibility attributes are present (role, aria-expanded, aria-label)
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - msg-002 contains single tool_use content block (DataAnalyzer)
 *   - msg-005 contains multiple tool_use content blocks (FileReader, SchemaValidator)
 */
test.describe('Tool Detail View', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with tool_use
    await page.goto('/');
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
