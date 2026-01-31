import { test, expect } from '@playwright/test';
import { S3Client, ListBucketsCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * LocalStack S3 Integration Tests
 * Tests S3 interaction with LocalStack service container
 * These tests should fail until the implementation is complete (TDD Red Phase)
 */

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TEST_BUCKET = 'test-transcripts';

test.describe('LocalStack S3 Integration', () => {
  let s3Client: S3Client;

  test.beforeAll(() => {
    s3Client = new S3Client({
      endpoint: LOCALSTACK_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true,
    });
  });

  test('should connect to LocalStack S3 service', async () => {
    // Arrange & Act
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    // Assert
    expect(response.Buckets).toBeDefined();
    expect(Array.isArray(response.Buckets)).toBe(true);
  });

  test('should have test-transcripts bucket available', async () => {
    // Arrange & Act
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    // Assert
    const bucketNames = response.Buckets?.map(b => b.Name) || [];
    expect(bucketNames).toContain(TEST_BUCKET);
  });

  test('should load main transcript fixture from S3', async () => {
    // Arrange
    const command = new GetObjectCommand({
      Bucket: TEST_BUCKET,
      Key: 'main-transcript.jsonl',
    });

    // Act
    const response = await s3Client.send(command);
    const bodyText = await response.Body?.transformToString();

    // Assert
    expect(bodyText).toBeDefined();
    expect(bodyText).not.toBe('');

    // Verify JSONL format (each line should be valid JSON)
    const lines = bodyText!.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    lines.forEach((line, index) => {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('type');
      expect(parsed).toHaveProperty('content');
    });
  });

  test('should load subagent transcript fixture from S3', async () => {
    // Arrange
    const command = new GetObjectCommand({
      Bucket: TEST_BUCKET,
      Key: 'subagent-transcript.jsonl',
    });

    // Act
    const response = await s3Client.send(command);
    const bodyText = await response.Body?.transformToString();

    // Assert
    expect(bodyText).toBeDefined();
    expect(bodyText).not.toBe('');

    // Verify JSONL format
    const lines = bodyText!.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    lines.forEach((line) => {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('type');
      expect(parsed).toHaveProperty('content');
    });
  });
});
