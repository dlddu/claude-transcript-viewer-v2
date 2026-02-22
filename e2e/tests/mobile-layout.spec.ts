import { test, expect } from '@playwright/test';

/**
 * Mobile Layout E2E Tests
 *
 * Purpose: Test responsive layout behavior for mobile and desktop viewports,
 * ensuring proper padding and spacing adjustments.
 *
 * Test Status: ACTIVE (TDD Red Phase)
 * Reason: Tests are written to validate future CSS implementation for mobile-optimized layout.
 * These tests will initially FAIL until the CSS media queries are implemented.
 *
 * Expected Behavior:
 * - Mobile viewport (≤640px): Reduced padding for compact display
 *   - Message containers: 8-12px padding
 *   - Assistant/User labels: Compact spacing
 * - Desktop viewport (>640px): Maintain existing padding
 *   - Message containers: 16px (1rem) padding
 *   - Normal label spacing
 *
 * Breakpoint: 640px (mobile vs. desktop)
 *
 * Fixture Data:
 * - e2e/fixtures/sample-main-transcript.json
 *   - session_id: "session-abc123"
 *   - Contains main agent and subagent messages for layout testing
 */
test.describe('Mobile Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript
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

  test('should apply mobile padding on iPhone SE viewport (375x667)', async ({ page }) => {
    // Arrange - Set mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for any layout adjustments to complete
    await page.waitForTimeout(100);

    // Act & Assert - Verify message container has mobile padding (8-12px)
    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    await expect(firstMessage).toBeVisible();

    // Get computed padding values
    const paddingLeft = await firstMessage.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await firstMessage.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    // Mobile viewport should have 8-12px padding
    expect(paddingLeft).toBeGreaterThanOrEqual(8);
    expect(paddingLeft).toBeLessThanOrEqual(12);
    expect(paddingRight).toBeGreaterThanOrEqual(8);
    expect(paddingRight).toBeLessThanOrEqual(12);
  });

  test('should apply mobile padding on small Android viewport (360x640)', async ({ page }) => {
    // Arrange - Set small mobile viewport (common Android size)
    await page.setViewportSize({ width: 360, height: 640 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify message containers have mobile padding
    const timeline = page.getByTestId('timeline-view');
    const messages = timeline.locator('[data-testid="timeline-item"]');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(0);

    // Check first few messages for consistent padding
    for (let i = 0; i < Math.min(3, messageCount); i++) {
      const message = messages.nth(i);
      const paddingLeft = await message.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingLeft)
      );
      const paddingRight = await message.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingRight)
      );

      expect(paddingLeft).toBeGreaterThanOrEqual(8);
      expect(paddingLeft).toBeLessThanOrEqual(12);
      expect(paddingRight).toBeGreaterThanOrEqual(8);
      expect(paddingRight).toBeLessThanOrEqual(12);
    }
  });

  test('should maintain desktop padding on breakpoint edge (641px)', async ({ page }) => {
    // Arrange - Set viewport just above mobile breakpoint
    await page.setViewportSize({ width: 641, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify message containers have desktop padding (16px)
    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    await expect(firstMessage).toBeVisible();

    const paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    const paddingRight = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingRight)
    );

    // Desktop viewport should have 16px (1rem) padding
    expect(paddingLeft).toBe(16);
    expect(paddingRight).toBe(16);
  });

  test('should maintain desktop padding on standard desktop viewport (1024x768)', async ({ page }) => {
    // Arrange - Set standard desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify desktop padding is maintained
    const timeline = page.getByTestId('timeline-view');
    const messages = timeline.locator('[data-testid="timeline-item"]');
    const messageCount = await messages.count();

    // Check multiple messages for consistent desktop padding
    for (let i = 0; i < Math.min(3, messageCount); i++) {
      const message = messages.nth(i);
      const paddingLeft = await message.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingLeft)
      );
      const paddingRight = await message.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingRight)
      );

      expect(paddingLeft).toBe(16);
      expect(paddingRight).toBe(16);
    }
  });

  test('should display compact Assistant/User labels on mobile viewport', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify role labels have compact spacing
    const timeline = page.getByTestId('timeline-view');
    const roleLabels = timeline.locator('.message-role');
    const labelCount = await roleLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    // Check first label's margin-bottom (should be compact on mobile)
    const firstLabel = roleLabels.first();
    await expect(firstLabel).toBeVisible();

    const marginBottom = await firstLabel.evaluate((el) =>
      parseInt(window.getComputedStyle(el).marginBottom)
    );

    // Mobile should have reduced margin (less than desktop's 8px/0.5rem)
    // Expect around 4px (0.25rem) for compact layout
    expect(marginBottom).toBeLessThanOrEqual(6);
  });

  test('should maintain normal label spacing on desktop viewport', async ({ page }) => {
    // Arrange - Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Verify role labels maintain desktop spacing
    const timeline = page.getByTestId('timeline-view');
    const roleLabels = timeline.locator('.message-role');
    const labelCount = await roleLabels.count();

    if (labelCount > 0) {
      const firstLabel = roleLabels.first();
      const marginBottom = await firstLabel.evaluate((el) =>
        parseInt(window.getComputedStyle(el).marginBottom)
      );

      // Desktop should maintain 8px (0.5rem) margin-bottom
      expect(marginBottom).toBe(8);
    }
  });

  test('should apply mobile padding to subagent group content', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    // Expand first subagent group to verify its content padding
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const headerCount = await groupHeaders.count();

    if (headerCount > 0) {
      await groupHeaders.first().click();

      // Wait for expansion
      const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
      await expect(groupBody).toBeVisible();

      // Check subagent messages within the group
      const subagentMessages = groupBody.locator('.message-subagent');
      const subagentCount = await subagentMessages.count();

      if (subagentCount > 0) {
        const firstSubagentMessage = subagentMessages.first();
        const paddingLeft = await firstSubagentMessage.evaluate((el) =>
          parseInt(window.getComputedStyle(el).paddingLeft)
        );
        const paddingRight = await firstSubagentMessage.evaluate((el) =>
          parseInt(window.getComputedStyle(el).paddingRight)
        );

        // Subagent messages should also have mobile padding
        expect(paddingLeft).toBeGreaterThanOrEqual(8);
        expect(paddingLeft).toBeLessThanOrEqual(12);
        expect(paddingRight).toBeGreaterThanOrEqual(8);
        expect(paddingRight).toBeLessThanOrEqual(12);
      }
    }
  });

  test('should maintain readable line length on ultra-wide desktop (1920x1080)', async ({ page }) => {
    // Arrange - Set ultra-wide viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Wait for layout adjustments
    await page.waitForTimeout(100);

    // Act & Assert - Container should maintain max-width for readability
    const transcriptViewer = page.getByTestId('transcript-viewer');
    await expect(transcriptViewer).toBeVisible();

    const maxWidth = await transcriptViewer.evaluate((el) => {
      return window.getComputedStyle(el).maxWidth;
    });

    // Should have max-width constraint (1200px from CSS)
    expect(maxWidth).toBe('1200px');

    // Messages should still have desktop padding
    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    const paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );

    expect(paddingLeft).toBe(16);
  });

  test('should apply consistent padding across viewport resize', async ({ page }) => {
    // Start with desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();

    // Verify desktop padding
    let paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBe(16);

    // Resize to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    // Verify mobile padding
    paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBeGreaterThanOrEqual(8);
    expect(paddingLeft).toBeLessThanOrEqual(12);

    // Resize back to desktop
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    // Verify desktop padding is restored
    paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBe(16);
  });

  test('should handle mobile viewport with tool details expanded', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    // Find and expand a message with tools
    const toolMessages = timeline.locator('[data-testid="timeline-item"][role="button"]');
    const toolMessageCount = await toolMessages.count();

    if (toolMessageCount > 0) {
      // Expand first tool message
      await toolMessages.first().click();

      // Wait for tool details to appear
      const toolDetailView = timeline.locator('[data-testid="tool-detail-view"]').first();
      await expect(toolDetailView).toBeVisible();

      // Verify the tool message itself still has mobile padding
      const expandedMessage = toolMessages.first();
      const paddingLeft = await expandedMessage.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingLeft)
      );
      const paddingRight = await expandedMessage.evaluate((el) =>
        parseInt(window.getComputedStyle(el).paddingRight)
      );

      expect(paddingLeft).toBeGreaterThanOrEqual(8);
      expect(paddingLeft).toBeLessThanOrEqual(12);
      expect(paddingRight).toBeGreaterThanOrEqual(8);
      expect(paddingRight).toBeLessThanOrEqual(12);
    }
  });

  test('should maintain accessibility on mobile viewport', async ({ page }) => {
    // Arrange - Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    // Verify clickable elements remain accessible with mobile padding
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const headerCount = await groupHeaders.count();

    if (headerCount > 0) {
      const firstHeader = groupHeaders.first();

      // Should be focusable
      await firstHeader.focus();
      await expect(firstHeader).toBeFocused();

      // Should be clickable (enough padding for tap target)
      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-expanded', 'true');

      // Click again to collapse
      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-expanded', 'false');
    }

    // Verify tool-bearing messages remain clickable on mobile
    const toolItems = timeline.locator('[data-testid="timeline-item"][role="button"]');
    const toolItemCount = await toolItems.count();

    if (toolItemCount > 0) {
      const toolItem = toolItems.first();
      await toolItem.focus();
      await expect(toolItem).toBeFocused();

      // Should expand on click
      await toolItem.click();
      await expect(toolItem).toHaveAttribute('aria-expanded', 'true');
    }
  });
});
