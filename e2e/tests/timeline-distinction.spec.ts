import { test, expect } from '@playwright/test';
import { SESSION_WITH_SUBAGENTS, loadSession } from './support/timeline';

test.describe('Timeline Main/Subagent Distinction (VW-AC2)', () => {
  test.beforeEach(async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
  });

  test('distinguishes main-agent messages from subagent groups', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    await expect(timeline.locator('.subagent-group').first()).toBeVisible();
    await expect(timeline.locator('[data-testid="subagent-group-header"]').first()).toBeVisible();

    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    await expect(mainMessages.first()).toBeVisible();
  });

  test('displays subagent metadata inline with the content', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const firstHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    await expect(firstHeader).toBeVisible();

    await expect(firstHeader.locator('.subagent-group-name')).toContainText(/Subagent/i);
    const countBadge = firstHeader.locator('[data-testid="subagent-group-count"]');
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toContainText(/\d+ messages?/);
  });
});
