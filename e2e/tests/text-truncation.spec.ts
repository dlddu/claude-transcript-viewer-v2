import { test, expect } from '@playwright/test';

/**
 * Text Truncation E2E Tests — VW-AC5 (긴 텍스트 절단)
 *
 * 상태: ACTIVE.
 *
 * 이전 이력: 이 스펙은 TDD Red 단계에서 tool ID/파일 경로 툴팁·복사 UI 를 가정하고
 * 전부 test.skip 으로 작성돼 있었다. 이후 절단 기능이 truncateToolId /
 * truncateFilePathsInObject / TruncatedText 로 실제 구현되었으나, 스킵된 스펙은
 * (a) 존재하지 않는 testid(tool-id 내부 구조)와 (b) 실제 truncate 규칙과 어긋나는
 * 기대값(예: 8자 ID 'tool-001' 이 생략부호로 잘린다는 가정, '/data/input.csv' 가
 * '...input.csv' 로 잘린다는 가정)을 담고 있어 그대로 활성화하면 실패한다.
 *
 * 이 스펙은 실제 구현과 seed 픽스처(session-abc123)에 맞춰, 툴 입력의 파일 경로가
 * 디렉토리를 제거한 파일명 형태로 절단되어 렌더된다는 점을 검증한다. 기존
 * tool-detail-view.spec.ts 의 tool-input 단정은 'input.csv' 포함 여부만 보는데,
 * 이는 전체 경로 '/data/input.csv' 도 substring 으로 포함하므로 절단 자체를
 * 검증하지 못한다. 여기서는 원본 디렉토리 경로가 사라졌음을 함께 단정한다.
 *
 * 참고: 툴 ID 생략부호 절단과 TruncatedText 툴팁/복사 상호작용은 각각 유닛/컴포넌트
 * 테스트(utils/truncate.test.ts, components/TruncatedText.test.tsx,
 * components/TranscriptViewer.truncation.test.tsx)에서 검증한다. seed 픽스처의
 * 툴 ID 는 모두 8자 이하라 생략부호 절단이 발생하지 않으므로 여기서는 다루지 않는다.
 *
 * Fixture: e2e/fixtures/session-abc123.jsonl (session_id: "session-abc123")
 *   - "I'd be happy to help you analyze the dataset" → DataAnalyzer, file_path=/data/input.csv
 *   - "I'll read the config and validate the schema" → FileReader, path=/app/config.json 외
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
