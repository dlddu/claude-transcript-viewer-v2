import { test, expect } from '@playwright/test';


test.describe('Text Truncation (VW-AC5)', () => {
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

  test('단일 툴 메시지: 입력의 파일 경로가 디렉토리 없이 파일명으로 절단된다', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i,
    });

    await messageWithTool.click();

    const toolInput = messageWithTool.getByTestId('tool-input');
    await expect(toolInput).toBeVisible();

    // tool-call-display.spec.ts 의 tool-input 단정은 'input.csv' 포함 여부만 보는데 전체 경로
    // '/data/input.csv'도 substring으로 포함하므로 절단 자체를 검증하지 못한다. 여기서는 원본
    // 디렉토리 경로가 사라졌음을 함께 단정한다.
    await expect(toolInput).toContainText('input.csv');
    await expect(toolInput).not.toContainText('/data/input.csv');
    await expect(toolInput).not.toContainText('/data/');
  });

  test('긴 툴 ID가 8자 프리픽스 + 생략부호로 절단된다', async ({ page }) => {
    // 픽스처의 DataAnalyzer 툴 ID는 실제 툴 ID처럼 긴 값(toolu_01A9B8C7D6E5F4G3H2)으로, 8자 프리픽스 절단이 E2E에서 실제로 발동하게 둔다.
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i,
    });

    await messageWithTool.click();

    const toolId = messageWithTool.getByTestId('tool-id');
    await expect(toolId).toBeVisible();

    await expect(toolId).toContainText('toolu_01...');
    await expect(toolId).not.toContainText('toolu_01A9B8C7D6E5F4G3H2');
  });

  test('다중 툴 메시지: 각 툴 입력의 경로도 파일명으로 절단된다', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i,
    });

    await messageWithTools.click();

    const firstToolInput = messageWithTools.getByTestId('tool-input').first();
    await expect(firstToolInput).toBeVisible();
    await expect(firstToolInput).toContainText('config.json');
    await expect(firstToolInput).not.toContainText('/app/config.json');
    await expect(firstToolInput).not.toContainText('/app/');
  });
});

test.describe('Message Timestamps (VW-AC5)', () => {
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

    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    const count = await mainMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const timestamp = mainMessages.nth(i).locator('[data-testid="message-timestamp"]');
      await expect(timestamp).toBeVisible();
      const text = await timestamp.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should display timestamps on subagent messages when group is expanded', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const groupHeaders = timeline.locator('[data-testid="subagent-group-header"]');
    await expect(groupHeaders.first()).toBeVisible();
    await groupHeaders.first().click();

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

    const firstTimestamp = timeline
      .locator('[data-testid="timeline-item"]:not(.message-subagent)')
      .first()
      .locator('[data-testid="message-timestamp"]');

    await expect(firstTimestamp).toBeVisible();
    const text = await firstTimestamp.textContent();

    // The timestamp for msg-001 is 2026-02-01T05:00:00Z and formatTimestamp uses
    // toLocaleString with month:'short', so the rendered text carries a short month name
    expect(text).toContain('Feb');
    expect(text).toMatch(/\d{1,2}/); // day number
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/); // HH:MM:SS
  });

  test('should show different timestamps for messages at different times', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const mainMessages = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)');
    const firstTimestamp = await mainMessages.first().locator('[data-testid="message-timestamp"]').textContent();
    const secondTimestamp = await mainMessages.nth(1).locator('[data-testid="message-timestamp"]').textContent();

    expect(firstTimestamp?.trim().length).toBeGreaterThan(0);
    expect(secondTimestamp?.trim().length).toBeGreaterThan(0);

    // msg-002 has a tool_result so may be hidden; the first and the last main message are
    // compared instead (05:00:00 vs 05:01:50), so the difference is not flaky
    const lastMain = mainMessages.last();
    const lastTimestamp = await lastMain.locator('[data-testid="message-timestamp"]').textContent();
    expect(firstTimestamp).not.toEqual(lastTimestamp);
  });

  test('should position timestamp next to the role label', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');

    const firstMessage = timeline.locator('[data-testid="timeline-item"]:not(.message-subagent)').first();
    const roleContainer = firstMessage.locator('.message-role');
    const timestamp = roleContainer.locator('[data-testid="message-timestamp"]');

    await expect(timestamp).toBeVisible();
    await expect(roleContainer).toContainText('User');
    await expect(roleContainer.locator('[data-testid="message-timestamp"]')).toBeVisible();
  });
});
