import { test, expect } from '@playwright/test';

/**
 * Tool Call Box Compactification E2E Tests (DLD-276)
 *
 * Purpose: Test mobile-optimized compact layout for tool call boxes,
 * ensuring reduced padding, smaller font sizes, and proper text wrapping
 * on mobile viewports while maintaining desktop layout.
 *
 * Test Status: ACTIVE
 * Reason: CSS implementation is complete.
 * These tests validate the CSS media query changes for compact layout.
 *
 * Expected Behavior:
 * - Mobile viewport (≤640px): Compact tool boxes
 *   - .tool-detail-view padding: ≤6px (reduced from 8px)
 *   - .tool-input/.tool-output padding: ≤6px (reduced from 8px)
 *   - .tool-input pre font-size: 11px (reduced from 14px)
 *   - Code blocks: no horizontal scroll (white-space: pre-wrap)
 * - Desktop viewport (>640px): Maintain existing layout
 *   - .tool-detail-view padding: 16px (1rem)
 *   - .tool-input/.tool-output padding: 12px (0.75rem)
 *   - .tool-input pre font-size: 14px (0.875rem)
 *
 * Breakpoint: 640px (mobile vs. desktop)
 *
 * Fixture Data:
 * - e2e/fixtures/session-abc123.jsonl
 *   - Contains messages with tool_use content blocks for testing
 */
