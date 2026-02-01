/**
 * S3 Service for retrieving transcript data
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import type { TranscriptData } from '../types/index.js';

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor(config: {
    region: string;
    endpoint?: string;
    bucket: string;
    forcePathStyle?: boolean;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  /**
   * Convert a readable stream to string
   */
  async streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
  }

  /**
   * Get and parse transcript from S3
   */
  async getTranscript(transcriptId: string): Promise<TranscriptData> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: `transcripts/${transcriptId}.jsonl`,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error('No data received from S3');
      }

      const body = response.Body as Readable;
      const content = await this.streamToString(body);

      // Parse JSONL
      const lines = content.split('\n').filter(line => line.trim());
      const events = lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSONL format at line ${index + 1}`);
        }
      });

      return { events };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        throw new Error('Transcript not found');
      }
      throw error;
    }
  }

  /**
   * List all available transcripts
   */
  async listTranscripts(): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: 'transcripts/',
    });

    const response = await this.client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      return [];
    }

    return response.Contents
      .map(item => item.Key)
      .filter((key): key is string => !!key)
      .map(key => key.replace('transcripts/', '').replace('.jsonl', ''))
      .filter(id => id.length > 0);
  }

  /**
   * Check S3 connection health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
const s3Service = new S3Service({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || process.env.LOCALSTACK_URL,
  bucket: process.env.S3_BUCKET || 'claude-transcripts',
  forcePathStyle: true,
});

export default s3Service;
