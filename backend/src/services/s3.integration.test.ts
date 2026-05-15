import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Service } from './s3';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../e2e/fixtures');
const sampleTranscriptBody = readFileSync(join(fixturesDir, 'transcript-20260201-001.json'), 'utf-8');
const sampleTranscript = JSON.parse(sampleTranscriptBody) as { id: string; content: string };

describe('S3Service Integration Tests', () => {
  let s3Service: S3Service;
  let s3Client: S3Client;
  const testBucket = 'test-transcripts';
  const testTranscriptId = sampleTranscript.id;

  beforeAll(async () => {
    s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

    s3Service = new S3Service({
      bucket: testBucket,
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:9000',
    });

    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: `${testTranscriptId}.json`,
        Body: sampleTranscriptBody,
        ContentType: 'application/json',
      })
    );
  });

  afterAll(async () => {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: testBucket,
          Key: `${testTranscriptId}.json`,
        })
      );
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

  describe('S3 Operations', () => {
    it('should fetch transcript from S3 endpoint', async () => {
      const result = await s3Service.getTranscript(testTranscriptId);

      expect(result).toBeDefined();
      expect(result.id).toBe(testTranscriptId);
      expect(result.content).toBe(sampleTranscript.content);
    });

    it('should fetch transcript with subagents', async () => {
      const result = await s3Service.getTranscript(testTranscriptId);

      expect(result.subagents).toBeDefined();
      expect(Array.isArray(result.subagents)).toBe(true);
      expect(result.subagents!.length).toBeGreaterThan(0);
      expect(result.subagents![0]).toHaveProperty('name');
    });

    it('should list transcripts from S3 endpoint', async () => {
      const results = await s3Service.listTranscripts();

      expect(results).toContain(testTranscriptId);
    });
  });

  describe('S3Service with prefix', () => {
    const prefix = 'tenants/acme/transcripts/';
    const prefixedTranscriptId = 'prefixed-integration-transcript';
    let prefixedService: S3Service;

    beforeAll(async () => {
      prefixedService = new S3Service({
        bucket: testBucket,
        region: 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:9000',
        prefix,
      });

      const prefixedTranscript = {
        id: prefixedTranscriptId,
        content: 'Prefixed transcript content for integration testing',
        timestamp: new Date().toISOString(),
      };

      await s3Client.send(
        new PutObjectCommand({
          Bucket: testBucket,
          Key: `${prefix}${prefixedTranscriptId}.json`,
          Body: JSON.stringify(prefixedTranscript),
          ContentType: 'application/json',
        })
      );
    });

    afterAll(async () => {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: testBucket,
            Key: `${prefix}${prefixedTranscriptId}.json`,
          })
        );
      } catch (error) {
        console.error('Prefixed cleanup failed:', error);
      }
    });

    it('should fetch transcript from a prefixed S3 key', async () => {
      const result = await prefixedService.getTranscript(prefixedTranscriptId);

      expect(result).toBeDefined();
      expect(result.id).toBe(prefixedTranscriptId);
      expect(result.content).toContain('Prefixed transcript content');
    });

    it('should not find prefixed transcript when queried without prefix', async () => {
      await expect(s3Service.getTranscript(prefixedTranscriptId)).rejects.toThrow(
        'Transcript not found'
      );
    });

    it('should list transcripts under prefix and strip the prefix from returned ids', async () => {
      const results = await prefixedService.listTranscripts();

      expect(results).toContain(prefixedTranscriptId);
      results.forEach((id) => {
        expect(id.startsWith(prefix)).toBe(false);
      });
    });
  });
});
