import { test, expect } from '@playwright/test';

/**
 * Message Timestamps E2E Tests
 *
 * Purpose: Verify that each message in the timeline displays a formatted timestamp
 * next to the role label (User/Assistant).
 *
 * Test Status: ACTIVE
 *
 * Fixture Data:
 * - Backend mock: session-abc123
 *   - msg-001 (05:00:00Z) User: "Can you help me analyze this dataset?"
 *   - msg-002 (05:00:05Z) Assistant: "I'd be happy to help..." (with tool)
 *   - subagent messages (05:00:10Z – 05:00:49Z)
 *   - msg-003 (05:00:50Z) Assistant: "Analysis complete!"
 *   - msg-004 (05:01:00Z) User: "Now read the config file..."
 *   - msg-005 (05:01:05Z) Assistant: "I'll read the config..." (with tools)
 *   - msg-006 (05:01:50Z) Assistant: "The config file is valid..."
 */
test.describe('Message Timestamps', () => {
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

  test('should display a timestamp on each main agent message', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Main agent messages should each have a visible timestamp
    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    const count = await mainMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const timestamp = mainMessages.nth(i).locator('[data-testid="message-timestamp"]');
      await expect(timestamp).toBeVisible();
      // Timestamp text should not be empty
      const text = await timestamp.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should display timestamps on subagent messages when group is expanded', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Expand the first subagent group
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();
    await groupHeaders.first().click();

    // Subagent messages inside the expanded group should have timestamps
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
    await expect(groupBody).toBeVisible();

    const subagentTimestamps = groupBody.locator('[data-testid="message-timestamp"]');
    const count = await subagentTimestamps.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      await expect(subagentTimestamps.nth(i)).toBeVisible();
      const text = await subagentTimestamps.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should display timestamps in a human-readable format', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Get the first main message timestamp
    const firstTimestamp = timeline
      .locator('[data-testid="timeline-item"]:not(.message-subagent)')
      .first()
      .locator('[data-testid="message-timestamp"]');

    await expect(firstTimestamp).toBeVisible();
    const text = await firstTimestamp.textContent();

    // The timestamp for msg-001 is 2026-02-01T05:00:00Z
    // formatTimestamp uses toLocaleString with month:'short', so expect "Feb"
    // and time components like "05:00:00"
    expect(text).toContain('Feb');
    expect(text).toMatch(/\d{1,2}/); // day number
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/); // HH:MM:SS
  });

  test('should show different timestamps for messages at different times', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Get timestamps of the first two main messages
    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    const firstTimestamp = await mainMessages.first().locator('[data-testid="message-timestamp"]').textContent();
    const secondTimestamp = await mainMessages.nth(1).locator('[data-testid="message-timestamp"]').textContent();

    // They should be non-empty
    expect(firstTimestamp?.trim().length).toBeGreaterThan(0);
    expect(secondTimestamp?.trim().length).toBeGreaterThan(0);

    // They should be different (msg-001 at 05:00:00 vs msg-002 at 05:00:05 — but msg-002
    // has a tool_result so may be hidden; msg-003 at 05:00:50 is different)
    // The key point: at least some timestamps differ
    // Since first user msg is 05:00:00 and last assistant is 05:01:50, they must differ
    const lastMain = mainMessages.last();
    const lastTimestamp = await lastMain.locator('[data-testid="message-timestamp"]').textContent();
    expect(firstTimestamp).not.toEqual(lastTimestamp);
  });

  test('should position timestamp next to the role label', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // The timestamp should be inside the .message-role container
    const firstMessage = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)').first();
    const roleContainer = firstMessage.locator('.message-role');
    const timestamp = roleContainer.locator('[data-testid="message-timestamp"]');

    await expect(timestamp).toBeVisible();
    await expect(roleContainer).toContainText('User');
    await expect(roleContainer.locator('[data-testid="message-timestamp"]')).toBeVisible();
  });
});
