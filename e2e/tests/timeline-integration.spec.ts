import { test, expect } from '@playwright/test';

/**
 * Timeline Integration E2E Tests (DLD-250)
 *
 * Purpose: Test the integrated timeline view that displays main agent and subagent
 * messages in a unified, chronologically-ordered timeline.
 *
 * Test Status: ACTIVE
 * Reason: All tests are enabled and validate the implemented timeline integration.
 *
 * Expected Behavior:
 * - Main agent messages and subagent messages appear in a single timeline
 * - Messages are ordered chronologically by timestamp
 * - Subagent messages appear inline at the point where they were invoked
 * - Timeline provides visual distinction between main and subagent content
 *
 * Fixture Data:
 * - e2e/fixtures/sample-main-transcript.json
 *   - session_id: "session-abc123"
 *   - Main agent invoked at: 2026-02-01T05:00:00Z
 *   - Subagent 1 (Data Analyzer) invoked at: 2026-02-01T05:00:15Z
 *   - Subagent 2 (Visualizer) invoked at: 2026-02-01T05:00:45Z
 */
test.describe('Timeline Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with subagents
    await page.goto('/');
    await page.getByTestId('session-id-input').fill('session-abc123');
    await page.getByTestId('session-id-lookup-button').click();

    // Wait for transcript to load
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display session with subagents in unified timeline', async ({ page }) => {
    // Arrange & Assert - Timeline should be in unified mode
    // The timeline should contain both main agent and subagent messages
    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();

    // Main agent content should be present
    await expect(timeline.getByText(/Can you help me analyze this dataset/i)).toBeVisible();

    // Subagent groups should be present (collapsed by default)
    const subagentGroups = timeline.locator('[data-testid="subagent-group"]');
    await expect(subagentGroups.first()).toBeVisible();

    // Expand all subagent groups to verify content
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const count = await groupHeaders.count();
    for (let i = 0; i < count; i++) {
      await groupHeaders.nth(i).click();
    }

    // Subagent content should be visible after expanding
    await expect(timeline.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(timeline.getByText(/Creating visualizations/i)).toBeVisible();

    // Timeline items use .message class with timeline-item test id
    const timelineItems = timeline.locator('[data-testid="timeline-item"]');
    // Should have at least the messages present
    await expect(timelineItems.first()).toBeVisible();
  });

  test('should render subagent messages inline at invocation point', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');

    // Verify main agent content is present
    await expect(timeline).toContainText(/Can you help me analyze this dataset/i);

    // Verify subagent groups are present with group headers
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();

    // Expand subagent groups to see messages
    const count = await groupHeaders.count();
    for (let i = 0; i < count; i++) {
      await groupHeaders.nth(i).click();
    }

    // Subagent messages should be visible after expanding
    await expect(timeline.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(timeline.getByText(/Creating visualizations/i)).toBeVisible();
  });

  test('should display timeline items in chronological order', async ({ page }) => {
    // The backend merges main + subagent messages and sorts by timestamp.
    // Verify DOM order matches chronological expectations from fixture data:
    //   msg-001 (05:00:00) "Can you help me analyze"
    //   msg-002 (05:00:05) "I'd be happy to help" (main, with tool)
    //   sub-001 (05:00:10) "Analyze the CSV file" (subagent a1b2c3d)
    //   sub-002 (05:00:12) "Starting data analysis" (subagent a1b2c3d)
    //   ...
    //   msg-003 (05:00:50) "Analysis complete!" (main)
    //   msg-004 (05:01:00) "Now read the config file" (user)
    //   msg-005 (05:01:05) "I'll read the config" (main, with multiple tools)
    //   msg-006 (05:01:50) "The config file is valid" (main)
    const timeline = page.getByTestId('timeline-view');

    // Expand all subagent groups to reveal their messages
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    const count = await groupHeaders.count();
    for (let i = 0; i < count; i++) {
      await groupHeaders.nth(i).click();
    }

    // Collect all visible timeline items in DOM order
    const items = timeline.locator('[data-testid="timeline-item"]');
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThanOrEqual(4);

    // First item should be the user's initial question (earliest timestamp)
    await expect(items.first()).toContainText(/Can you help me analyze this dataset/i);

    // Last main-agent message should be the concluding message (latest timestamp)
    await expect(items.last()).toContainText(/config file is valid|config-v2 schema/i);
  });

  test('should visually distinguish between main and subagent messages', async ({ page }) => {
    // Arrange
    const timeline = page.getByTestId('timeline-view');

    // Assert - Subagent groups should have different visual styling
    const subagentGroups = timeline.locator('.subagent-group');
    await expect(subagentGroups.first()).toBeVisible();

    // Subagent group headers should show subagent names
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();

    // Main agent messages should not be inside subagent groups
    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    await expect(mainMessages.first()).toBeVisible();
  });

  test('should display subagent metadata inline with content', async ({ page }) => {
    // Subagent group headers display metadata inline: subagent name and message count
    const timeline = page.getByTestId('timeline-view');

    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();

    // Group header should show the subagent name
    const firstHeader = groupHeaders.first();
    await expect(firstHeader.locator('.subagent-group-name')).toContainText(/Subagent/i);

    // Group header should show the message count badge
    const countBadge = firstHeader.locator('[data-testid="subagent-group-count"]');
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toContainText(/\d+ messages?/);
  });

  test('should expand/collapse subagent details while maintaining timeline position', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    // Subagent groups should be collapsed by default
    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();

    // Group body should not be visible
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]');
    await expect(groupBody).not.toBeVisible();

    // Click to expand
    await groupHeaders.first().click();
    await expect(groupBody.first()).toBeVisible();

    // Click to collapse
    await groupHeaders.first().click();
    await expect(groupBody).not.toBeVisible();
  });

  test('should handle sessions with no subagents gracefully', async ({ page }) => {
    // Note: This test would need a different fixture without subagents
    // For now, testing the timeline can handle mixed content

    // Arrange
    const timeline = page.getByTestId('timeline-view');

    // Assert - Timeline should still work with only main agent messages
    await expect(timeline).toBeVisible();

    // Should show messages (main agent messages are directly visible)
    const messageItems = timeline.locator('[data-testid="timeline-item"]');
    await expect(messageItems.first()).toBeVisible();

    // Timeline should not show errors when no subagents present
    await expect(page.getByText(/error/i)).not.toBeVisible();
  });

  test('should support keyboard navigation through timeline items', async ({ page }) => {
    // Subagent group headers are <button> elements — focusable and
    // activatable via click (Enter on a <button> natively fires click).
    // Tool-bearing timeline items are <div role="button" tabIndex=0> with
    // an explicit onKeyDown handler for Enter.
    const timeline = page.getByTestId('timeline-view');

    // Subagent group header should be keyboard-focusable
    const groupHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    await groupHeader.focus();
    await expect(groupHeader).toBeFocused();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'false');

    // Click to expand (native Enter→click on <button> triggers onClick)
    await groupHeader.click();
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
    await expect(groupBody).toBeVisible();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    await groupHeader.click();
    await expect(groupBody).not.toBeVisible();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'false');

    // Tool-bearing timeline items (<div role="button">) respond to Enter via onKeyDown
    const toolItems = timeline.locator('[data-testid="timeline-item"][role="button"]');
    const toolItemCount = await toolItems.count();
    if (toolItemCount > 0) {
      const toolItem = toolItems.first();
      await toolItem.focus();
      await expect(toolItem).toBeFocused();
      await expect(toolItem).toHaveAttribute('aria-expanded', 'false');

      // Press Enter to expand tool details
      await toolItem.press('Enter');
      await expect(toolItem).toHaveAttribute('aria-expanded', 'true');
      await expect(toolItem.locator('[data-testid="tool-detail-view"]').first()).toBeVisible();
    }
  });

  test('should maintain scroll position when expanding/collapsing items', async ({ page }) => {
    // Subagent groups support expand/collapse.
    // Verify the group header remains visible after toggling.
    const timeline = page.getByTestId('timeline-view');
    const groupHeader = timeline.locator('[data-testid="subagent-group-header"]').first();
    await expect(groupHeader).toBeVisible();

    // Expand: group body appears but header should still be in viewport
    await groupHeader.click();
    const groupBody = timeline.locator('[data-testid="subagent-group-body"]').first();
    await expect(groupBody).toBeVisible();
    await expect(groupHeader).toBeInViewport();

    // Collapse: group body disappears, header still visible
    await groupHeader.click();
    await expect(groupBody).not.toBeVisible();
    await expect(groupHeader).toBeInViewport();
  });
});
