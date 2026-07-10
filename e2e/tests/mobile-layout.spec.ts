import { test, expect } from '@playwright/test';

/**
 * Mobile Layout (VW-AC6)
 *
 * VW-AC6 하나가 두 가지를 함께 보장한다: 모바일 뷰포트(375×667, 360×640)에서 메시지 패딩·라벨이
 * 컴팩트해지고, 툴 상세/입출력 박스에 컴팩트 패딩·11px 코드 폰트·`pre-wrap`이 적용되어 가로
 * 스크롤이 발생하지 않는다. 641px 이상 데스크톱에서는 기존 패딩과 14px 폰트를 유지하며,
 * 뷰포트 리사이즈에도 일관된다. 예전에는 두 스펙 파일로 갈려 있었으나 AC 하나가 스펙 하나를
 * 소유하도록 병합했다.
 *
 * 각 테스트가 `page.setViewportSize`로 자기 뷰포트를 잡으므로 두 describe는 서로 간섭하지 않는다.
 *
 * Test Status: ACTIVE
 */

test.describe('Mobile Layout - Message Padding and Labels (VW-AC6)', () => {
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

test.describe('Mobile Layout - Tool Call Box Compactification (VW-AC6)', () => {
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
