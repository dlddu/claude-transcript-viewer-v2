import { test, expect } from '@playwright/test';

/**
 * Text Truncation E2E Tests
 *
 * Purpose: Test the text truncation functionality for tool IDs and file paths,
 * ensuring proper display and user interaction for accessing full text.
 *
 * Test Status: SKIPPED (TDD Red Phase)
 * Reason: Tests are written before implementation. These tests will be enabled
 * after the truncate utility functions and TruncatedText component are implemented.
 *
 * Expected Behavior:
 * - Tool IDs: Truncate to first 8 characters with ellipsis (e.g., "toolu_01Pr...")
 * - File paths: Truncate to show only filename with leading ellipsis (e.g., "...file.txt")
 * - Click/tap to show full text in tooltip
 * - Copy button in tooltip to copy full text to clipboard
 * - Mobile-responsive tooltip positioning
 *
 * Implementation Requirements:
 * 1. Create truncate.ts utility with truncateToolId and truncateFilePath functions
 * 2. Create TruncatedText component with tooltip and copy functionality
 * 3. Integrate into TranscriptViewer for tool IDs and file paths
 * 4. Remove .skip from tests when implementation is complete
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - Contains tool_use blocks with tool IDs and file paths in input/output
 */

test.describe('Text Truncation', () => {
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

  test.describe('Tool ID Truncation', () => {
    test.skip('should display truncated tool ID with ellipsis', async ({ page }) => {
      // Arrange - Find and expand a message with tool_use
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });

      // Act - Expand tool details
      await messageWithTool.click();

      // Assert - Tool ID should be truncated
      const toolId = page.getByTestId('tool-id');
      await expect(toolId).toBeVisible();

      // Should show truncated format: "toolu_01..."
      const toolIdText = await toolId.textContent();
      expect(toolIdText).toMatch(/toolu_\w{2}\.\.\./);
      expect(toolIdText).not.toContain('tool-001'); // Should not show full ID
    });

    test.skip('should show full tool ID in tooltip when clicked', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Click on truncated tool ID
      const toolId = page.getByTestId('tool-id');
      await toolId.click();

      // Assert - Tooltip should appear with full ID
      const tooltip = page.getByTestId('truncated-text-tooltip');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('tool-001');
    });

    test.skip('should copy full tool ID to clipboard when clicking copy button', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Open tooltip and click copy button
      const toolId = page.getByTestId('tool-id');
      await toolId.click();

      const tooltip = page.getByTestId('truncated-text-tooltip');
      await expect(tooltip).toBeVisible();

      const copyButton = tooltip.getByTestId('copy-button');
      await copyButton.click();

      // Assert - Clipboard should contain full tool ID
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe('tool-001');

      // Should show "Copied!" feedback
      await expect(tooltip.getByText(/copied/i)).toBeVisible();
    });

    test.skip('should hide tooltip when clicking outside', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Show tooltip
      const toolId = page.getByTestId('tool-id');
      await toolId.click();
      await expect(page.getByTestId('truncated-text-tooltip')).toBeVisible();

      // Act - Click outside
      await page.getByTestId('transcript-viewer').click();

      // Assert - Tooltip should be hidden
      await expect(page.getByTestId('truncated-text-tooltip')).not.toBeVisible();
    });

    test.skip('should support keyboard navigation for tooltip', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Focus and press Enter
      const toolId = page.getByTestId('tool-id');
      await toolId.focus();
      await toolId.press('Enter');

      // Assert - Tooltip should appear
      await expect(page.getByTestId('truncated-text-tooltip')).toBeVisible();

      // Act - Press Escape
      await page.keyboard.press('Escape');

      // Assert - Tooltip should be hidden
      await expect(page.getByTestId('truncated-text-tooltip')).not.toBeVisible();
    });
  });

  test.describe('File Path Truncation', () => {
    test.skip('should display truncated file paths in tool input', async ({ page }) => {
      // Arrange - Expand tool details
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Assert - File paths in tool input should be truncated
      const toolInput = page.getByTestId('tool-input');
      await expect(toolInput).toBeVisible();

      // Should show truncated format: "...filename.ext"
      const inputText = await toolInput.textContent();
      expect(inputText).toMatch(/\.\.\.[\w-]+\.\w+/);
    });

    test.skip('should display truncated file paths in tool output', async ({ page }) => {
      // Arrange - Find message with tool result containing file paths
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Assert - File paths in tool output should be truncated
      const toolOutput = page.getByTestId('tool-output');
      if (await toolOutput.isVisible()) {
        const outputText = await toolOutput.textContent();
        // Should contain truncated paths if any paths exist
        if (outputText?.includes('/')) {
          expect(outputText).toMatch(/\.\.\.[\w-]+\.\w+/);
        }
      }
    });

    test.skip('should show full file path in tooltip when clicked', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Click on truncated file path
      const truncatedPath = page.getByText(/\.\.\.[\w-]+\.csv/).first();
      await truncatedPath.click();

      // Assert - Tooltip should show full path
      const tooltip = page.getByTestId('truncated-text-tooltip');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('/data/input.csv');
    });

    test.skip('should copy full file path to clipboard', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Open tooltip and copy
      const truncatedPath = page.getByText(/\.\.\.[\w-]+\.csv/).first();
      await truncatedPath.click();

      const tooltip = page.getByTestId('truncated-text-tooltip');
      const copyButton = tooltip.getByTestId('copy-button');
      await copyButton.click();

      // Assert
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe('/data/input.csv');
    });

    test.skip('should handle long file paths with multiple directories', async ({ page }) => {
      // Arrange - Expand tool with long path
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'll read the config and validate the schema/i,
      });
      await messageWithTool.click();

      // Assert - Should show only filename with ellipsis
      const toolInput = page.getByTestId('tool-input');
      const inputText = await toolInput.textContent();

      // Should not show full path
      expect(inputText).not.toContain('/very/long/path/to/some/directory/');
      // Should show truncated version
      expect(inputText).toMatch(/\.\.\.config\.json/);
    });

    test.skip('should handle Windows-style paths', async ({ page }) => {
      // This test would require fixture data with Windows paths
      // Arrange - Expand tool with Windows path
      const timeline = page.getByTestId('timeline-view');

      // If we have Windows path in fixtures, it should be truncated
      // e.g., "C:\\Users\\Dev\\file.txt" -> "...file.txt"
      const truncatedPath = page.getByText(/\.\.\.[\w-]+\.\w+/);
      if (await truncatedPath.count() > 0) {
        await truncatedPath.first().click();

        const tooltip = page.getByTestId('truncated-text-tooltip');
        const tooltipText = await tooltip.textContent();
        // Should show full Windows path if it was Windows format
        if (tooltipText?.includes(':\\')) {
          expect(tooltipText).toMatch(/[A-Z]:\\.*\\/);
        }
      }
    });
  });

  test.describe('Mobile Truncation Behavior', () => {
    test.skip('should display truncated text properly on mobile viewport', async ({ page }) => {
      // Arrange - Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Assert - Tool ID should be truncated
      const toolId = page.getByTestId('tool-id');
      await expect(toolId).toBeVisible();

      const toolIdText = await toolId.textContent();
      expect(toolIdText).toMatch(/toolu_\w{2}\.\.\./);
    });

    test.skip('should show tooltip on mobile tap', async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width: 375, height: 667 });

      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Tap on truncated text
      const toolId = page.getByTestId('tool-id');
      await toolId.tap();

      // Assert - Tooltip should appear
      await expect(page.getByTestId('truncated-text-tooltip')).toBeVisible();
    });

    test.skip('should position tooltip properly on mobile screen', async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width: 375, height: 667 });

      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act
      const toolId = page.getByTestId('tool-id');
      await toolId.tap();

      // Assert - Tooltip should be visible and within viewport
      const tooltip = page.getByTestId('truncated-text-tooltip');
      await expect(tooltip).toBeVisible();

      const tooltipBox = await tooltip.boundingBox();
      expect(tooltipBox).not.toBeNull();
      if (tooltipBox) {
        expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
        expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(375);
      }
    });

    test.skip('should handle copy functionality on mobile', async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width: 375, height: 667 });

      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Open tooltip and copy
      const toolId = page.getByTestId('tool-id');
      await toolId.tap();

      const tooltip = page.getByTestId('truncated-text-tooltip');
      const copyButton = tooltip.getByTestId('copy-button');
      await copyButton.tap();

      // Assert
      await expect(tooltip.getByText(/copied/i)).toBeVisible();
    });

    test.skip('should close tooltip when tapping outside on mobile', async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width: 375, height: 667 });

      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Show tooltip
      const toolId = page.getByTestId('tool-id');
      await toolId.tap();
      await expect(page.getByTestId('truncated-text-tooltip')).toBeVisible();

      // Act - Tap outside
      await page.getByTestId('transcript-viewer').tap({ position: { x: 10, y: 10 } });

      // Assert - Tooltip should be hidden
      await expect(page.getByTestId('truncated-text-tooltip')).not.toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test.skip('should have proper ARIA attributes on truncated text', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Assert - Truncated text element should have ARIA attributes
      const toolId = page.getByTestId('tool-id');
      await expect(toolId).toHaveAttribute('role', 'button');
      await expect(toolId).toHaveAttribute('aria-expanded', 'false');
      await expect(toolId).toHaveAttribute('aria-label');
    });

    test.skip('should update aria-expanded when tooltip is shown', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act
      const toolId = page.getByTestId('tool-id');
      await toolId.click();

      // Assert
      await expect(toolId).toHaveAttribute('aria-expanded', 'true');
    });

    test.skip('should have proper role on tooltip', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act
      const toolId = page.getByTestId('tool-id');
      await toolId.click();

      // Assert
      const tooltip = page.getByTestId('truncated-text-tooltip');
      await expect(tooltip).toHaveAttribute('role', 'tooltip');
    });

    test.skip('should support keyboard navigation with Tab', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });
      await messageWithTool.click();

      // Act - Tab to truncated text
      await page.keyboard.press('Tab');
      const toolId = page.getByTestId('tool-id');
      await expect(toolId).toBeFocused();

      // Act - Press Enter to show tooltip
      await page.keyboard.press('Enter');

      // Assert
      await expect(page.getByTestId('truncated-text-tooltip')).toBeVisible();
    });
  });

  test.describe('Integration with Tool Detail View', () => {
    test.skip('should truncate multiple tool IDs in message with multiple tools', async ({ page }) => {
      // Arrange - Find message with multiple tool_use blocks
      const timeline = page.getByTestId('timeline-view');
      const messageWithMultipleTools = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'll read the config and validate the schema/i,
      });

      // Act
      await messageWithMultipleTools.click();

      // Assert - Both tool IDs should be truncated
      const toolIds = messageWithMultipleTools.locator('[data-testid="tool-id"]');
      expect(await toolIds.count()).toBe(2);

      for (let i = 0; i < 2; i++) {
        const toolIdText = await toolIds.nth(i).textContent();
        expect(toolIdText).toMatch(/toolu_\w{2}\.\.\./);
      }
    });

    test.skip('should maintain truncation when collapsing and re-expanding tool details', async ({ page }) => {
      // Arrange
      const timeline = page.getByTestId('timeline-view');
      const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
        hasText: /I'd be happy to help you analyze the dataset/i,
      });

      // Act - Expand
      await messageWithTool.click();
      const toolIdExpanded = await page.getByTestId('tool-id').textContent();

      // Act - Collapse
      await messageWithTool.click();
      await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();

      // Act - Re-expand
      await messageWithTool.click();
      const toolIdReExpanded = await page.getByTestId('tool-id').textContent();

      // Assert - Should maintain truncation
      expect(toolIdExpanded).toBe(toolIdReExpanded);
      expect(toolIdReExpanded).toMatch(/toolu_\w{2}\.\.\./);
    });
  });
});
