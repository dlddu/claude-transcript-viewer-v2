import { test, expect } from '@playwright/test';

/**
 * 각 테스트가 `page.setViewportSize`로 자기 뷰포트를 잡으므로 두 describe는 서로 간섭하지 않는다.
 */

test.describe('Mobile Layout - Message Padding and Labels (VW-AC6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should apply mobile padding on iPhone SE viewport (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    await expect(firstMessage).toBeVisible();

    const paddingLeft = await firstMessage.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await firstMessage.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    expect(paddingLeft).toBeGreaterThanOrEqual(8);
    expect(paddingLeft).toBeLessThanOrEqual(12);
    expect(paddingRight).toBeGreaterThanOrEqual(8);
    expect(paddingRight).toBeLessThanOrEqual(12);
  });

  test('should apply mobile padding on small Android viewport (360x640)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const messages = timeline.locator('[data-testid="timeline-item"]');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(0);

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
    await page.setViewportSize({ width: 641, height: 768 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    await expect(firstMessage).toBeVisible();

    const paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    const paddingRight = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingRight)
    );

    expect(paddingLeft).toBe(16);
    expect(paddingRight).toBe(16);
  });

  test('should maintain desktop padding on standard desktop viewport (1024x768)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const messages = timeline.locator('[data-testid="timeline-item"]');
    const messageCount = await messages.count();

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
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const roleLabels = timeline.locator('.message-role');
    const labelCount = await roleLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    const firstLabel = roleLabels.first();
    await expect(firstLabel).toBeVisible();

    const marginBottom = await firstLabel.evaluate((el) =>
      parseInt(window.getComputedStyle(el).marginBottom)
    );

    expect(marginBottom).toBeLessThanOrEqual(6);
  });

  test('should maintain normal label spacing on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const roleLabels = timeline.locator('.message-role');
    const labelCount = await roleLabels.count();

    if (labelCount > 0) {
      const firstLabel = roleLabels.first();
      const marginBottom = await firstLabel.evaluate((el) =>
        parseInt(window.getComputedStyle(el).marginBottom)
      );

      expect(marginBottom).toBe(8);
    }
  });

  test('should apply mobile padding to subagent group content', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const headerCount = await groupHeaders.count();

    if (headerCount > 0) {
      await groupHeaders.first().click();

      const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
      await expect(groupBody).toBeVisible();

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

        expect(paddingLeft).toBeGreaterThanOrEqual(8);
        expect(paddingLeft).toBeLessThanOrEqual(12);
        expect(paddingRight).toBeGreaterThanOrEqual(8);
        expect(paddingRight).toBeLessThanOrEqual(12);
      }
    }
  });

  test('should maintain readable line length on ultra-wide desktop (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await page.waitForTimeout(100);

    const transcriptViewer = page.getByTestId('transcript-viewer');
    await expect(transcriptViewer).toBeVisible();

    const maxWidth = await transcriptViewer.evaluate((el) => {
      return window.getComputedStyle(el).maxWidth;
    });

    expect(maxWidth).toBe('1200px');

    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();
    const paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );

    expect(paddingLeft).toBe(16);
  });

  test('should apply consistent padding across viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const firstMessage = timeline.locator('[data-testid="timeline-item"]').first();

    let paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBe(16);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBeGreaterThanOrEqual(8);
    expect(paddingLeft).toBeLessThanOrEqual(12);

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    paddingLeft = await firstMessage.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(paddingLeft).toBe(16);
  });

  test('should handle mobile viewport with tool details expanded', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    const toolMessages = timeline.locator('[data-testid="timeline-item"][role="button"]');
    const toolMessageCount = await toolMessages.count();

    if (toolMessageCount > 0) {
      await toolMessages.first().click();

      const toolDetailView = timeline.locator('[data-testid="tool-detail-view"]').first();
      await expect(toolDetailView).toBeVisible();

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
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const headerCount = await groupHeaders.count();

    if (headerCount > 0) {
      const firstHeader = groupHeaders.first();

      await firstHeader.focus();
      await expect(firstHeader).toBeFocused();

      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-expanded', 'true');

      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-expanded', 'false');
    }

    const toolItems = timeline.locator('[data-testid="timeline-item"][role="button"]');
    const toolItemCount = await toolItems.count();

    if (toolItemCount > 0) {
      const toolItem = toolItems.first();
      await toolItem.focus();
      await expect(toolItem).toBeFocused();

      await toolItem.click();
      await expect(toolItem).toHaveAttribute('aria-expanded', 'true');
    }
  });
});

