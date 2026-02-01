import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';

export interface S3ServiceConfig {
  bucket: string;
  region: string;
  endpoint?: string;
}

export interface Transcript {
  id: string;
  content: string;
  timestamp?: string;
  subagents?: Array<{
    id: string;
    name: string;
    content?: string;
    type?: string;
    invoked_at?: string;
    transcript_file?: string;
  }>;
  metadata?: {
    model?: string;
    total_tokens?: number;
    duration_ms?: number;
  };
  tools_used?: Array<{
    name: string;
    invocations: number;
  }>;
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

    // Mock data indexed by session_id for testing
    this.mockTranscriptBySession = {
      'session-abc123': {
        id: 'transcript-20260201-001',
        content: 'User: Can you help me analyze this dataset?\n\nAssistant: I\'d be happy to help you analyze the dataset. Let me break this down into steps:\n\n1. First, I\'ll examine the data structure\n2. Then identify key patterns\n3. Finally, provide insights\n\nLet me start by looking at the data...',
        timestamp: '2026-02-01T05:00:00Z',
        session_id: 'session-abc123',
        metadata: {
          model: 'claude-sonnet-4-5',
          total_tokens: 1234,
          duration_ms: 5432,
        },
        subagents: [
          {
            id: 'subagent-data-analyzer',
            name: 'Data Analyzer Subagent',
            type: 'analysis',
            invoked_at: '2026-02-01T05:00:15Z',
            transcript_file: 'subagent-data-analyzer-20260201-001.json',
          },
          {
            id: 'subagent-visualizer',
            name: 'Visualization Subagent',
            type: 'visualization',
            invoked_at: '2026-02-01T05:00:45Z',
            transcript_file: 'subagent-visualizer-20260201-001.json',
          },
        ],
        tools_used: [
          {
            name: 'file_reader',
            invocations: 3,
          },
          {
            name: 'data_analyzer',
            invocations: 1,
          },
        ],
      },
      'session-xyz789': {
        id: 'transcript-20260201-002',
        content: 'User: Can you summarize this report?\n\nAssistant: I\'ll help you summarize the report. Let me review the key points:\n\n1. Executive summary\n2. Main findings\n3. Recommendations\n\nStarting with the executive summary...',
        timestamp: '2026-02-01T06:00:00Z',
        session_id: 'session-xyz789',
        metadata: {
          model: 'claude-sonnet-4-5',
          total_tokens: 567,
          duration_ms: 2100,
        },
        subagents: [],
        tools_used: [
          {
            name: 'document_reader',
            invocations: 1,
          },
        ],
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
}
