import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleTranscript,
  loadTranscript,
  parseJsonlMessages,
  type SubagentFile,
} from './loadTranscript';
import type { TranscriptFileRef, TranscriptFilesResponse } from '../types/transcript';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../e2e/fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

const SESSION_ID = 'session-abc123';

function subagentRef(agentId: string): TranscriptFileRef {
  return {
    id: agentId,
    name: `${agentId}.jsonl`,
    key: `year=2026/month=05/day=24/hour=00/session_id=${SESSION_ID}/${agentId}.jsonl`,
    url: `https://s3.example.com/test-transcripts/${agentId}.jsonl?X-Amz-Signature=fake`,
  };
}

function abcSubagentFiles(): SubagentFile[] {
  return [
    { ref: subagentRef('agent-a1b2c3d'), text: readFixture('session-abc123/agent-a1b2c3d.jsonl') },
    { ref: subagentRef('agent-xyz789'), text: readFixture('session-abc123/agent-xyz789.jsonl') },
  ];
}

describe('parseJsonlMessages', () => {
  it('parses one message per non-empty line', () => {
    const text = '{"uuid":"a"}\n\n  \n{"uuid":"b"}\n';
    const messages = parseJsonlMessages(text);
    expect(messages.map((m) => m.uuid)).toEqual(['a', 'b']);
  });

  it('throws on malformed JSON lines', () => {
    expect(() => parseJsonlMessages('{"uuid":"a"}\nnot-json')).toThrow();
  });

  it('parses every fixture line preserving message structure', () => {
    const messages = parseJsonlMessages(readFixture('session-abc123.jsonl'));
    expect(messages.length).toBeGreaterThan(0);
    for (const msg of messages) {
      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('sessionId');
      expect(msg).toHaveProperty('uuid');
      expect(msg).toHaveProperty('timestamp');
    }
  });
});

