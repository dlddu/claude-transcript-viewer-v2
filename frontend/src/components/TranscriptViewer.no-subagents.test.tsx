import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptViewer } from './TranscriptViewer';
import type { Transcript } from '../types/transcript';

/**
 * VW-AC1 (통합 타임라인) — "서브에이전트가 없는 세션도 정상 렌더링한다" 보장의 실측 커버리지.
 *
 * 배경: VW-AC1 은 메인/서브에이전트 통합 타임라인과 함께 "서브에이전트가 없는 세션도
 * 정상 렌더링한다"를 명시적으로 요구한다. 그러나 이 절반은 실측 검증되지 않고 있었다.
 *   - E2E `timeline-integration.spec.ts` 의 'should handle sessions with no subagents
 *     gracefully' 는 beforeEach 가 적재한 서브에이전트 포함 픽스처(session-abc123)를
 *     그대로 쓰면서(테스트 주석: "would need a different fixture without subagents.
 *     For now, testing the timeline can handle mixed content") 에러 미발생만 단정했다.
 *     즉 이름과 달리 "서브에이전트 없는 세션"을 실제로 렌더링하지 않았다(decoy).
 *   - 컴포넌트 테스트 `TranscriptViewer.test.tsx` 의 'should handle messages without
 *     agentId field gracefully' 는 메시지 1건이 화면에 보이는지만 확인하고, 다중 메시지
 *     타임라인이 순서대로 렌더되는지도, 서브에이전트 그룹이 생기지 않는지도 단정하지 않았다.
 *
 * 이 테스트는 서브에이전트가 전혀 없는 세션(모든 메시지가 메인)을 TranscriptViewer 에
 * 인메모리로 렌더링하여 다음을 결정적으로 단정한다:
 *   (1) 모든 메인 메시지가 통합 타임라인에 렌더된다,
 *   (2) 서브에이전트 그룹/헤더가 하나도 생기지 않는다(= 서브에이전트 없는 세션임),
 *   (3) 메시지가 주어진 시간순(입력 순서) 그대로 타임라인에 렌더된다,
 *   (4) agentId 가 세션 ID 와 같은 메시지는 서브에이전트가 아니라 메인으로 취급된다.
 *
 * (실사용 seed 픽스처 session-xyz789 가 바로 이 형태의 서브에이전트 없는 세션이며,
 *  대응하는 E2E 는 timeline-integration.spec.ts 에서 이 세션을 실제로 로드하도록 함께 보정한다.)
 */

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

    // 통합 타임라인 컨테이너가 렌더되고 로딩/빈/에러 상태로 빠지지 않는다.
    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    expect(screen.queryByText('Loading transcript...')).not.toBeInTheDocument();
    expect(screen.queryByText('No transcript available')).not.toBeInTheDocument();

    // 네 개의 메인 메시지가 모두 화면에 렌더된다.
    expect(screen.getByText('Can you summarize this report?')).toBeInTheDocument();
    expect(screen.getByText('Sure — here are the key points from the report.')).toBeInTheDocument();
    expect(screen.getByText('Great, can you also list the risks?')).toBeInTheDocument();
    expect(screen.getByText('The main risks are cost overruns and timeline slippage.')).toBeInTheDocument();

    // 타임라인 항목 수는 정확히 메시지 수와 같다(누락/중복 없음).
    expect(screen.getAllByTestId('timeline-item')).toHaveLength(4);
  });

  it('renders no subagent group or subagent label for a session without subagents', () => {
    render(<TranscriptViewer transcript={makeMainOnlyTranscript()} />);

    // 서브에이전트가 없으므로 그룹/헤더/카운트 요소가 하나도 없어야 한다.
    expect(screen.queryAllByTestId('subagent-group')).toHaveLength(0);
    expect(screen.queryAllByTestId('subagent-group-header')).toHaveLength(0);
    expect(screen.queryAllByTestId('subagent-group-count')).toHaveLength(0);

    // "[Subagent: ...]" 라벨 텍스트도 나타나지 않는다.
    expect(screen.queryByText(/\[Subagent:/)).not.toBeInTheDocument();
  });

  it('renders the main-only timeline in the given chronological order', () => {
    render(<TranscriptViewer transcript={makeMainOnlyTranscript()} />);

    const items = screen.getAllByTestId('timeline-item');
    const order = ['summarize this report', 'key points from the report', 'list the risks', 'cost overruns'];
    const indices = order.map((needle) => items.findIndex((el) => el.textContent?.includes(needle)));

    // 각 메시지가 실제로 어떤 타임라인 항목에 존재한다.
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
    }
    // DOM(타임라인) 순서가 시간순 입력 순서와 일치한다.
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('treats a message whose agentId equals the session_id as main, not a subagent', () => {
    // agentId 가 세션 ID 와 동일한 경우(서브에이전트가 아님)도 서브에이전트 그룹을 만들지 않는다.
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
