import { describe, it, expect } from 'vitest';
import { groupMessages } from './groupMessages';
import type { EnrichedMessage } from '../types/transcript';

function makeMessage(overrides: {
  uuid: string;
  isSubagent?: boolean;
  agentId?: string;
  subagentName?: string | null;
}): EnrichedMessage {
  const isSubagent = overrides.isSubagent ?? false;
  return {
    raw: {
      type: 'assistant',
      sessionId: 'session-1',
      timestamp: '2026-02-01T00:00:00Z',
      uuid: overrides.uuid,
      parentUuid: null,
      agentId: overrides.agentId ?? (isSubagent ? 'sub-agent-1' : 'session-1'),
      message: { role: 'assistant', content: 'text' },
    },
    text: 'text',
    isSubagent,
    subagentName: overrides.subagentName !== undefined ? overrides.subagentName : (isSubagent ? 'Sub Agent' : null),
    toolUses: [],
  };
}

describe('groupMessages', () => {
  it('should return empty array for empty input', () => {
    expect(groupMessages([])).toEqual([]);
  });

  it('should create individual main groups for non-subagent messages', () => {
    const messages = [
      makeMessage({ uuid: 'msg-1' }),
      makeMessage({ uuid: 'msg-2' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('main');
    expect(groups[0].messages).toHaveLength(1);
    expect(groups[1].type).toBe('main');
    expect(groups[1].messages).toHaveLength(1);
  });

  it('should group consecutive subagent messages with same agentId', () => {
    const messages = [
      makeMessage({ uuid: 'sub-1', isSubagent: true, agentId: 'agent-a' }),
      makeMessage({ uuid: 'sub-2', isSubagent: true, agentId: 'agent-a' }),
      makeMessage({ uuid: 'sub-3', isSubagent: true, agentId: 'agent-a' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('subagent');
    if (groups[0].type === 'subagent') {
      expect(groups[0].messages).toHaveLength(3);
      expect(groups[0].agentId).toBe('agent-a');
      expect(groups[0].groupKey).toBe('agent-a-sub-1');
    }
  });

  it('should produce main, subagent, main groups for interleaved messages', () => {
    const messages = [
      makeMessage({ uuid: 'msg-1' }),
      makeMessage({ uuid: 'sub-1', isSubagent: true, agentId: 'agent-a' }),
      makeMessage({ uuid: 'sub-2', isSubagent: true, agentId: 'agent-a' }),
      makeMessage({ uuid: 'msg-2' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(3);
    expect(groups[0].type).toBe('main');
    expect(groups[1].type).toBe('subagent');
    expect(groups[1].messages).toHaveLength(2);
    expect(groups[2].type).toBe('main');
  });

  it('should create separate groups for different subagents', () => {
    const messages = [
      makeMessage({ uuid: 'sub-a1', isSubagent: true, agentId: 'agent-a', subagentName: 'Agent A' }),
      makeMessage({ uuid: 'sub-b1', isSubagent: true, agentId: 'agent-b', subagentName: 'Agent B' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('subagent');
    expect(groups[1].type).toBe('subagent');
    if (groups[0].type === 'subagent' && groups[1].type === 'subagent') {
      expect(groups[0].agentId).toBe('agent-a');
      expect(groups[0].subagentName).toBe('Agent A');
      expect(groups[1].agentId).toBe('agent-b');
      expect(groups[1].subagentName).toBe('Agent B');
    }
  });

  it('should create separate groups when same subagent appears non-consecutively', () => {
    const messages = [
      makeMessage({ uuid: 'sub-a1', isSubagent: true, agentId: 'agent-a' }),
      makeMessage({ uuid: 'msg-1' }),
      makeMessage({ uuid: 'sub-a2', isSubagent: true, agentId: 'agent-a' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(3);
    if (groups[0].type === 'subagent' && groups[2].type === 'subagent') {
      expect(groups[0].groupKey).toBe('agent-a-sub-a1');
      expect(groups[2].groupKey).toBe('agent-a-sub-a2');
      expect(groups[0].groupKey).not.toBe(groups[2].groupKey);
    }
  });

  it('should use subagentName from first message in the group', () => {
    const messages = [
      makeMessage({ uuid: 'sub-1', isSubagent: true, agentId: 'agent-a', subagentName: 'Data Analyzer' }),
      makeMessage({ uuid: 'sub-2', isSubagent: true, agentId: 'agent-a', subagentName: 'Data Analyzer' }),
    ];

    const groups = groupMessages(messages);

    if (groups[0].type === 'subagent') {
      expect(groups[0].subagentName).toBe('Data Analyzer');
    }
  });

  it('should handle single subagent message as a group of 1', () => {
    const messages = [
      makeMessage({ uuid: 'sub-1', isSubagent: true, agentId: 'agent-a' }),
    ];

    const groups = groupMessages(messages);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('subagent');
    expect(groups[0].messages).toHaveLength(1);
  });

  it('should fall back to agentId when subagentName is null', () => {
    const messages = [
      makeMessage({ uuid: 'sub-1', isSubagent: true, agentId: 'agent-x', subagentName: null }),
    ];

    const groups = groupMessages(messages);

    if (groups[0].type === 'subagent') {
      expect(groups[0].subagentName).toBe('agent-x');
    }
  });
});
