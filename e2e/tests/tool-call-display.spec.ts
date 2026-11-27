import { test, expect } from '@playwright/test';

// 두 describe는 서로 다른 픽스처를 읽으므로 beforeEach를 각자 유지한다.

test.describe('Tool Detail View (VW-AC4)', () => {
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

  test('should display tool_use message in timeline', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    await expect(timeline).toBeVisible();

    await expect(timeline.getByText(/I'd be happy to help you analyze the dataset/i)).toBeVisible();

    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    await expect(messageWithTool.getByTestId('tool-use-indicator')).toBeVisible();
  });

  test('should display tool name inline next to collapse button', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const singleToolMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });
    const inlineNames = singleToolMessage.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('DataAnalyzer');

    const multiToolMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });
    const multiInlineNames = multiToolMessage.getByTestId('tool-names-inline');
    await expect(multiInlineNames).toBeVisible();
    await expect(multiInlineNames).toContainText('FileReader');
    await expect(multiInlineNames).toContainText('SchemaValidator');
  });

  test('should expand tool details when message with tool_use is clicked', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();

    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    await expect(page.getByTestId('tool-name')).toContainText('DataAnalyzer');

    await expect(page.getByTestId('tool-input')).toBeVisible();
    await expect(page.getByTestId('tool-input')).toContainText('input.csv');

    await expect(page.getByText(/file_path/i)).toBeVisible();
  });

  test('should display tool input in formatted JSON', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();

    const toolInput = page.getByTestId('tool-input');
    await expect(toolInput).toBeVisible();

    await expect(toolInput).toContainText('file_path');
    await expect(toolInput).toContainText('input.csv');

    const codeBlock = toolInput.locator('pre, code').first();
    await expect(codeBlock).toBeVisible();
  });

  test('should collapse tool details when clicked again', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    await messageWithTool.click();

    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should show visual indicator when tool details are expanded', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();

    await expect(messageWithTool).toHaveClass(/expanded/);

    const expandIndicator = messageWithTool.locator('[data-testid="expand-indicator"]');
    await expect(expandIndicator).toHaveAttribute('aria-expanded', 'true');
  });

  test('should show collapsed state indicator by default', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();

    const expandIndicator = messageWithTool.locator('[data-testid="expand-indicator"]');
    await expect(expandIndicator).toHaveAttribute('aria-expanded', 'false');
  });

  test('should display tool ID in details', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();

    // 툴 UI는 긴 툴 ID를 8자 프리픽스 + 생략부호로 잘라 보여 주므로 여기서는 프리픽스만 단정한다.
    const toolDetail = page.getByTestId('tool-detail-view');
    await expect(toolDetail.getByTestId('tool-id')).toBeVisible();
    await expect(toolDetail.getByTestId('tool-id')).toContainText('toolu_01');
  });

  test('should handle multiple tool_use blocks in same message', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithMultipleTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i
    });
    await expect(messageWithMultipleTools).toBeVisible();

    await messageWithMultipleTools.click();

    const toolDetailViews = messageWithMultipleTools.locator('[data-testid="tool-detail-view"]');
    await expect(toolDetailViews).toHaveCount(2);

    const toolNames = messageWithMultipleTools.locator('[data-testid="tool-name"]');
    await expect(toolNames.nth(0)).toContainText('FileReader');
    await expect(toolNames.nth(1)).toContainText('SchemaValidator');

    const toolIds = messageWithMultipleTools.locator('[data-testid="tool-id"]');
    await expect(toolIds.nth(0)).toContainText('tool-002');
    await expect(toolIds.nth(1)).toContainText('tool-003');
  });

  test('should support keyboard navigation for expand/collapse', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.focus();
    await messageWithTool.press('Enter');

    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    await messageWithTool.press('Enter');

    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should maintain scroll position when expanding/collapsing', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await messageWithTool.click();
    await expect(page.getByTestId('tool-detail-view')).toBeVisible();

    const scrollAfter = await page.evaluate(() => window.scrollY);
    const scrollDiff = Math.abs(scrollAfter - scrollBefore);
    expect(scrollDiff).toBeLessThan(100);
  });

  test('should display message without tool_use normally', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const regularMessage = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /Can you help me analyze this dataset/i
    });

    await expect(regularMessage).toBeVisible();

    await expect(regularMessage.getByTestId('tool-use-indicator')).not.toBeVisible();

    await regularMessage.click();
    await expect(page.getByTestId('tool-detail-view')).not.toBeVisible();
  });

  test('should highlight syntax in tool input JSON', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await messageWithTool.click();

    const toolInput = page.getByTestId('tool-input');

    const keyElements = toolInput.locator('.json-key');
    await expect(keyElements.first()).toBeVisible();

    const stringElements = toolInput.locator('.json-string');
    await expect(stringElements.first()).toBeVisible();
  });

  test('should be accessible via screen reader', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i
    });

    await expect(messageWithTool).toHaveAttribute('role', 'button');
    await expect(messageWithTool).toHaveAttribute('aria-expanded', 'false');

    await messageWithTool.click();
    await expect(messageWithTool).toHaveAttribute('aria-expanded', 'true');
    const toolDetail = page.getByTestId('tool-detail-view');
    await expect(toolDetail).toHaveAttribute('role', 'region');
    await expect(toolDetail).toHaveAttribute('aria-label', /Tool details for DataAnalyzer/);
  });
});

test.describe('Task Tool Subagent Type Display (VW-AC4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
    await page.getByTestId('session-id-input').fill('session-task-subagent');
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should display Task tool with subagent_type as "Task [code]" in inline view', async ({ page }) => {

    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    const inlineNames = messageWithTaskTool.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task [code]');

    const inlineText = await inlineNames.textContent();
    expect(inlineText).not.toBe('Task');
    expect(inlineText).toMatch(/Task \[code\]/);
  });

  test('should display Task tool with subagent_type as "Task [code]" in detail view header', async ({ page }) => {

    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate this code refactoring task/i,
    });

    await messageWithTaskTool.click();

    const toolDetailView = page.getByTestId('tool-detail-view');
    await expect(toolDetailView).toBeVisible();

    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toBeVisible();
    await expect(toolName).toContainText('Task [code]');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task \[code\]|Task \[code\]/);
  });

  test('should display non-Task tools (FileReader) with name only, no brackets', async ({ page }) => {

    const timeline = page.getByTestId('timeline-view');
    const messageWithFileReader = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the configuration file/i,
    });

    const inlineNames = messageWithFileReader.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('FileReader');

    const inlineText = await inlineNames.textContent();
    expect(inlineText).not.toMatch(/\[.*\]/);

    await messageWithFileReader.click();

    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('FileReader');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });

  test('should display Task tool without subagent_type as "Task" only (edge case)', async ({ page }) => {

    const timeline = page.getByTestId('timeline-view');
    const messageWithTaskNoSubagent = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll delegate the test analysis/i,
    });

    const inlineNames = messageWithTaskNoSubagent.getByTestId('tool-names-inline');
    await expect(inlineNames).toBeVisible();
    await expect(inlineNames).toContainText('Task');

    const inlineText = await inlineNames.textContent();
    expect(inlineText).toBe('Task');
    expect(inlineText).not.toMatch(/\[.*\]/);

    await messageWithTaskNoSubagent.click();

    const toolDetailView = page.getByTestId('tool-detail-view');
    const toolName = toolDetailView.getByTestId('tool-name');
    await expect(toolName).toContainText('Task');

    const toolNameText = await toolName.textContent();
    expect(toolNameText).toMatch(/Tool: Task$|^Task$/);
    expect(toolNameText).not.toMatch(/\[.*\]/);
  });
});