describe('assembleTranscript', () => {
  it('merges main and subagent messages into one timeline', () => {
    const transcript = assembleTranscript(
      SESSION_ID,
      readFixture('session-abc123.jsonl'),
      abcSubagentFiles()
    );

    const messages = transcript.messages ?? [];
    const main = messages.filter((m) => m.sessionId === SESSION_ID);
    const sub = messages.filter((m) => m.sessionId !== SESSION_ID);
    expect(main.length).toBeGreaterThan(0);
    expect(sub.length).toBeGreaterThan(0);
    expect(messages.length).toBe(main.length + sub.length);
  });

  it('sorts the merged timeline by timestamp', () => {
    const transcript = assembleTranscript(
      SESSION_ID,
      readFixture('session-abc123.jsonl'),
      abcSubagentFiles()
    );

    const times = (transcript.messages ?? []).map((m) => Date.parse(m.timestamp));
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('defaults agentId to the session id for main messages and the agent id for subagents', () => {
    const transcript = assembleTranscript(
      SESSION_ID,
      readFixture('session-abc123.jsonl'),
      abcSubagentFiles()
    );

    for (const msg of transcript.messages ?? []) {
      expect(msg.agentId).toBeTruthy();
      if (msg.sessionId === SESSION_ID) {
        expect(msg.agentId).toBe(SESSION_ID);
      } else {
        expect(msg.agentId).toBe(msg.sessionId);
        expect(msg.agentId).not.toBe(SESSION_ID);
      }
    }
  });

  it('attaches subagents with their parsed messages and raw content', () => {
    const transcript = assembleTranscript(
      SESSION_ID,
      readFixture('session-abc123.jsonl'),
      abcSubagentFiles()
    );

    expect(transcript.subagents).toHaveLength(2);
    for (const subagent of transcript.subagents ?? []) {
      expect(subagent.name).toBe(subagent.id);
      expect(subagent.transcript_file).toContain(subagent.id);
      expect(subagent.content).toBeTruthy();
      expect(subagent.messages?.length).toBeGreaterThan(0);
    }
  });

  it('omits the subagents field for sessions without subagents', () => {
    const transcript = assembleTranscript('session-xyz789', readFixture('session-xyz789.jsonl'), []);
    expect(transcript.subagents).toBeUndefined();
    expect(transcript.messages?.length).toBeGreaterThan(0);
  });

  it('skips subagent files that fail to parse instead of failing the transcript', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const transcript = assembleTranscript(SESSION_ID, readFixture('session-abc123.jsonl'), [
        { ref: subagentRef('agent-broken'), text: 'not json at all' },
        ...abcSubagentFiles(),
      ]);
      expect(transcript.subagents).toHaveLength(2);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to raw content when no messages parse', () => {
    const transcript = assembleTranscript('session-empty', '\n\n', []);
    expect(transcript.messages).toHaveLength(0);
    expect(transcript.content).toBe('\n\n');
  });

  it('does not retain raw main content when messages parsed', () => {
    const transcript = assembleTranscript(
      SESSION_ID,
      readFixture('session-abc123.jsonl'),
      []
    );
    expect(transcript.content).toBeUndefined();
  });
});

describe('loadTranscript', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function manifest(): TranscriptFilesResponse {
    return {
      session_id: SESSION_ID,
      expires_in: 300,
      main: {
        id: SESSION_ID,
        name: `${SESSION_ID}.jsonl`,
        key: `year=2026/month=05/day=24/hour=00/session_id=${SESSION_ID}/${SESSION_ID}.jsonl`,
        url: 'https://s3.example.com/test-transcripts/main.jsonl?X-Amz-Signature=fake',
      },
      subagents: [subagentRef('agent-a1b2c3d'), subagentRef('agent-xyz789')],
    };
  }

  function mockRoutes(routes: Record<string, { status?: number; body: string }>) {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = Object.entries(routes).find(([pattern]) => url.includes(pattern));
      if (!match) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      const { status = 200, body } = match[1];
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        json: async () => JSON.parse(body),
        text: async () => body,
      } as Response;
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    return mockFetch;
  }

  it('fetches the manifest then downloads the files from their presigned URLs', async () => {
    const mockFetch = mockRoutes({
      '/api/transcript/session/session-abc123': { body: JSON.stringify(manifest()) },
      'main.jsonl': { body: readFixture('session-abc123.jsonl') },
      'agent-a1b2c3d.jsonl': { body: readFixture('session-abc123/agent-a1b2c3d.jsonl') },
      'agent-xyz789.jsonl': { body: readFixture('session-abc123/agent-xyz789.jsonl') },
    });

    const transcript = await loadTranscript(SESSION_ID);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/transcript/session/session-abc123')
    );
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('X-Amz-Signature'));
    expect(transcript.session_id).toBe(SESSION_ID);
    expect(transcript.subagents).toHaveLength(2);
    expect(transcript.messages?.length).toBeGreaterThan(8);
  });

  it('surfaces the backend error message when the manifest request fails', async () => {
    mockRoutes({
      '/api/transcript/session/': {
        status: 404,
        body: JSON.stringify({ error: 'Session transcript not found' }),
      },
    });

    await expect(loadTranscript('session-missing')).rejects.toThrow(
      'Session transcript not found'
    );
  });

  it('fails when the main transcript download fails', async () => {
    mockRoutes({
      '/api/transcript/session/': { body: JSON.stringify(manifest()) },
      'main.jsonl': { status: 403, body: 'expired' },
      'agent-a1b2c3d.jsonl': { body: readFixture('session-abc123/agent-a1b2c3d.jsonl') },
      'agent-xyz789.jsonl': { body: readFixture('session-abc123/agent-xyz789.jsonl') },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(loadTranscript(SESSION_ID)).rejects.toThrow(/Failed to download transcript/);
  });

  it('skips subagent downloads that fail instead of failing the transcript', async () => {
    mockRoutes({
      '/api/transcript/session/': { body: JSON.stringify(manifest()) },
      'main.jsonl': { body: readFixture('session-abc123.jsonl') },
      'agent-a1b2c3d.jsonl': { status: 403, body: 'expired' },
      'agent-xyz789.jsonl': { body: readFixture('session-abc123/agent-xyz789.jsonl') },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transcript = await loadTranscript(SESSION_ID);

    expect(transcript.subagents).toHaveLength(1);
    expect(transcript.subagents?.[0].id).toBe('agent-xyz789');
    expect(warn).toHaveBeenCalled();
  });
});
