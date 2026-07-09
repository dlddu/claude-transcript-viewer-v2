import { test, expect } from '@playwright/test';
import {
  SESSION_WITHOUT_SUBAGENTS,
  SESSION_WITH_SUBAGENTS,
  expandAllSubagentGroups,
  loadSession,
} from './support/timeline';

/**
 * Unified Timeline (VW-AC1)
 *
 * Purpose: main-agent and subagent messages appear in a single, chronologically
 * ordered timeline, with subagent messages inline at their invocation point —
 * and a session WITHOUT subagents renders just as correctly (no subagent group
 * is created, no error surfaced).
 *
 * The main/subagent visual distinction is VW-AC2's job
 * (`timeline-distinction.spec.ts`); expand/collapse and keyboard navigation are
 * VW-AC3's (`timeline-expand-collapse.spec.ts`). Groups are only expanded here
 * to reveal the content whose *placement and order* this AC is about.
 *
 * Test Status: ACTIVE
 */

test.describe('Unified Timeline (VW-AC1)', () => {
  test('displays a session with subagents in one timeline', async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();

    // Main-agent content is present, subagent groups exist (collapsed by default).
    await expect(timeline.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
    await expect(timeline.locator('[data-testid="subagent-group"]').first()).toBeVisible();

    await expandAllSubagentGroups(timeline);

    // Subagent content lives in the same timeline as the main-agent messages.
    await expect(timeline.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(timeline.getByText(/Creating visualizations/i)).toBeVisible();
    await expect(timeline.locator('[data-testid="timeline-item"]').first()).toBeVisible();
  });

  test('renders subagent messages inline at the invocation point', async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
    const timeline = page.getByTestId('timeline-view');

    await expect(timeline).toContainText(/Can you help me analyze this dataset/i);
    await expect(timeline.locator('[data-testid="subagent-group-header"]').first()).toBeVisible();

    await expandAllSubagentGroups(timeline);

    await expect(timeline.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(timeline.getByText(/Creating visualizations/i)).toBeVisible();
  });

  test('orders timeline items chronologically', async ({ page }) => {
    // The backend merges main + subagent messages and sorts by timestamp.
    // Fixture order:
    //   msg-001 (05:00:00) "Can you help me analyze"
    //   msg-002 (05:00:05) "I'd be happy to help" (main, with tool)
    //   sub-001 (05:00:10) "Analyze the CSV file" (subagent a1b2c3d)
    //   ...
    //   msg-006 (05:01:50) "The config file is valid" (main)
    await loadSession(page, SESSION_WITH_SUBAGENTS);
    const timeline = page.getByTestId('timeline-view');

    await expandAllSubagentGroups(timeline);

    const items = timeline.locator('[data-testid="timeline-item"]');
    expect(await items.count()).toBeGreaterThanOrEqual(4);

    // Earliest timestamp first, latest main-agent message last.
    await expect(items.first()).toContainText(/Can you help me analyze this dataset/i);
    await expect(items.last()).toContainText(/config file is valid|config-v2 schema/i);
  });

  test('renders a session with no subagents without creating any group', async ({ page }) => {
    // session-xyz789 is seeded with only main-agent messages and no subagents/
    // directory. Navigating fresh (rather than reusing a with-subagents session)
    // ensures no leftover group can mask the assertion.
    await loadSession(page, SESSION_WITHOUT_SUBAGENTS);

    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText(/Can you summarize this report/i)).toBeVisible();
    await expect(timeline.locator('[data-testid="timeline-item"]').first()).toBeVisible();

    await expect(page.getByTestId('subagent-group')).toHaveCount(0);
    await expect(page.getByTestId('subagent-group-header')).toHaveCount(0);

    // No error surfaced during the lookup.
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
