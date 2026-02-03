import { describe, it, expect } from 'vitest';
import { enrichMessages } from './enrichMessages';
import type { TranscriptMessage, Subagent } from '../types/transcript';

// Helper to create a minimal TranscriptMessage
function makeMessage(overrides: Partial<TranscriptMessage> & { uuid: string }): TranscriptMessage {
  return {
    type: 'assistant',
    sessionId: 'session-1',
    timestamp: '2026-02-01T00:00:00Z',
    parentUuid: null,
    message: { role: 'assistant', content: 'default text' },
    ...overrides,
  };
}

describe('enrichMessages', () => {
  describe('filtering', () => {
    it('should filter out queue-operation messages', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', type: 'assistant' }),
        makeMessage({ uuid: 'msg-2', type: 'queue-operation' }),
        makeMessage({ uuid: 'msg-3', type: 'user', message: { role: 'user', content: 'hello' } }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].raw.uuid).toBe('msg-1');
      expect(result[1].raw.uuid).toBe('msg-3');
    });

    it('should filter out messages without message field', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1' }),
        { type: 'user', sessionId: 'session-1', timestamp: '2026-02-01T00:00:00Z', uuid: 'msg-2', parentUuid: null },
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].raw.uuid).toBe('msg-1');
    });
  });

  describe('text extraction', () => {
    it('should extract text from string content', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', message: { role: 'user', content: 'hello world' } }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].text).toBe('hello world');
    });

    it('should extract text from content block array', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'first part' },
              { type: 'text', text: 'second part' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].text).toBe('first part\nsecond part');
    });

    it('should ignore non-text blocks when extracting text', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'visible text' },
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].text).toBe('visible text');
    });

    it('should return empty string when content array has no text blocks', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].text).toBe('');
    });
  });

  describe('subagent detection', () => {
    it('should mark message as subagent when agentId differs from sessionId', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'agent-sub-1' }),
      ];

      // Act
      const result = enrichMessages(messages, 'session-main');

      // Assert
      expect(result[0].isSubagent).toBe(true);
    });

    it('should not mark message as subagent when agentId matches sessionId', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'session-main' }),
      ];

      // Act
      const result = enrichMessages(messages, 'session-main');

      // Assert
      expect(result[0].isSubagent).toBe(false);
    });

    it('should not mark message as subagent when agentId is undefined', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1' }),
      ];

      // Act
      const result = enrichMessages(messages, 'session-main');

      // Assert
      expect(result[0].isSubagent).toBe(false);
    });

    it('should resolve subagent name from subagents array', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'agent-sub-1' }),
      ];
      const subagents: Subagent[] = [
        { id: 'agent-sub-1', name: 'Data Analyzer' },
      ];

      // Act
      const result = enrichMessages(messages, 'session-main', subagents);

      // Assert
      expect(result[0].subagentName).toBe('Data Analyzer');
    });

    it('should fall back to agentId when subagent not found in subagents array', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'agent-unknown' }),
      ];
      const subagents: Subagent[] = [
        { id: 'agent-other', name: 'Other Agent' },
      ];

      // Act
      const result = enrichMessages(messages, 'session-main', subagents);

      // Assert
      expect(result[0].subagentName).toBe('agent-unknown');
    });

    it('should set subagentName to null for main agent messages', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'session-main' }),
      ];

      // Act
      const result = enrichMessages(messages, 'session-main');

      // Assert
      expect(result[0].subagentName).toBeNull();
    });
  });

  describe('tool use aggregation', () => {
    it('should return empty toolUses for messages without tool_use blocks', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', message: { role: 'user', content: 'hello' } }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].toolUses).toEqual([]);
    });

    it('should extract tool_use blocks with matched tool_result and filter out the tool_result-only message', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Reading file' },
              { type: 'tool_use', id: 'tool-001', name: 'Read', input: { path: '/foo.ts' } },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-001', content: 'file contents here' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert — msg-2 (tool_result only, fully matched) is filtered out
      expect(result).toHaveLength(1);
      expect(result[0].raw.uuid).toBe('msg-1');
      expect(result[0].toolUses).toHaveLength(1);
      expect(result[0].toolUses[0]).toEqual({
        id: 'tool-001',
        name: 'Read',
        input: { path: '/foo.ts' },
        result: {
          content: 'file contents here',
          is_error: undefined,
          sourceMessageUuid: 'msg-2',
        },
      });
    });

    it('should handle tool_result with is_error flag', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-err', name: 'Bash', input: { command: 'exit 1' } },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-err', content: 'command failed', is_error: true },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].toolUses[0].result).toEqual({
        content: 'command failed',
        is_error: true,
        sourceMessageUuid: 'msg-2',
      });
    });

    it('should set result to null when no matching tool_result exists', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-orphan', name: 'Read', input: {} },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].toolUses).toHaveLength(1);
      expect(result[0].toolUses[0].result).toBeNull();
    });

    it('should handle multiple tool_use blocks in a single message', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-a', name: 'Read', input: { path: 'a.ts' } },
              { type: 'tool_use', id: 'tool-b', name: 'Glob', input: { pattern: '*.ts' } },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-a', content: 'content A' },
              { type: 'tool_result', tool_use_id: 'tool-b', content: 'content B' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].toolUses).toHaveLength(2);
      expect(result[0].toolUses[0].name).toBe('Read');
      expect(result[0].toolUses[0].result?.content).toBe('content A');
      expect(result[0].toolUses[1].name).toBe('Glob');
      expect(result[0].toolUses[1].result?.content).toBe('content B');
    });

    it('should track sourceMessageUuid correctly for cross-message references', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'assistant-msg',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-x', name: 'Edit', input: {} },
            ],
          },
        }),
        makeMessage({
          uuid: 'user-response-msg',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-x', content: 'edited' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].toolUses[0].result?.sourceMessageUuid).toBe('user-response-msg');
    });
  });

  describe('tool_result message filtering', () => {
    it('should filter out tool_result-only message when all tool_use_ids are matched', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
              { type: 'tool_use', id: 'tool-2', name: 'Glob', input: {} },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'result 1' },
              { type: 'tool_result', tool_use_id: 'tool-2', content: 'result 2' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].raw.uuid).toBe('msg-1');
    });

    it('should keep tool_result-only message when a tool_use_id has no matching tool_use', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'matched' },
              { type: 'tool_result', tool_use_id: 'tool-orphan', content: 'no matching tool_use' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert — msg-2 is kept because tool-orphan has no matching tool_use
      expect(result).toHaveLength(2);
      expect(result[1].raw.uuid).toBe('msg-2');
    });

    it('should keep tool_result-only message when none of its tool_use_ids match', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-unknown', content: 'orphan result' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].raw.uuid).toBe('msg-1');
    });

    it('should not filter messages with mixed content (text + tool_result)', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({
          uuid: 'msg-1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            ],
          },
        }),
        makeMessage({
          uuid: 'msg-2',
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'some user text' },
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
            ],
          },
        }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert — msg-2 has text content, so it should not be filtered
      expect(result).toHaveLength(2);
      expect(result[1].raw.uuid).toBe('msg-2');
      expect(result[1].text).toBe('some user text');
    });
  });

  describe('raw data preservation', () => {
    it('should preserve the original message in raw field', () => {
      // Arrange
      const original = makeMessage({
        uuid: 'msg-1',
        cwd: '/app',
        version: '2.1.0',
        gitBranch: 'main',
      });
      const messages: TranscriptMessage[] = [original];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].raw).toBe(original);
      expect(result[0].raw.cwd).toBe('/app');
      expect(result[0].raw.version).toBe('2.1.0');
      expect(result[0].raw.gitBranch).toBe('main');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty messages input', () => {
      // Act
      const result = enrichMessages([]);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle undefined sessionId and subagents', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', agentId: 'any-agent' }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].isSubagent).toBe(true);
      expect(result[0].subagentName).toBe('any-agent');
    });

    it('should handle string content in messages (no tool_use possible)', () => {
      // Arrange
      const messages: TranscriptMessage[] = [
        makeMessage({ uuid: 'msg-1', message: { role: 'user', content: 'plain string' } }),
      ];

      // Act
      const result = enrichMessages(messages);

      // Assert
      expect(result[0].toolUses).toEqual([]);
      expect(result[0].text).toBe('plain string');
    });
  });
});
