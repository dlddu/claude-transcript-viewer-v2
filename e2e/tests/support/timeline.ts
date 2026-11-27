import { expect, type Locator, type Page } from '@playwright/test';

// Not a spec: Playwright's default testMatch only collects `*.spec.ts`.

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

export const SESSION_WITH_SUBAGENTS = 'session-abc123';

export const SESSION_WITHOUT_SUBAGENTS = 'session-xyz789';

/** Subagent groups are collapsed by default; open every one of them. */
export async function expandAllSubagentGroups(timeline: Locator): Promise<void> {
  const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
  const count = await groupHeaders.count();
  for (let i = 0; i < count; i++) {
    await groupHeaders.nth(i).click();
  }
}
