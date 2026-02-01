import { test as base, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

/**
 * Test fixtures for Claude Transcript Viewer E2E tests
 * Provides isolated test environment with LocalStack S3 and sample data
 */

export interface TranscriptFixtures {
  /** S3 client configured for LocalStack */
  s3Client: S3Client;
  /** Bucket name for test transcripts */
  bucketName: string;
  /** Main transcript key in S3 */
  mainTranscriptKey: string;
  /** Subagent transcript key in S3 */
  subagentTranscriptKey: string;
  /** Load sample transcripts into S3 */
  loadSampleData: () => Promise<void>;
}

export const test = base.extend<TranscriptFixtures>({
  s3Client: async ({}, use) => {
    const client = new S3Client({
      endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true,
    });

    await use(client);

    // Cleanup happens automatically when LocalStack container stops
  },

  bucketName: async ({}, use) => {
    // Generate unique bucket name for test isolation
    const bucketName = `test-transcripts-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await use(bucketName);
  },

  mainTranscriptKey: async ({}, use) => {
    await use('transcripts/main.jsonl');
  },

  subagentTranscriptKey: async ({}, use) => {
    await use('transcripts/subagent.jsonl');
  },

  loadSampleData: async ({ s3Client, bucketName, mainTranscriptKey, subagentTranscriptKey }, use) => {
    const loadData = async () => {
      // Create bucket
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));

      // Read sample JSONL files
      const mainTranscriptPath = path.join(__dirname, 'data', 'main-transcript.jsonl');
      const subagentTranscriptPath = path.join(__dirname, 'data', 'subagent-transcript.jsonl');

      const mainTranscriptData = await fs.readFile(mainTranscriptPath, 'utf-8');
      const subagentTranscriptData = await fs.readFile(subagentTranscriptPath, 'utf-8');

      // Upload to LocalStack S3
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: mainTranscriptKey,
        Body: mainTranscriptData,
        ContentType: 'application/jsonl',
      }));

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: subagentTranscriptKey,
        Body: subagentTranscriptData,
        ContentType: 'application/jsonl',
      }));
    };

    await use(loadData);
  },
});

export { expect };