test.describe('Mobile Layout - Tool Call Box Compactification (VW-AC6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    await messageWithTool.click();

    await expect(page.getByTestId('tool-detail-view')).toBeVisible();
  });

  test('should apply compact padding to tool-detail-view on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const toolDetailView = page.getByTestId('tool-detail-view').first();
    await expect(toolDetailView).toBeVisible();

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

    expect(paddingLeft).toBeLessThanOrEqual(6);
    expect(paddingRight).toBeLessThanOrEqual(6);
    expect(paddingTop).toBeLessThanOrEqual(6);
    expect(paddingBottom).toBeLessThanOrEqual(6);
  });

  test('should apply compact padding to tool-input/tool-output on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

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

    expect(inputPaddingLeft).toBeLessThanOrEqual(6);
    expect(inputPaddingRight).toBeLessThanOrEqual(6);
    expect(inputPaddingTop).toBeLessThanOrEqual(6);
    expect(inputPaddingBottom).toBeLessThanOrEqual(6);

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
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const preElement = toolInput.locator('pre').first();
    await expect(preElement).toBeVisible();

    const fontSize = await preElement.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).fontSize);
    });

    expect(fontSize).toBe(11);
  });

  test('should reduce font-size to 11px in tool-output pre on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');

    const toolOutputCount = await page.getByTestId('tool-output').count();

    if (toolOutputCount > 0) {
      const toolOutput = page.getByTestId('tool-output').first();
      await expect(toolOutput).toBeVisible();

      const preElement = toolOutput.locator('pre').first();
      await expect(preElement).toBeVisible();

      const fontSize = await preElement.evaluate((el) => {
        return parseInt(window.getComputedStyle(el).fontSize);
      });

      expect(fontSize).toBe(11);
    } else {
      test();
    }
  });

  test('should apply pre-wrap to code blocks on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

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

    expect(whiteSpace).toBe('pre-wrap');
    expect(wordWrap).toBe('break-word');
  });

  test('should not have horizontal scrollbar in tool-input on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.waitForTimeout(100);

    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const hasHorizontalScroll = await toolInput.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('should maintain desktop padding on tool-detail-view at 641px', async ({ page }) => {
    await page.setViewportSize({ width: 641, height: 768 });

    await page.waitForTimeout(100);

    const toolDetailView = page.getByTestId('tool-detail-view').first();
    await expect(toolDetailView).toBeVisible();

    const paddingLeft = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await toolDetailView.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    expect(paddingLeft).toBe(16);
    expect(paddingRight).toBe(16);
  });

  test('should maintain desktop padding on tool-input/tool-output at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.waitForTimeout(100);

    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const paddingLeft = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft);
    });
    const paddingRight = await toolInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingRight);
    });

    expect(paddingLeft).toBe(12);
    expect(paddingRight).toBe(12);
  });

  test('should maintain desktop font-size 14px in tool-input pre at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.waitForTimeout(100);

    const toolInput = page.getByTestId('tool-input').first();
    await expect(toolInput).toBeVisible();

    const preElement = toolInput.locator('pre').first();
    await expect(preElement).toBeVisible();

    const fontSize = await preElement.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).fontSize);
    });

    expect(fontSize).toBe(14);
  });

  test('should apply consistent styling across viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const toolDetailView = page.getByTestId('tool-detail-view').first();
    const toolInput = page.getByTestId('tool-input').first();
    const preElement = toolInput.locator('pre').first();

    let padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    let fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(padding).toBe(16);
    expect(fontSize).toBe(14);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(padding).toBeLessThanOrEqual(6);
    expect(fontSize).toBe(11);

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

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
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(100);

    const timeline = page.getByTestId('timeline-view');
    const messageWithMultipleTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });

    const messageCount = await messageWithMultipleTools.count();
    if (messageCount > 0) {
      await messageWithMultipleTools.click();

      await page.waitForTimeout(100);

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
      test();
    }
  });

  test('should maintain readability with compact layout on small Android (360x640)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(100);

    const toolDetailView = page.getByTestId('tool-detail-view').first();
    const toolInput = page.getByTestId('tool-input').first();
    const preElement = toolInput.locator('pre').first();

    await expect(toolDetailView).toBeVisible();
    await expect(toolInput).toBeVisible();

    const padding = await toolDetailView.evaluate((el) =>
      parseInt(window.getComputedStyle(el).paddingLeft)
    );
    expect(padding).toBeLessThanOrEqual(6);

    const fontSize = await preElement.evaluate((el) =>
      parseInt(window.getComputedStyle(el).fontSize)
    );
    expect(fontSize).toBe(11);

    await expect(preElement).toBeVisible();
    const isVisible = await preElement.isVisible();
    expect(isVisible).toBe(true);
  });
});
