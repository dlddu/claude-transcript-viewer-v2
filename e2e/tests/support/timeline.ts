import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared support for the timeline E2E specs.
 *
 * VW-AC1/AC2/AC3 each own one spec file (timeline-unified, timeline-distinction,
 * timeline-expand-collapse); the loading and expanding steps they share live
 * here. Not a spec: Playwright's default testMatch only collects `*.spec.ts`.
 *
 * Fixture Data (seeded via `server seed --dir e2e/fixtures`):
 * - session-abc123.jsonl + session-abc123/agent-{a1b2c3d,xyz789}.jsonl (subagents)
 * - session-xyz789.jsonl (main-agent messages only, no subagents/ directory)
 */

/** Loads a session through the Session ID lookup tab and waits for the viewer. */
export async function loadSession(page: Page, sessionId: string): Promise<void> {
  await page.goto('/');
  const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
  if ((await sessionIdTab.count()) > 0) {
    await sessionIdTab.click();
  }
  await page.getByTestId('session-id-input').fill(sessionId);
  await page.getByTestId('session-id-lookup-button').click();
  await expect(page.getByTestId('transcript-viewer')).toBeVisible();
}

/** The session that exercises the with-subagents paths. */
export const SESSION_WITH_SUBAGENTS = 'session-abc123';

/** The session that exercises the no-subagents path (VW-AC1). */
export const SESSION_WITHOUT_SUBAGENTS = 'session-xyz789';

/** Subagent groups are collapsed by default; open every one of them. */
export async function expandAllSubagentGroups(timeline: Locator): Promise<void> {
  const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
  const count = await groupHeaders.count();
  for (let i = 0; i < count; i++) {
    await groupHeaders.nth(i).click();
  }
}
