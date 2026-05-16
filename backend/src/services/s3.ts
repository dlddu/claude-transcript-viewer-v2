import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

export interface S3ServiceConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  prefix?: string;
  assumeRoleArn?: string;
  assumeRoleSessionName?: string;
  assumeRoleExternalId?: string;
  assumeRoleDurationSeconds?: number;
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return '';
  const trimmed = prefix.replace(/^\/+/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
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

export class S3Service {
  private s3Client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3ServiceConfig) {
    this.bucket = config.bucket;
    this.prefix = normalizePrefix(config.prefix);

    const clientConfig: S3ClientConfig = {
      region: config.region,
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      // Default dummy credentials for S3-compatible emulators (MinIO, LocalStack).
      // MinIO's default root user is minioadmin/minioadmin and requires the
      // secret to be at least 8 characters; LocalStack accepts any value.
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
      };
      clientConfig.forcePathStyle = true;
    } else if (config.assumeRoleArn) {
      clientConfig.credentials = fromTemporaryCredentials({
        params: {
          RoleArn: config.assumeRoleArn,
          RoleSessionName: config.assumeRoleSessionName || 'claude-transcript-viewer',
          ExternalId: config.assumeRoleExternalId,
          DurationSeconds: config.assumeRoleDurationSeconds,
        },
        clientConfig: { region: config.region },
      });
    }

    this.s3Client = new S3Client(clientConfig);
  }

  async getTranscript(transcriptId: string): Promise<Transcript> {
    try {
      const baseKey = transcriptId.endsWith('.json') ? transcriptId : `${transcriptId}.json`;
      const key = `${this.prefix}${baseKey}`;

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
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix || undefined,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      return response.Contents
        .map(item => item.Key)
        .filter((key): key is string => !!key)
        .map(key => this.prefix && key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key)
        .map(key => key.replace(/\.json$/, ''));
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

    try {
      // List objects with session ID prefix (applying configured S3 prefix)
      const sessionKeyPrefix = `${this.prefix}${trimmedSessionId}`;
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: sessionKeyPrefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        throw new Error('No transcript found for session ID');
      }

      // Find main transcript file (sessionId.jsonl or sessionId.json)
      const mainTranscriptKey = listResponse.Contents.find(
        item => item.Key === `${sessionKeyPrefix}.jsonl` || item.Key === `${sessionKeyPrefix}.json`
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
        item => item.Key?.startsWith(`${sessionKeyPrefix}/`) && item.Key?.includes('agent-')
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
