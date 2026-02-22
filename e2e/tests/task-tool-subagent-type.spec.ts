import { test, expect } from '@playwright/test';

/**
 * Task Tool Subagent Type Display E2E Tests (DLD-357)
 *
 * Purpose: Test the display of Task tool names with subagent_type information.
 * When a Task tool_use has input.subagent_type, it should display as "Task [subagent_type]"
 * both in inline display and in the expanded detail view header.
 *
 * Test Status: ACTIVE (TDD Green Phase)
 * Reason: Implementation complete. EnrichedToolUse type updated, enrichMessages.ts
 * extracts subagent_type, and TranscriptViewer.tsx displays the formatted tool name.
 *
 * Parent Issue: DLD-356 (Display subagent type in Task tool name)
 * Implementation Issue: DLD-358 (Task 1-2: Implementation and E2E test activation)
 *
 * Expected Behavior:
 * - Task tool with subagent_type: Display "Task [code]" or "Task [data]" etc.
 * - Task tool without subagent_type: Display "Task" only
 * - Non-Task tools (e.g., FileReader): Display tool name as-is
 * - Both inline and detail view should show the formatted name consistently
 *
 * Implementation Complete:
 * 1. EnrichedToolUse type updated to include subagentType?: string
 * 2. enrichMessages.ts extracts input.subagent_type for Task tools
 * 3. TranscriptViewer.tsx inline display shows "Task [subagent_type]"
 * 4. TranscriptViewer.tsx detail header shows "Tool: Task [subagent_type]"
 * 5. All tests activated (test.skip removed)
 *
 * Fixture Data:
 * - e2e/fixtures/session-task-subagent.jsonl
 *   - msg-002 contains Task tool_use with subagent_type: "code"
 *   - msg-005 contains Task tool_use without subagent_type (edge case)
 *   - msg-008 contains FileReader tool_use (control case)
 */
test.describe('Task Tool Subagent Type Display', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and load a transcript with Task tool_use
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-task-subagent');
    await page.getByTestId('session-id-lookup-button').click();

    // Wait for transcript to load
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display Task tool with subagent_type as "Task [code]" in inline view', async ({ page }) => {

    // Arrange - Find the message with Task tool_use that has subagent_type: "code"
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    // Assert - Inline tool names should show "Task [code]"
    const inlineNames = messageWithTaskTool.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task [code]');

    // Should not show just "Task" without the subagent type
    const inlineText = await inlineNames.textContent();
    expect(inlineText).not.toBe('Task');
    expect(inlineText).toMatch(/Task \[code\]/);
  });

  test('should display Task tool with subagent_type as "Task [code]" in detail view header', async ({ page }) => {

    // Arrange - Find and expand the message with Task tool_use
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    // Act - Click to expand tool details
    await messageWithTaskTool.click();

    // Assert - Tool detail header should show "Tool: Task [code]"
    const toolDetailView = page.getByTestId('tool-detail-view');
    await expect(toolDetailView).toBeVisible();

    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toBeVisible();
    await expect(toolName).toContainText('Task [code]');

    // Verify the exact format in the detail header
    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task \[code\]|Task \[code\]/);
  });

  test('should display non-Task tools (FileReader) with name only, no brackets', async ({ page }) => {

    // Arrange - Find the message with FileReader tool_use
    const timeline = page.getByTestId('timeline-view');
    const messageWithFileReader = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the configuration file/i,
    });

    // Assert - Inline should show "FileReader" without brackets
    const inlineNames = messageWithFileReader.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('FileReader');

    const inlineText = await inlineNames.textContent();
    // Should not have brackets for non-Task tools
    expect(inlineText).not.toMatch(/\[.*\]/);

    // Act - Expand to check detail view
    await messageWithFileReader.click();

    // Assert - Detail view should also show "FileReader" without brackets
    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('FileReader');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });

  test('should display Task tool without subagent_type as "Task" only (edge case)', async ({ page }) => {

    // Arrange - Find the message with Task tool_use that has NO subagent_type
    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskNoSubagent = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate the test analysis/i,
    });

    // Assert - Inline should show just "Task" without brackets
    const inlineNames = messageWithTaskNoSubagent.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task');

    const inlineText = await inlineNames.textContent();
    // Should not have brackets when subagent_type is absent
    expect(inlineText).toBe('Task');
    expect(inlineText).not.toMatch(/\[.*\]/);

    // Act - Expand to check detail view
    await messageWithTaskNoSubagent.click();

    // Assert - Detail view should also show just "Task"
    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('Task');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task$|^Task$/);
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });
});
