import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand {
    input: { Bucket: string; Key: string };
    constructor(input: { Bucket: string; Key: string }) {
      this.input = input;
    }
  }
  class ListObjectsV2Command {
    input: { Bucket: string; Prefix?: string };
    constructor(input: { Bucket: string; Prefix?: string }) {
      this.input = input;
    }
  }
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
    GetObjectCommand,
    ListObjectsV2Command,
  };
});

import { S3Service } from './s3';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../e2e/fixtures');
const SESSION_ABC_MAIN = readFileSync(join(fixturesDir, 'session-abc123.jsonl'), 'utf-8');
const SESSION_ABC_AGENT_A = readFileSync(join(fixturesDir, 'session-abc123/agent-a1b2c3d.jsonl'), 'utf-8');
const SESSION_ABC_AGENT_B = readFileSync(join(fixturesDir, 'session-abc123/agent-xyz789.jsonl'), 'utf-8');
const SESSION_XYZ_MAIN = readFileSync(join(fixturesDir, 'session-xyz789.jsonl'), 'utf-8');

interface S3Command {
  constructor: { name: string };
  input: { Bucket?: string; Key?: string; Prefix?: string };
}

function configureMock(objects: Record<string, string>) {
  sendMock.mockImplementation(async (command: S3Command) => {
    const name = command.constructor.name;
    if (name === 'GetObjectCommand') {
      const key = command.input.Key!;
      const body = objects[key];
      if (body === undefined) {
        const err: Error & { $metadata?: { httpStatusCode: number } } = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body: { transformToString: async () => body } };
    }
    if (name === 'ListObjectsV2Command') {
      const prefix = command.input.Prefix || '';
      const matching = Object.keys(objects).filter((k) => k.startsWith(prefix));
      return {
        Contents: matching.length > 0 ? matching.map((Key) => ({ Key })) : undefined,
      };
    }
    throw new Error(`Unexpected S3 command: ${name}`);
  });
}

const SESSION_ABC_OBJECTS: Record<string, string> = {
  'session-abc123.jsonl': SESSION_ABC_MAIN,
  'session-abc123/agent-a1b2c3d.jsonl': SESSION_ABC_AGENT_A,
  'session-abc123/agent-xyz789.jsonl': SESSION_ABC_AGENT_B,
};

