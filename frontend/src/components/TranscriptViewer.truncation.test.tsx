import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TranscriptViewer } from './TranscriptViewer';
import type { Transcript } from '../types/transcript';

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
    expect(toolId).toHaveTextContent('toolu_01...');
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

    expect(text).toContain('...config.json');
    expect(text).toContain('input.csv');

    expect(text).not.toContain('/very/long/path');
    expect(text).not.toContain('/data/');
    expect(text).not.toContain(deepPath);
    expect(text).not.toContain(shallowPath);
  });
});
