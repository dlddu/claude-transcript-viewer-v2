import { test, expect } from '@playwright/test';
import { SESSION_WITH_SUBAGENTS, loadSession } from './support/timeline';

test.describe('Timeline Expand/Collapse (VW-AC3)', () => {
  test.beforeEach(async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
  });

  test('expands and collapses a subagent group', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();

    const groupBody = timeline.locator('[data-testid="subagent-group-body"]');
    await expect(groupBody).not.toBeVisible();

    await groupHeaders.first().click();
    await expect(groupBody.first()).toBeVisible();

    await groupHeaders.first().click();
    await expect(groupBody).not.toBeVisible();
  });

  test('keeps the toggled header in view when expanding and collapsing', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const groupHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
    await expect(groupHeader).toBeVisible();

    await groupHeader.click();
    await expect(groupBody).toBeVisible();
    await expect(groupHeader).toBeInViewport();

    await groupHeader.click();
    await expect(groupBody).not.toBeVisible();
    await expect(groupHeader).toBeInViewport();
  });

  test('supports keyboard navigation through timeline items', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const groupHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    await groupHeader.focus();
    await expect(groupHeader).toBeFocused();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'false');

    await groupHeader.click();
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
    await expect(groupBody).toBeVisible();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'true');

    await groupHeader.click();
    await expect(groupBody).not.toBeVisible();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'false');

    // Tool-bearing items (<div role="button">) respond to Enter via onKeyDown.
    const toolItems = timeline.locator('[data-testid="timeline-item"][role="button"]');
    if ((await toolItems.count()) > 0) {
      const toolItem = toolItems.first();
      await toolItem.focus();
      await expect(toolItem).toBeFocused();
      await expect(toolItem).toHaveAttribute('aria-expanded', 'false');

      await toolItem.press('Enter');
      await expect(toolItem).toHaveAttribute('aria-expanded', 'true');
      await expect(toolItem.locator('[data-testid="tool-detail-view"]').first()).toBeVisible();
    }
  });
});
