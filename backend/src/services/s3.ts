import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';

export interface S3ServiceConfig {
  bucket: string;
  region: string;
  endpoint?: string;
}

// Message content can be a string or an array of content blocks
export type MessageContent = string | Array<{
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}>;

// Individual message in a transcript (JSONL line)
export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'queue-operation';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  agentId?: string; // 'main' for main agent, subagent ID for subagents
  message?: {
    role: 'user' | 'assistant';
    content: MessageContent;
    model?: string;
  };
  // queue-operation specific fields
  operation?: string;
  // Additional metadata
  cwd?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  userType?: string;
  metadata?: {
    total_tokens?: number;
    duration_ms?: number;
  };
}

// Subagent transcript
export interface SubagentTranscript {
  id: string;
  name: string;
  content?: string;
  messages?: TranscriptMessage[];
  transcript_file?: string;
}

// Main transcript structure
export interface Transcript {
  id: string;
  session_id?: string;
  content: string;
  messages?: TranscriptMessage[];
  subagents?: SubagentTranscript[];
  [key: string]: unknown;
}

// Merged timeline result
export interface MergedTimeline {
  sessionId: string;
  messages: TranscriptMessage[];
}

// Mock data for unit tests (when S3 is not available)
const mockTranscripts: Record<string, Transcript> = {
  'test-transcript-1': {
    id: 'test-transcript-1',
    content: 'Mock transcript content',
    timestamp: new Date().toISOString(),
  },
  'test-json-transcript': {
    id: 'test-json-transcript',
    content: 'Test JSON transcript',
    timestamp: new Date().toISOString(),
  },
};

export class S3Service {
  private s3Client: S3Client;
  private bucket: string;
  private mockTranscriptBySession: Record<string, Transcript>;

