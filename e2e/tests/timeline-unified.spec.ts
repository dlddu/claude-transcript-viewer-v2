import { test, expect } from '@playwright/test';
import {
  SESSION_WITHOUT_SUBAGENTS,
  SESSION_WITH_SUBAGENTS,
  expandAllSubagentGroups,
  loadSession,
} from './support/timeline';

test.describe('Unified Timeline (VW-AC1)', () => {
  test('displays a session with subagents in one timeline', async ({ page }) => {
    await loadSession(page, SESSION_WITH_SUBAGENTS);
    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();

    await expect(timeline.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
    await expect(timeline.locator('[data-testid="subagent-group"]').first()).toBeVisible();

    await expandAllSubagentGroups(timeline);

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
    await loadSession(page, SESSION_WITH_SUBAGENTS);
    const timeline = page.getByTestId('timeline-view');

    await expandAllSubagentGroups(timeline);

    const items = timeline.locator('[data-testid="timeline-item"]');
    expect(await items.count()).toBeGreaterThanOrEqual(4);

    await expect(items.first()).toContainText(/Can you help me analyze this dataset/i);
    await expect(items.last()).toContainText(/config file is valid|config-v2 schema/i);
  });

  test('renders a session with no subagents without creating any group', async ({ page }) => {
    // session-xyz789 has no subagents; load it fresh so a leftover group from another session cannot mask the zero-group assertion.
    await loadSession(page, SESSION_WITHOUT_SUBAGENTS);

    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText(/Can you summarize this report/i)).toBeVisible();
    await expect(timeline.locator('[data-testid="timeline-item"]').first()).toBeVisible();

    await expect(page.getByTestId('subagent-group')).toHaveCount(0);
    await expect(page.getByTestId('subagent-group-header')).toHaveCount(0);

    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
