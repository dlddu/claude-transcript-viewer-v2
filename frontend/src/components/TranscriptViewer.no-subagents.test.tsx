import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptViewer } from './TranscriptViewer';
import type { Transcript } from '../types/transcript';

// 서브에이전트가 전혀 없는 세션(모든 메시지가 메인, agentId 미지정 — seed 픽스처
// session-xyz789 와 동일한 형태). loadTranscript 가 넘겨주듯 시간순으로 정렬해 둔다.
function makeMainOnlyTranscript(): Transcript {
  return {
    id: 'test-no-subagents',
    session_id: 'session-no-sub',
    content: '',
    subagents: [],
    messages: [
      {
        type: 'user',
        sessionId: 'session-no-sub',
        timestamp: '2026-02-01T06:00:00Z',
        uuid: 'm1',
        parentUuid: null,
        message: { role: 'user', content: 'Can you summarize this report?' },
      },
      {
        type: 'assistant',
        sessionId: 'session-no-sub',
        timestamp: '2026-02-01T06:00:03Z',
        uuid: 'm2',
        parentUuid: 'm1',
        message: {
          role: 'assistant',
          content: 'Sure — here are the key points from the report.',
          model: 'claude-sonnet-4-5',
        },
      },
      {
        type: 'user',
        sessionId: 'session-no-sub',
        timestamp: '2026-02-01T06:00:30Z',
        uuid: 'm3',
        parentUuid: 'm2',
        message: { role: 'user', content: 'Great, can you also list the risks?' },
      },
      {
        type: 'assistant',
        sessionId: 'session-no-sub',
        timestamp: '2026-02-01T06:00:33Z',
        uuid: 'm4',
        parentUuid: 'm3',
        message: {
          role: 'assistant',
          content: 'The main risks are cost overruns and timeline slippage.',
        },
      },
    ],
  };
}

describe('TranscriptViewer — session without subagents (VW-AC1)', () => {
  it('renders every main message of a no-subagent session in the unified timeline', () => {
    render(<TranscriptViewer transcript={makeMainOnlyTranscript()} />);

    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    expect(screen.queryByText('Loading transcript...')).not.toBeInTheDocument();
    expect(screen.queryByText('No transcript available')).not.toBeInTheDocument();

    expect(screen.getByText('Can you summarize this report?')).toBeInTheDocument();
    expect(screen.getByText('Sure — here are the key points from the report.')).toBeInTheDocument();
    expect(screen.getByText('Great, can you also list the risks?')).toBeInTheDocument();
    expect(screen.getByText('The main risks are cost overruns and timeline slippage.')).toBeInTheDocument();

    expect(screen.getAllByTestId('timeline-item')).toHaveLength(4);
  });

  it('renders no subagent group or subagent label for a session without subagents', () => {
    render(<TranscriptViewer transcript={makeMainOnlyTranscript()} />);

    expect(screen.queryAllByTestId('subagent-group')).toHaveLength(0);
    expect(screen.queryAllByTestId('subagent-group-header')).toHaveLength(0);
    expect(screen.queryAllByTestId('subagent-group-count')).toHaveLength(0);

    expect(screen.queryByText(/\[Subagent:/)).not.toBeInTheDocument();
  });

  it('renders the main-only timeline in the given chronological order', () => {
    render(<TranscriptViewer transcript={makeMainOnlyTranscript()} />);

    const items = screen.getAllByTestId('timeline-item');
    const order = ['summarize this report', 'key points from the report', 'list the risks', 'cost overruns'];
    const indices = order.map((needle) => items.findIndex((el) => el.textContent?.includes(needle)));

    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('treats a message whose agentId equals the session_id as main, not a subagent', () => {
    const transcript: Transcript = {
      id: 'test-agentid-equals-session',
      session_id: 'session-solo',
      content: '',
      messages: [
        {
          type: 'user',
          sessionId: 'session-solo',
          timestamp: '2026-02-01T07:00:00Z',
          uuid: 's1',
          parentUuid: null,
          agentId: 'session-solo',
          message: { role: 'user', content: 'Just the main agent here.' },
        },
        {
          type: 'assistant',
          sessionId: 'session-solo',
          timestamp: '2026-02-01T07:00:02Z',
          uuid: 's2',
          parentUuid: 's1',
          agentId: 'session-solo',
          message: { role: 'assistant', content: 'No subagents were invoked.' },
        },
      ],
    };

    render(<TranscriptViewer transcript={transcript} />);

    expect(screen.getByText('Just the main agent here.')).toBeInTheDocument();
    expect(screen.getByText('No subagents were invoked.')).toBeInTheDocument();
    expect(screen.queryAllByTestId('subagent-group')).toHaveLength(0);
    expect(screen.queryByText(/\[Subagent:/)).not.toBeInTheDocument();
  });
});
