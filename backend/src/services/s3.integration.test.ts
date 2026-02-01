import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from './s3';

describe('S3Service Integration Tests', () => {
  let s3Service: S3Service;
  let s3Client: S3Client;
  const testBucket = 'test-transcripts';
  const testTranscriptId = 'integration-test-transcript';

  beforeAll(async () => {
    // Configure for LocalStack
    s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true,
    });

    s3Service = new S3Service({
      bucket: testBucket,
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
    });

    // Upload test transcript
    const testTranscript = {
      id: testTranscriptId,
      content: 'This is a test transcript for integration testing',
      timestamp: new Date().toISOString(),
      subagents: [
        {
          id: 'subagent-1',
          name: 'Test Subagent',
          content: 'Subagent transcript content',
        },
      ],
    };

    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: `${testTranscriptId}.json`,
        Body: JSON.stringify(testTranscript),
        ContentType: 'application/json',
      })
    );
  });

  afterAll(async () => {
    // Cleanup
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

  describe('LocalStack S3 Operations', () => {
    it('should fetch transcript from LocalStack S3', async () => {
      // Act
      const result = await s3Service.getTranscript(testTranscriptId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(testTranscriptId);
      expect(result.content).toContain('test transcript');
    });

    it('should fetch transcript with subagents', async () => {
      // Act
      const result = await s3Service.getTranscript(testTranscriptId);

      // Assert
      expect(result.subagents).toBeDefined();
      expect(result.subagents).toHaveLength(1);
      expect(result.subagents[0].name).toBe('Test Subagent');
    });

    it('should list transcripts from LocalStack S3', async () => {
      // Act
      const results = await s3Service.listTranscripts();

      // Assert
      expect(results).toContain(testTranscriptId);
    });
  });
});