test.describe('Tool Call Box Compactification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with tool_use
    await page.goto('/');
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    // Wait for transcript to load
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    // Expand a tool message to show tool details
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    await messageWithTool.click();

    // Wait for tool detail view to be visible
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();
  });

  test('should apply compact padding to tool-detail-view on mobile (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments to complete
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-detail-view has mobile padding (≤6px)
    const toolDetailView = page.getByTestId('tool-detail-view').first();
    await expect(toolDetailView).toBeVisible();

    // Get computed padding values
    const paddingLeft = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });
    const paddingTop = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingTop);
    });
    const paddingBottom = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingBottom);
    });

    // Mobile viewport should have ≤6px padding (0.375rem)
    expect(paddingLeft).toBeLessThanOrEqual(6);
    expect(paddingRight).toBeLessThanOrEqual(6);
    expect(paddingTop).toBeLessThanOrEqual(6);
    expect(paddingBottom).toBeLessThanOrEqual(6);
  });

  test('should apply compact padding to tool-input/tool-output on mobile (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-input has mobile padding
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const inputPaddingLeft = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const inputPaddingRight = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });
    const inputPaddingTop = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingTop);
    });
    const inputPaddingBottom = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingBottom);
    });

    // Mobile viewport should have ≤6px padding
    expect(inputPaddingLeft).toBeLessThanOrEqual(6);
    expect(inputPaddingRight).toBeLessThanOrEqual(6);
    expect(inputPaddingTop).toBeLessThanOrEqual(6);
    expect(inputPaddingBottom).toBeLessThanOrEqual(6);

    // Check tool-output if it exists
    const toolOutputCount = await page.getByTestId('tool-output').count();
    if (toolOutputCount > 0) {
      const toolOutput = page.getByTestId('tool-output').first();
      const outputPaddingLeft = await toolOutput.evaluate((el) => {
        return parseInt(window.getComputedStyle(el).paddingLeft);
      });
      const outputPaddingRight = await toolOutput.evaluate((el) => {
        return parseInt(window.getComputedStyle(el).paddingRight);
      });

      expect(outputPaddingLeft).toBeLessThanOrEqual(6);
      expect(outputPaddingRight).toBeLessThanOrEqual(6);
    }
  });

  test('should reduce font-size to 11px in tool-input pre on mobile (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-input pre has 11px font-size
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    // Find pre element within tool-input
    const preElement = toolInput.locator('pre').first();
    await expect(preElement).toBeVisible();

    const fontSize = await preElement.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).fontSize);
    });

    // Mobile viewport should have 11px (0.6875rem) font-size
    expect(fontSize).toBe(11);
  });

  test('should reduce font-size to 11px in tool-output pre on mobile (375x667)', async ({ page }) => {
    // Arrange - Navigate to a message with tool output
    // Collapse and re-expand to ensure we have a fresh state
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    // Check if tool-output exists
    const toolOutputCount = await page.getByTestId('tool-output').count();

    if (toolOutputCount > 0) {
      // Act & Assert - Verify tool-output pre has 11px font-size
      const toolOutput = page.getByTestId('tool-output').first();
      await expect(toolOutput).toBeVisible();

      const preElement = toolOutput.locator('pre').first();
      await expect(preElement).toBeVisible();

      const fontSize = await preElement.evaluate((el) => {
        return parseInt(window.getComputedStyle(el).fontSize);
      });

      // Mobile viewport should have 11px font-size
      expect(fontSize).toBe(11);
    } else {
      // Skip if no tool output in this fixture
      test();
    }
  });

  test('should apply pre-wrap to code blocks on mobile (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify code blocks have white-space: pre-wrap
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const preElement = toolInput.locator('pre').first();
    await expect(preElement).toBeVisible();

    const whiteSpace = await preElement.evaluate((el) => {
      return window.getComputedStyle(el).whiteSpace;
    });

    const wordWrap = await preElement.evaluate((el) => {
      return window.getComputedStyle(el).wordWrap;
    });

    // Should use pre-wrap to allow automatic line wrapping
    expect(whiteSpace).toBe('pre-wrap');
    expect(wordWrap).toBe('break-word');
  });

  test('should not have horizontal scrollbar in tool-input on mobile (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify no horizontal scroll
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    // Check if element has horizontal scroll
    const hasHorizontalScroll = await toolInput.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    // Should not have horizontal scroll (content wraps instead)
    expect(hasHorizontalScroll).toBe(false);
  });

  test('should maintain desktop padding on tool-detail-view at 641px', async ({ page }) => {
    // Arrange - Set viewport just above mobile breakpoint
    await page.setViewportSize({ width: 641, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-detail-view has desktop padding (16px)
    const toolDetailView = page.getByTestId('tool-detail-view').first();
    await expect(toolDetailView).toBeVisible();

    const paddingLeft = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    // Desktop viewport should maintain 16px (1rem) padding
    expect(paddingLeft).toBe(16);
    expect(paddingRight).toBe(16);
  });

  test('should maintain desktop padding on tool-input/tool-output at 1024px', async ({ page }) => {
    // Arrange - Set standard desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-input maintains desktop padding
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const paddingLeft = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    // Desktop viewport should maintain 12px (0.75rem) padding
    expect(paddingLeft).toBe(12);
    expect(paddingRight).toBe(12);
  });

  test('should maintain desktop font-size 14px in tool-input pre at 1024px', async ({ page }) => {
    // Arrange - Set standard desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify tool-input pre maintains 14px font-size
    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const preElement = toolInput.locator('pre').first();
    await expect(preElement).toBeVisible();

    const fontSize = await preElement.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).fontSize);
    });

    // Desktop viewport should maintain 14px (0.875rem) font-size
    expect(fontSize).toBe(14);
  });

  test('should apply consistent styling across viewport resize', async ({ page }) => {
    // Start with desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const toolDetailView = page.getByTestId('tool-detail-view').first();
    const toolInput = page.getByTestId('tool-input').first();
    const preElement = toolInput.locator('pre').first();

    // Verify desktop padding and font-size
    let padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    let fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(padding).toBe(16);
    expect(fontSize).toBe(14);

    // Resize to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    // Verify mobile padding and font-size
    padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(padding).toBeLessThanOrEqual(6);
    expect(fontSize).toBe(11);

    // Resize back to desktop
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    // Verify desktop padding and font-size are restored
    padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(padding).toBe(16);
    expect(fontSize).toBe(14);
  });

  test('should handle multiple tool blocks with compact layout on mobile', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    // Find and expand a message with multiple tool_use blocks
    const timeline = page.getByTestId('timeline-view');
    const messageWithMultipleTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });

    const messageCount = await messageWithMultipleTools.count();
    if (messageCount > 0) {
      await messageWithMultipleTools.click();

      // Wait for tool details to appear
      await page.waitForTimeout(100);

      // Act & Assert - All tool detail views should have compact padding
      const toolDetailViews = messageWithMultipleTools.locator('[data-testid="tool-detail-view"]');
      const toolDetailCount = await toolDetailViews.count();

      if (toolDetailCount > 0) {
        for (let i = 0; i < toolDetailCount; i++) {
          const toolDetail = toolDetailViews.nth(i);
          const padding = await toolDetail.evaluate((el) =>
            parseInt(window.getComputedStyle(el).paddingLeft)
          );
          expect(padding).toBeLessThanOrEqual(6);
        }
      }
    } else {
      // Skip if message with multiple tools not found
      test();
    }
  });

  test('should maintain readability with compact layout on small Android (360x640)', async ({ page }) => {
    // Arrange - Set small Android viewport
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(100);

    // Act & Assert - Verify compact layout is applied
    const toolDetailView = page.getByTestId('tool-detail-view').first();
    const toolInput = page.getByTestId('tool-input').first();
    const preElement = toolInput.locator('pre').first();

    await expect(toolDetailView).toBeVisible();
    await expect(toolInput).toBeVisible();

    // Check compact padding
    const padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(padding).toBeLessThanOrEqual(6);

    // Check reduced font-size
    const fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(fontSize).toBe(11);

    // Verify content is still visible and readable (not cut off)
    await expect(preElement).toBeVisible();
    const isVisible = await preElement.isVisible();
    expect(isVisible).toBe(true);
  });
});
