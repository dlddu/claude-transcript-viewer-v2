import { test, expect } from '@playwright/test';

/**
 * Text Truncation and Message Timestamps (VW-AC5)
 *
 * VW-AC5 하나가 두 가지를 함께 보장한다: 긴 텍스트는 절단해 타임라인 가독성을 유지하고,
 * 각 메시지에 타임스탬프를 표시한다. 예전에는 두 스펙 파일로 갈려 있었으나 AC 하나가
 * 스펙 하나를 소유하도록 병합했다. 두 describe 블록 모두 seed 픽스처 session-abc123을 읽는다.
 *
 * 절단 이력: 이 스펙의 절단 파트는 TDD Red 단계에서 tool ID/파일 경로 툴팁·복사 UI를 가정하고
 * 전부 test.skip으로 작성돼 있었다. 이후 절단 기능이 truncateToolId /
 * truncateFilePathsInObject / TruncatedText로 실제 구현되었으나, 스킵된 스펙은
 * (a) 존재하지 않는 testid와 (b) 실제 truncate 규칙과 어긋나는 기대값을 담고 있었다.
 * 지금은 실제 구현과 픽스처에 맞춰, 툴 입력의 파일 경로가 디렉토리를 제거한 파일명 형태로
 * 절단되어 렌더된다는 점과, 긴 툴 ID가 8자 프리픽스 + 생략부호로 절단된다는 점을 함께 검증한다.
 * (픽스처의 DataAnalyzer 툴 ID를 실제 툴 ID처럼 긴 값으로 두어 생략부호 절단이 E2E에서 발동한다.)
 * tool-detail-view의 tool-input 단정은 'input.csv' 포함 여부만 보는데 이는 전체 경로
 * '/data/input.csv'도 substring으로 포함하므로 절단 자체를 검증하지 못한다. 여기서는 원본
 * 디렉토리 경로가 사라졌음을 함께 단정한다.
 *
 * 참고: TruncatedText 툴팁/복사 상호작용은 컴포넌트 단위 테스트에서 다룬다(AC 문서 밖).
 *
 * Test Status: ACTIVE
 *
 * Fixture: e2e/fixtures/session-abc123.jsonl
 *   - msg-001 (05:00:00Z) User, msg-002 (05:00:05Z) Assistant + DataAnalyzer(file_path=/data/input.csv)
 *   - msg-005 (05:01:05Z) Assistant + FileReader(path=/app/config.json), msg-006 (05:01:50Z) Assistant
 */

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

    // 툴 상세 확장
    await messageWithTool.click();

    const toolInput = messageWithTool.getByTestId('tool-input');
    await expect(toolInput).toBeVisible();

    // 절단된 파일명은 보이되, 원본 디렉토리 경로는 노출되지 않아야 한다.
    await expect(toolInput).toContainText('input.csv');
    await expect(toolInput).not.toContainText('/data/input.csv');
    await expect(toolInput).not.toContainText('/data/');
  });

  test('긴 툴 ID가 8자 프리픽스 + 생략부호로 절단된다', async ({ page }) => {
    // 픽스처의 DataAnalyzer 툴 ID는 실제 툴 ID처럼 긴 값(toolu_01A9B8C7D6E5F4G3H2)이다.
    const timeline = page.getByTestId('timeline-view');
    const messageWithTool = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'd be happy to help you analyze the dataset/i,
    });

    // 툴 상세 확장
    await messageWithTool.click();

    const toolId = messageWithTool.getByTestId('tool-id');
    await expect(toolId).toBeVisible();

    // 8자 프리픽스 + 생략부호만 표시되고, 원본 전체 ID는 표시 영역에 노출되지 않는다.
    await expect(toolId).toContainText('toolu_01...');
    await expect(toolId).not.toContainText('toolu_01A9B8C7D6E5F4G3H2');
  });

  test('다중 툴 메시지: 각 툴 입력의 경로도 파일명으로 절단된다', async ({ page }) => {
    const timeline = page.getByTestId('timeline-view');
    const messageWithTools = timeline.locator('[data-testid="timeline-item"]').filter({
      hasText: /I'll read the config and validate the schema/i,
    });

    await messageWithTools.click();

    // 첫 번째 툴(FileReader)의 입력 경로 /app/config.json → config.json
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