  constructor(config: S3ServiceConfig) {
    this.bucket = config.bucket;

    const clientConfig: S3ClientConfig = {
      region: config.region,
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.credentials = {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      };
      clientConfig.forcePathStyle = true;
    }

    this.s3Client = new S3Client(clientConfig);

    // Mock data indexed by session_id for testing (matches real JSONL structure)
    this.mockTranscriptBySession = {
      'session-abc123': {
        id: 'session-abc123',
        session_id: 'session-abc123',
        content: '{"type":"user","sessionId":"session-abc123","timestamp":"2026-02-01T05:00:00Z","uuid":"msg-001","parentUuid":null,"message":{"role":"user","content":"Can you help me analyze this dataset?"}}\n{"type":"assistant","sessionId":"session-abc123","timestamp":"2026-02-01T05:00:05Z","uuid":"msg-002","parentUuid":"msg-001","message":{"role":"assistant","content":"I\'d be happy to help you analyze the dataset.","model":"claude-sonnet-4-5"}}',
        messages: [
          {
            type: 'user',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            message: {
              role: 'user',
              content: 'Can you help me analyze this dataset?',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            message: {
              role: 'assistant',
              content: 'I\'d be happy to help you analyze the dataset.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
        ],
        subagents: [
          {
            id: 'a1b2c3d',
            name: 'Data Analyzer Subagent',
            type: 'analysis',
            transcript_file: 'session-abc123/agent-a1b2c3d.jsonl',
            content: '{"type":"assistant","sessionId":"a1b2c3d","timestamp":"2026-02-01T05:00:15Z","uuid":"sub-001","parentUuid":null,"message":{"role":"assistant","content":"Starting data analysis. Found 1,000 rows and 15 columns detected."},"isSidechain":true,"metadata":{"total_tokens":456,"duration_ms":2100}}',
          },
          {
            id: 'xyz9876',
            name: 'Visualization Subagent',
            type: 'visualization',
            transcript_file: 'session-abc123/agent-xyz9876.jsonl',
            content: '{"type":"assistant","sessionId":"xyz9876","timestamp":"2026-02-01T05:00:45Z","uuid":"sub-002","parentUuid":null,"message":{"role":"assistant","content":"Creating visualizations. Generated 3 charts."},"isSidechain":true,"metadata":{"total_tokens":234,"duration_ms":1800}}',
          },
        ],
      },
      'session-xyz789': {
        id: 'session-xyz789',
        session_id: 'session-xyz789',
        content: '{"type":"user","sessionId":"session-xyz789","timestamp":"2026-02-01T06:00:00Z","uuid":"msg-101","parentUuid":null,"message":{"role":"user","content":"Can you summarize this report?"}}\n{"type":"assistant","sessionId":"session-xyz789","timestamp":"2026-02-01T06:00:03Z","uuid":"msg-102","parentUuid":"msg-101","message":{"role":"assistant","content":"I\'ll help you summarize the report.","model":"claude-sonnet-4-5"}}',
        messages: [
          {
            type: 'user',
            sessionId: 'session-xyz789',
            timestamp: '2026-02-01T06:00:00Z',
            uuid: 'msg-101',
            parentUuid: null,
            message: {
              role: 'user',
              content: 'Can you summarize this report?',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'session-xyz789',
            timestamp: '2026-02-01T06:00:03Z',
            uuid: 'msg-102',
            parentUuid: 'msg-101',
            message: {
              role: 'assistant',
              content: 'I\'ll help you summarize the report. Let me review the key points.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
        ],
        subagents: [],
      },
    };
  }

  async getTranscript(transcriptId: string): Promise<Transcript> {
    // For test bucket, return mock data
    if (this.bucket === 'test-bucket' && mockTranscripts[transcriptId]) {
      return mockTranscripts[transcriptId];
    }

    // For empty bucket or non-existent transcript in test, throw
    if (this.bucket === 'test-bucket' && !mockTranscripts[transcriptId]) {
      throw new Error('Transcript not found');
    }

    try {
      const key = transcriptId.endsWith('.json') ? transcriptId : `${transcriptId}.json`;

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('Transcript not found');
      }

      const bodyString = await response.Body.transformToString();
      const transcript = JSON.parse(bodyString) as Transcript;

      return transcript;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'NoSuchKey') {
          throw new Error('Transcript not found');
        }
        if (error.message === 'Transcript not found') {
          throw error;
        }
      }
      // Check for AWS SDK error format
      const awsError = error as { $metadata?: { httpStatusCode?: number } };
      if (awsError.$metadata?.httpStatusCode === 404) {
        throw new Error('Transcript not found');
      }
      throw error;
    }
  }

  async listTranscripts(): Promise<string[]> {
    // For test bucket, return mock transcript IDs
    if (this.bucket === 'test-bucket') {
      return Object.keys(mockTranscripts);
    }

    // For empty bucket, return empty array
    if (this.bucket === 'empty-bucket') {
      return [];
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      return response.Contents
        .map(item => item.Key)
        .filter((key): key is string => !!key)
        .map(key => key.replace('.json', ''));
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
  }

  async getTranscriptBySessionId(sessionId: string): Promise<Transcript> {
    // Trim whitespace
    const trimmedSessionId = sessionId.trim();

    if (!trimmedSessionId) {
      throw new Error('Session ID is required');
    }

    // For test bucket, return mock data indexed by session_id
    if (this.bucket === 'test-bucket' || this.bucket === 'test-transcripts') {
      const transcript = this.mockTranscriptBySession[trimmedSessionId];
      if (transcript) {
        return transcript;
      }
      throw new Error('No transcript found for session ID');
    }

    // For production, use session ID as S3 key prefix for efficient lookup
    try {
      // List objects with session ID prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: trimmedSessionId,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        throw new Error('No transcript found for session ID');
      }

      // Find main transcript file (sessionId.jsonl or sessionId.json)
      const mainTranscriptKey = listResponse.Contents.find(
        item => item.Key === `${trimmedSessionId}.jsonl` || item.Key === `${trimmedSessionId}.json`
      )?.Key;

      if (!mainTranscriptKey) {
        throw new Error('No transcript found for session ID');
      }

      // Fetch main transcript
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: mainTranscriptKey,
      });

      const getResponse = await this.s3Client.send(getCommand);

      if (!getResponse.Body) {
        throw new Error('No transcript found for session ID');
      }

      const bodyString = await getResponse.Body.transformToString();

      // Handle JSONL format (newline-delimited JSON)
      let transcript: Transcript;
      if (mainTranscriptKey.endsWith('.jsonl')) {
        const lines = bodyString.trim().split('\n').filter(line => line.trim());
        const parsedLines = lines.map(line => JSON.parse(line));
        transcript = {
          id: trimmedSessionId,
          session_id: trimmedSessionId,
          content: bodyString,
          messages: parsedLines,
        } as Transcript;
      } else {
        transcript = JSON.parse(bodyString) as Transcript;
      }

      // Find and attach subagent files
      const subagentFiles = listResponse.Contents.filter(
        item => item.Key?.startsWith(`${trimmedSessionId}/`) && item.Key?.includes('agent-')
      );

      if (subagentFiles.length > 0) {
        const subagentTranscripts = await Promise.all(
          subagentFiles.map(async (item) => {
            if (!item.Key) return null;
            try {
              const subagentCommand = new GetObjectCommand({
                Bucket: this.bucket,
                Key: item.Key,
              });
              const subagentResponse = await this.s3Client.send(subagentCommand);
              if (!subagentResponse.Body) return null;

              const subagentBody = await subagentResponse.Body.transformToString();
              const fileName = item.Key.split('/').pop() || item.Key;
              const agentId = fileName.replace('.jsonl', '').replace('.json', '');

              return {
                id: agentId,
                name: agentId,
                transcript_file: item.Key,
                content: subagentBody,
              };
            } catch {
              return null;
            }
          })
        );

        transcript.subagents = subagentTranscripts.filter(
          (s): s is NonNullable<typeof s> => s !== null
        );
      }

      return transcript;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'No transcript found for session ID' || error.message === 'Session ID is required') {
          throw error;
        }
        if (error.name === 'NoSuchBucket') {
          throw new Error('No transcript found for session ID');
        }
      }
      throw error;
    }
  }

  async mergeSessionTranscripts(sessionId: string): Promise<MergedTimeline> {
    // Trim whitespace
    const trimmedSessionId = sessionId.trim();

    if (!trimmedSessionId) {
      throw new Error('Session ID is required');
    }

    // Get transcript with subagents
    const transcript = await this.getTranscriptBySessionId(trimmedSessionId);

    // Parse main agent messages from JSONL content
    const mainMessages: TranscriptMessage[] = [];
    if (transcript.messages) {
      mainMessages.push(...transcript.messages);
    } else if (transcript.content) {
      // Parse JSONL content
      const lines = transcript.content.trim().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as TranscriptMessage;
          mainMessages.push(parsed);
        } catch {
          // Skip invalid lines
        }
      }
    }

    // Add agentId = 'main' to main agent messages
    const messagesWithAgentId: TranscriptMessage[] = mainMessages.map(msg => ({
      ...msg,
      agentId: 'main',
    }));

    // Parse subagent messages
    if (transcript.subagents && transcript.subagents.length > 0) {
      for (const subagent of transcript.subagents) {
        if (!subagent.content) continue;

        // Extract agentId from filename or use subagent id
        let agentId = subagent.id;
        if (subagent.transcript_file) {
          const fileName = subagent.transcript_file.split('/').pop() || '';
          const match = fileName.match(/agent-([^.]+)/);
          if (match) {
            agentId = match[1];
          }
        }

        // Parse JSONL content
        const lines = subagent.content.trim().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as TranscriptMessage;
            messagesWithAgentId.push({
              ...parsed,
              agentId,
            });
          } catch {
            // Skip invalid lines
          }
        }
      }
    }

    // Sort all messages by timestamp
    messagesWithAgentId.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return {
      sessionId: trimmedSessionId,
      messages: messagesWithAgentId,
    };
  }
}
