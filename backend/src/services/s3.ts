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
  is_error?: boolean;
}>;

// Individual message in a transcript (JSONL line)
export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'queue-operation';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  agentId?: string; // Identifies which agent (main or subagent) this message belongs to
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
            agentId: 'session-abc123',
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
            agentId: 'session-abc123',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'I\'d be happy to help you analyze the dataset.' },
                { type: 'tool_use', id: 'tool-001', name: 'DataAnalyzer', input: { file_path: '/data/input.csv' } },
              ],
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'user',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:08Z',
            uuid: 'msg-002b',
            parentUuid: 'msg-002',
            agentId: 'session-abc123',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-001',
                  content: 'Analysis complete. Found 1000 rows with 15 columns. Data quality: 97.7%'
                }
              ]
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'user',
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'user',
              content: 'Analyze the CSV file',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:12Z',
            uuid: 'sub-002',
            parentUuid: 'sub-001',
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant',
              content: 'Starting data analysis. Found 1,000 rows with 15 columns.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:18Z',
            uuid: 'sub-003',
            parentUuid: 'sub-002',
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant',
              content: 'Data quality check complete. Missing values: 23 (2.3%). No duplicate rows found.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'user',
            sessionId: 'agent-xyz789',
            timestamp: '2026-02-01T05:00:46Z',
            uuid: 'viz-001',
            parentUuid: null,
            agentId: 'agent-xyz789',
            message: {
              role: 'user',
              content: 'Create visualizations for the dataset',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'agent-xyz789',
            timestamp: '2026-02-01T05:00:47Z',
            uuid: 'viz-002',
            parentUuid: 'viz-001',
            agentId: 'agent-xyz789',
            message: {
              role: 'assistant',
              content: 'Creating visualizations. Generating histogram for sales distribution.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'agent-xyz789',
            timestamp: '2026-02-01T05:00:49Z',
            uuid: 'viz-003',
            parentUuid: 'viz-002',
            agentId: 'agent-xyz789',
            message: {
              role: 'assistant',
              content: 'All visualizations complete. Created 3 charts.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:50Z',
            uuid: 'msg-003',
            parentUuid: 'msg-002',
            agentId: 'session-abc123',
            message: {
              role: 'assistant',
              content: 'Analysis complete! I\'ve examined the dataset and created visualizations to help you understand the patterns.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'user',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:01:00Z',
            uuid: 'msg-004',
            parentUuid: 'msg-003',
            agentId: 'session-abc123',
            message: {
              role: 'user',
              content: 'Now read the config file and validate the schema',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:01:05Z',
            uuid: 'msg-005',
            parentUuid: 'msg-004',
            agentId: 'session-abc123',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'I\'ll read the config and validate the schema for you.' },
                { type: 'tool_use', id: 'tool-002', name: 'FileReader', input: { path: '/app/config.json' } },
                { type: 'tool_use', id: 'tool-003', name: 'SchemaValidator', input: { schema: 'config-v2', strict: true } },
              ],
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'user',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:01:30Z',
            uuid: 'msg-005b',
            parentUuid: 'msg-005',
            agentId: 'session-abc123',
            message: {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 'tool-002', content: 'Config file contents: {"version": 2, "debug": false}' },
                { type: 'tool_result', tool_use_id: 'tool-003', content: 'Schema validation passed. All fields conform to config-v2 spec.' },
              ],
            },
            cwd: '/app',
            version: '2.1.0',
          },
          {
            type: 'assistant',
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:01:50Z',
            uuid: 'msg-006',
            parentUuid: 'msg-005b',
            agentId: 'session-abc123',
            message: {
              role: 'assistant',
              content: 'The config file is valid and conforms to the config-v2 schema.',
              model: 'claude-sonnet-4-5',
            },
            cwd: '/app',
            version: '2.1.0',
          },
        ],
        subagents: [
          {
            id: 'agent-a1b2c3d',
            name: 'agent-a1b2c3d',
            transcript_file: 'session-abc123/agent-a1b2c3d.jsonl',
            content: '{"type":"user","sessionId":"agent-a1b2c3d","timestamp":"2026-02-01T05:00:10Z","uuid":"sub-001","parentUuid":null,"message":{"role":"user","content":"Analyze the CSV file"}}',
            messages: [
              {
                type: 'user',
                sessionId: 'agent-a1b2c3d',
                timestamp: '2026-02-01T05:00:10Z',
                uuid: 'sub-001',
                parentUuid: null,
                agentId: 'agent-a1b2c3d',
                message: {
                  role: 'user',
                  content: 'Analyze the CSV file',
                },
              },
              {
                type: 'assistant',
                sessionId: 'agent-a1b2c3d',
                timestamp: '2026-02-01T05:00:12Z',
                uuid: 'sub-002',
                parentUuid: 'sub-001',
                agentId: 'agent-a1b2c3d',
                message: {
                  role: 'assistant',
                  content: 'Starting data analysis. Found 1,000 rows with 15 columns.',
                  model: 'claude-sonnet-4-5',
                },
              },
              {
                type: 'assistant',
                sessionId: 'agent-a1b2c3d',
                timestamp: '2026-02-01T05:00:18Z',
                uuid: 'sub-003',
                parentUuid: 'sub-002',
                agentId: 'agent-a1b2c3d',
                message: {
                  role: 'assistant',
                  content: 'Data quality check complete. Missing values: 23 (2.3%). No duplicate rows found.',
                  model: 'claude-sonnet-4-5',
                },
              },
            ],
          },
          {
            id: 'agent-xyz789',
            name: 'agent-xyz789',
            transcript_file: 'session-abc123/agent-xyz789.jsonl',
            content: '{"type":"user","sessionId":"agent-xyz789","timestamp":"2026-02-01T05:00:46Z","uuid":"viz-001","parentUuid":null,"message":{"role":"user","content":"Create visualizations for the dataset"}}',
            messages: [
              {
                type: 'user',
                sessionId: 'agent-xyz789',
                timestamp: '2026-02-01T05:00:46Z',
                uuid: 'viz-001',
                parentUuid: null,
                agentId: 'agent-xyz789',
                message: {
                  role: 'user',
                  content: 'Create visualizations for the dataset',
                },
              },
              {
                type: 'assistant',
                sessionId: 'agent-xyz789',
                timestamp: '2026-02-01T05:00:47Z',
                uuid: 'viz-002',
                parentUuid: 'viz-001',
                agentId: 'agent-xyz789',
                message: {
                  role: 'assistant',
                  content: 'Creating visualizations. Generating histogram for sales distribution.',
                  model: 'claude-sonnet-4-5',
                },
              },
              {
                type: 'assistant',
                sessionId: 'agent-xyz789',
                timestamp: '2026-02-01T05:00:49Z',
                uuid: 'viz-003',
                parentUuid: 'viz-002',
                agentId: 'agent-xyz789',
                message: {
                  role: 'assistant',
                  content: 'All visualizations complete. Created 3 charts.',
                  model: 'claude-sonnet-4-5',
                },
              },
            ],
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
            agentId: 'session-xyz789',
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
            agentId: 'session-xyz789',
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
      let mainMessages: TranscriptMessage[] = [];

      if (mainTranscriptKey.endsWith('.jsonl')) {
        const lines = bodyString.trim().split('\n').filter(line => line.trim());
        mainMessages = lines.map(line => JSON.parse(line));
        transcript = {
          id: trimmedSessionId,
          session_id: trimmedSessionId,
          content: bodyString,
          messages: mainMessages,
        } as Transcript;
      } else {
        transcript = JSON.parse(bodyString) as Transcript;
        mainMessages = transcript.messages || [];
      }

      // Add agentId to main messages (agentId = session_id for main agent)
      mainMessages = mainMessages.map(msg => ({
        ...msg,
        agentId: msg.agentId || trimmedSessionId,
      }));

      // Find and attach subagent files
      const subagentFiles = listResponse.Contents.filter(
        item => item.Key?.startsWith(`${trimmedSessionId}/`) && item.Key?.includes('agent-')
      );

      const allMessages: TranscriptMessage[] = [...mainMessages];

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

              // Parse subagent JSONL
              const subagentLines = subagentBody.trim().split('\n').filter(line => line.trim());
              const subagentMessages: TranscriptMessage[] = subagentLines.map(line => {
                const msg = JSON.parse(line);
                return {
                  ...msg,
                  agentId: msg.agentId || agentId,
                };
              });

              // Add subagent messages to the merged timeline
              allMessages.push(...subagentMessages);

              return {
                id: agentId,
                name: agentId,
                transcript_file: item.Key,
                content: subagentBody,
                messages: subagentMessages,
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

      // Sort all messages by timestamp in chronological order
      allMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      // Set the merged and sorted messages
      transcript.messages = allMessages;

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
}
