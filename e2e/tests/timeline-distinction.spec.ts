import { test, expect } from '@playwright/test';
import { SESSION_WITH_SUBAGENTS, loadSession } from './support/timeline';

/**
 * Main / Subagent Visual Distinction and Metadata (VW-AC2)
 *
 * Purpose: the timeline visually separates main-agent content from subagent
 * content, and each subagent group carries its metadata (name, message count)
 * inline with the content rather than in a separate panel.
 *
 * Whether the two message kinds appear in one chronological timeline at all is
 * VW-AC1's job (`timeline-unified.spec.ts`).
 *
 * Test Status: ACTIVE
 */

test.describe('Timeline Main/Subagent Distinction (VW-AC2)', () => {
  test.beforeEach(async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
  });

  test('distinguishes main-agent messages from subagent groups', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Subagent content is wrapped in its own styled group...
    await expect(timeline.locator('.subagent-group').first()).toBeVisible();
    await expect(timeline.locator('[data-testid="subagent-group-header"]').first()).toBeVisible();

    // ...and main-agent messages are not inside a subagent group.
    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    await expect(mainMessages.first()).toBeVisible();
  });

  test('displays subagent metadata inline with the content', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const firstHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    await expect(firstHeader).toBeVisible();

    // Name and message-count badge ride along with the group.
    await expect(firstHeader.locator('.subagent-group-name')).toContainText(/Subagent/i);
    const countBadge = firstHeader.locator('[data-testid="subagent-group-count"]');
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toContainText(/\d+ messages?/);
  });
});
