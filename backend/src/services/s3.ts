import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: S3ServiceConfig) {
    this.bucket = config.bucket;

    const clientConfig: any = {
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
  }

  async getTranscript(transcriptId: string): Promise<Transcript> {
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
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw new Error('Transcript not found');
      }
      throw error;
    }
  }

  async listTranscripts(): Promise<string[]> {
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
    } catch (error: any) {
      if (error.name === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
  }
}
