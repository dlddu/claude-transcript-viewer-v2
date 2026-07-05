import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TranscriptViewer } from './TranscriptViewer';
import type { Transcript } from '../types/transcript';

/**
 * VW-AC5 (긴 텍스트 절단) 통합 커버리지.
 *
 * 배경: 뷰어는 truncateToolId / truncateFilePathsInObject 로 툴 ID와 툴 입력의
 * 파일 경로를 절단해 타임라인 가독성을 유지한다(PRD viewer, VW-AC5). 절단 유틸과
 * TruncatedText 컴포넌트에는 단위 테스트가 있으나, "실제 타임라인에서 원본이 아니라
 * 절단된 형태로 렌더된다"는 통합 수준의 단정은 없었다. tool-detail-view.spec.ts 의
 * `tool-input` 단정은 'input.csv' 포함 여부만 보는데, 이는 전체 경로 '/data/input.csv'
 * 도 substring 으로 포함하므로 절단 자체를 검증하지 못한다.
 *
 * 이 테스트는 TranscriptViewer 를 인메모리 트랜스크립트로 렌더링하여
 * (1) 긴 툴 ID 가 8자 프리픽스 + 생략부호로 절단되고,
 * (2) 깊은 경로가 생략부호 + 파일명으로, 얕은 경로가 파일명만으로 절단되며,
 * (3) 원본 전체 문자열은 표시 영역에 노출되지 않음을 단정한다.
 */

function makeTranscript(toolInput: unknown, toolId: string): Transcript {
  return {
    id: 'test-transcript-trunc',
    session_id: 'session-trunc',
    content: '',
    messages: [
      {
        type: 'assistant',
        sessionId: 'session-trunc',
        timestamp: '2026-02-01T05:00:05Z',
        uuid: 'msg-tool',
        parentUuid: null,
        agentId: 'session-trunc',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading files for you' },
            {
              type: 'tool_use',
              id: toolId,
              name: 'FileReader',
              input: toolInput,
            },
          ],
        },
      },
    ],
  };
}

function expandFirstTool(container: HTMLElement) {
  const timelineItem = container.querySelector<HTMLElement>('[data-testid="timeline-item"]');
  if (!timelineItem) throw new Error('timeline-item not rendered');
  fireEvent.click(timelineItem);
}

describe('TranscriptViewer 절단 (VW-AC5)', () => {
  it('긴 툴 ID를 8자 프리픽스 + 생략부호로 절단해 표시한다', async () => {
    const fullId = 'toolu_01ABCDEFGHIJKLMNOP';
    const { getByTestId, findByTestId } = render(
      <TranscriptViewer transcript={makeTranscript({ note: 'no path here' }, fullId)} />
    );

    expandFirstTool(getByTestId('transcript-viewer'));

    const toolId = await findByTestId('tool-id');
    // 노출되는 형태는 앞 8자 + '...'
    expect(toolId).toHaveTextContent('toolu_01...');
    // 절단 전 원본 전체 ID는 (툴팁을 열기 전) 표시 영역에 없어야 한다
    expect(toolId.textContent).not.toContain(fullId);
  });

  it('8자 이하의 짧은 툴 ID는 절단하지 않는다 (경계값)', async () => {
    const shortId = 'tool-001'; // 정확히 8자
    const { getByTestId, findByTestId } = render(
      <TranscriptViewer transcript={makeTranscript({ note: 'no path here' }, shortId)} />
    );

    expandFirstTool(getByTestId('transcript-viewer'));

    const toolId = await findByTestId('tool-id');
    expect(toolId).toHaveTextContent(shortId);
    // 짧은 ID에는 생략부호가 붙지 않아야 한다
    expect(toolId.textContent).not.toContain('...');
  });

  it('툴 입력의 깊은 경로는 생략부호 + 파일명으로, 얕은 경로는 파일명만으로 절단한다', async () => {
    const deepPath = '/very/long/path/to/some/directory/config.json';
    const shallowPath = '/data/input.csv';
    const { getByTestId, findByTestId } = render(
      <TranscriptViewer
        transcript={makeTranscript(
          { config_path: deepPath, data_path: shallowPath },
          'toolu_01ABCDEFGHIJKLMNOP'
        )}
      />
    );

    expandFirstTool(getByTestId('transcript-viewer'));

    const toolInput = await findByTestId('tool-input');
    const text = toolInput.textContent ?? '';

    // 절단된 형태가 보여야 한다
    expect(text).toContain('...config.json'); // 깊은 경로 → 생략부호 + 파일명
    expect(text).toContain('input.csv'); // 얕은 경로 → 파일명만

    // 원본 디렉토리 경로는 절단 영역에 노출되지 않아야 한다 (절단 자체를 단정)
    expect(text).not.toContain('/very/long/path');
    expect(text).not.toContain('/data/');
    expect(text).not.toContain(deepPath);
    expect(text).not.toContain(shallowPath);
  });
});