const SESSION_XYZ_OBJECTS: Record<string, string> = {
  'session-xyz789.jsonl': SESSION_XYZ_MAIN,
};

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    sendMock.mockReset();
    s3Service = new S3Service({
      bucket: 'test-transcripts',
      region: 'us-east-1',
    });
  });

  describe('getTranscript', () => {
    it('should fetch transcript from S3', async () => {
      const transcriptId = 'test-transcript-1';
      configureMock({
        [`${transcriptId}.json`]: JSON.stringify({
          id: transcriptId,
          content: 'Mock transcript content',
          timestamp: '2026-02-01T00:00:00Z',
        }),
      });

      const result = await s3Service.getTranscript(transcriptId);

      expect(result).toBeDefined();
      expect(result.id).toBe(transcriptId);
      expect(result.content).toBeDefined();
    });

    it('should throw error when transcript not found', async () => {
      configureMock({});
      await expect(s3Service.getTranscript('non-existent')).rejects.toThrow('Transcript not found');
    });

    it('should parse JSON transcript correctly', async () => {
      const transcriptId = 'test-json-transcript';
      configureMock({
        [`${transcriptId}.json`]: JSON.stringify({
          id: transcriptId,
          content: 'Test JSON transcript',
          timestamp: '2026-02-01T00:00:00Z',
        }),
      });

      const result = await s3Service.getTranscript(transcriptId);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('listTranscripts', () => {
    it('should list all transcripts in bucket', async () => {
      configureMock({
        'transcript-a.json': '{}',
        'transcript-b.json': '{}',
      });

      const results = await s3Service.listTranscripts();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when bucket is empty', async () => {
      configureMock({});
      const results = await s3Service.listTranscripts();
      expect(results).toEqual([]);
    });
  });

  describe('getTranscriptBySessionId - Timeline Integration', () => {
    it('should merge main and subagent transcripts into unified timeline', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const sessionId = 'session-abc123';

      const result = await s3Service.getTranscriptBySessionId(sessionId);

      expect(result).toBeDefined();
      expect(result.session_id).toBe(sessionId);
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages!.length).toBeGreaterThan(2);

      const mainMessages = result.messages!.filter((msg) => msg.sessionId === sessionId);
      expect(mainMessages.length).toBeGreaterThan(0);

      const subagentMessages = result.messages!.filter((msg) => msg.sessionId !== sessionId);
      expect(subagentMessages.length).toBeGreaterThan(0);
    });

    it('should sort messages by timestamp in chronological order', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(1);

      for (let i = 1; i < result.messages!.length; i++) {
        const prevTimestamp = new Date(result.messages![i - 1].timestamp);
        const currTimestamp = new Date(result.messages![i].timestamp);
        expect(currTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
      }
    });

    it('should add agentId field to all messages', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      expect(result.messages).toBeDefined();
      result.messages!.forEach((msg) => {
        expect(msg).toHaveProperty('agentId');
        expect(typeof msg.agentId).toBe('string');
        expect(msg.agentId).not.toBe('');
      });
    });

    it('should set agentId to sessionId for main agent messages', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const sessionId = 'session-abc123';
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      const mainMessages = result.messages!.filter((msg) => msg.sessionId === sessionId);
      mainMessages.forEach((msg) => {
        expect(msg.agentId).toBe(sessionId);
      });
    });

    it('should set agentId to subagent sessionId for subagent messages', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const sessionId = 'session-abc123';
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      const subagentMessages = result.messages!.filter((msg) => msg.sessionId !== sessionId);
      subagentMessages.forEach((msg) => {
        expect(msg.agentId).toBe(msg.sessionId);
        expect(msg.agentId).not.toBe(sessionId);
      });
    });

    it('should handle multiple JSONL files from subdirectory', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      expect(result.subagents).toBeDefined();
      expect(result.subagents!.length).toBeGreaterThan(0);
      result.subagents!.forEach((subagent) => {
        expect(subagent.messages).toBeDefined();
        expect(Array.isArray(subagent.messages)).toBe(true);
      });
    });

    it('should parse JSONL format correctly', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      expect(result.messages).toBeDefined();
      result.messages!.forEach((msg) => {
        expect(msg).toHaveProperty('type');
        expect(msg).toHaveProperty('sessionId');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('uuid');
        expect(msg).toHaveProperty('parentUuid');
      });
    });

    it('should handle session with no subagents gracefully', async () => {
      configureMock(SESSION_XYZ_OBJECTS);
      const sessionId = 'session-xyz789';
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      expect(result).toBeDefined();
      expect(result.session_id).toBe(sessionId);
      expect(result.messages).toBeDefined();

      result.messages!.forEach((msg) => {
        expect(msg.sessionId).toBe(sessionId);
        expect(msg.agentId).toBe(sessionId);
      });

      expect(result.subagents ?? []).toEqual([]);
    });

    it('should maintain message metadata after merging', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      expect(result.messages).toBeDefined();
      result.messages!.forEach((msg) => {
        if (msg.message) {
          expect(msg.message).toHaveProperty('role');
          expect(msg.message).toHaveProperty('content');

          if (msg.message.model) {
            expect(typeof msg.message.model).toBe('string');
          }
        }

        if (msg.cwd) {
          expect(typeof msg.cwd).toBe('string');
        }
        if (msg.version) {
          expect(typeof msg.version).toBe('string');
        }
      });
    });

    it('should preserve content blocks in message content', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      const messagesWithContent = result.messages!.filter(
        (msg) => msg.message && Array.isArray(msg.message.content)
      );

      if (messagesWithContent.length > 0) {
        messagesWithContent.forEach((msg) => {
          const content = msg.message!.content as Array<{ type: string }>;
          content.forEach((block) => {
            expect(block).toHaveProperty('type');
          });
        });
      }
    });
  });

  describe('Tool Use and Tool Result Matching', () => {
    it('should identify tool_use content blocks in messages', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      const messagesWithToolUse = result.messages!.filter((msg) => {
        if (!msg.message || !Array.isArray(msg.message.content)) return false;
        return msg.message.content.some((block) => block.type === 'tool_use');
      });

      expect(messagesWithToolUse.length).toBeGreaterThan(0);

      messagesWithToolUse.forEach((msg) => {
        const content = msg.message!.content as Array<{
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
        const toolUseBlocks = content.filter((block) => block.type === 'tool_use');

        toolUseBlocks.forEach((block) => {
          expect(block).toHaveProperty('id');
          expect(block).toHaveProperty('name');
          expect(block).toHaveProperty('input');
          expect(typeof block.id).toBe('string');
          expect(typeof block.name).toBe('string');
        });
      });
    });

    it('should identify tool_result content blocks in messages', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      const messagesWithToolResult = result.messages!.filter((msg) => {
        if (!msg.message || !Array.isArray(msg.message.content)) return false;
        return msg.message.content.some((block) => block.type === 'tool_result');
      });

      expect(messagesWithToolResult.length).toBeGreaterThan(0);

      messagesWithToolResult.forEach((msg) => {
        const content = msg.message!.content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
        }>;
        const toolResultBlocks = content.filter((block) => block.type === 'tool_result');

        toolResultBlocks.forEach((block) => {
          expect(block).toHaveProperty('tool_use_id');
          expect(block).toHaveProperty('content');
          expect(typeof block.tool_use_id).toBe('string');
        });
      });
    });

    it('should match tool_use with corresponding tool_result by ID', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      const messages = result.messages!;
      const toolUseMap = new Map<
        string,
        { message: typeof messages[0]; block: { type: string; id: string; name: string; input: unknown } }
      >();

      messages.forEach((msg) => {
        if (msg.message && Array.isArray(msg.message.content)) {
          const content = msg.message.content as Array<{
            type: string;
            id?: string;
            name?: string;
            input?: unknown;
          }>;
          content.forEach((block) => {
            if (block.type === 'tool_use' && block.id) {
              toolUseMap.set(block.id, {
                message: msg,
                block: { type: block.type, id: block.id, name: block.name!, input: block.input },
              });
            }
          });
        }
      });

      messages.forEach((msg) => {
        if (msg.message && Array.isArray(msg.message.content)) {
          const content = msg.message.content as Array<{
            type: string;
            tool_use_id?: string;
            content?: string;
          }>;
          content.forEach((block) => {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const matchingToolUse = toolUseMap.get(block.tool_use_id);
              expect(matchingToolUse).toBeDefined();
              expect(matchingToolUse?.block.id).toBe(block.tool_use_id);
            }
          });
        }
      });
    });

    it('should preserve tool_use and tool_result order in timeline', async () => {
      configureMock(SESSION_ABC_OBJECTS);
      const result = await s3Service.getTranscriptBySessionId('session-abc123');

      const messages = result.messages!;
      const toolInteractions: { type: 'use' | 'result'; id: string; timestamp: string }[] = [];

      messages.forEach((msg) => {
        if (msg.message && Array.isArray(msg.message.content)) {
          const content = msg.message.content as Array<{
            type: string;
            id?: string;
            tool_use_id?: string;
          }>;
          content.forEach((block) => {
            if (block.type === 'tool_use' && block.id) {
              toolInteractions.push({ type: 'use', id: block.id, timestamp: msg.timestamp });
            } else if (block.type === 'tool_result' && block.tool_use_id) {
              toolInteractions.push({ type: 'result', id: block.tool_use_id, timestamp: msg.timestamp });
            }
          });
        }
      });

      const toolUseTimestamps = new Map<string, string>();
      toolInteractions.forEach((interaction) => {
        if (interaction.type === 'use') {
          toolUseTimestamps.set(interaction.id, interaction.timestamp);
        } else if (interaction.type === 'result') {
          const useTimestamp = toolUseTimestamps.get(interaction.id);
          if (useTimestamp) {
            const useTime = new Date(useTimestamp).getTime();
            const resultTime = new Date(interaction.timestamp).getTime();
            expect(resultTime).toBeGreaterThanOrEqual(useTime);
          }
        }
      });
    });
  });

  describe('prefix config normalization', () => {
    it('defaults to empty string when prefix is not provided', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1' });
      expect((service as unknown as { prefix: string }).prefix).toBe('');
    });

    it('defaults to empty string when prefix is an empty string', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1', prefix: '' });
      expect((service as unknown as { prefix: string }).prefix).toBe('');
    });

    it('appends a trailing slash when missing', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1', prefix: 'foo/bar' });
      expect((service as unknown as { prefix: string }).prefix).toBe('foo/bar/');
    });

    it('leaves existing trailing slash as-is', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1', prefix: 'foo/bar/' });
      expect((service as unknown as { prefix: string }).prefix).toBe('foo/bar/');
    });

    it('strips leading slashes', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1', prefix: '/foo/bar/' });
      expect((service as unknown as { prefix: string }).prefix).toBe('foo/bar/');
    });

    it('normalizes a slashes-only string to empty', () => {
      const service = new S3Service({ bucket: 'test-bucket', region: 'us-east-1', prefix: '///' });
      expect((service as unknown as { prefix: string }).prefix).toBe('');
    });
  });

  describe('assume role config', () => {
    it('constructs without error when assumeRoleArn is not set', () => {
      expect(() => new S3Service({
        bucket: 'test-bucket',
        region: 'us-east-1',
      })).not.toThrow();
    });

    it('constructs without error when assumeRoleArn is set', () => {
      expect(() => new S3Service({
        bucket: 'test-bucket',
        region: 'us-east-1',
        assumeRoleArn: 'arn:aws:iam::123456789012:role/test-role',
      })).not.toThrow();
    });

    it('constructs without error with full assume role config', () => {
      expect(() => new S3Service({
        bucket: 'test-bucket',
        region: 'us-east-1',
        assumeRoleArn: 'arn:aws:iam::123456789012:role/test-role',
        assumeRoleSessionName: 'custom-session',
        assumeRoleExternalId: 'ext-123',
        assumeRoleDurationSeconds: 1800,
      })).not.toThrow();
    });

    it('endpoint takes precedence over assumeRoleArn (S3-compatible emulator path)', () => {
      expect(() => new S3Service({
        bucket: 'test-bucket',
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
        assumeRoleArn: 'arn:aws:iam::123456789012:role/test-role',
      })).not.toThrow();
    });
  });
});
