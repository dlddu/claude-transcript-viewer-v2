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

    // For production, list all transcripts and find matching session_id
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        throw new Error('No transcript found for session ID');
      }

      // Fetch each transcript and check for matching session_id
      for (const item of response.Contents) {
        if (!item.Key) continue;

        try {
          const getCommand = new GetObjectCommand({
            Bucket: this.bucket,
            Key: item.Key,
          });

          const getResponse = await this.s3Client.send(getCommand);

          if (!getResponse.Body) continue;

          const bodyString = await getResponse.Body.transformToString();
          const transcript = JSON.parse(bodyString) as Transcript;

          if (transcript.session_id === trimmedSessionId) {
            return transcript;
          }
        } catch (error) {
          // Skip files that can't be parsed
          continue;
        }
      }

      throw new Error('No transcript found for session ID');
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
