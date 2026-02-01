import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/**
 * Backend Unit Tests: S3 Proxy for Transcript Data
 *
 * Tests the backend API endpoints that proxy requests to S3
 */

// Mock S3Client
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({
      send: mockSend,
    })),
    GetObjectCommand: vi.fn((input) => ({ input })),
    ListObjectsV2Command: vi.fn((input) => ({ input })),
    __mockSend: mockSend,
  };
});

describe('Transcript API Routes', () => {
  let app: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Import app after mocks are set up
    const { default: appModule } = await import('../../index.js');
    app = appModule;
  });

  describe('GET /api/transcript/:id', () => {
    it('should fetch transcript from S3 and return parsed JSONL', async () => {
      // Arrange
      const transcriptId = 'sample-main-transcript';
      const mockJsonlData = [
        '{"type":"user_message","timestamp":"2026-02-01T10:00:00Z","content":"Hello"}',
        '{"type":"assistant_message","timestamp":"2026-02-01T10:00:05Z","content":"Hi there"}',
      ].join('\n');

      const mockStream = Readable.from([mockJsonlData]);
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Body: mockStream,
      });

      // Act
      const response = await request(app)
        .get(`/api/transcript/${transcriptId}`)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events).toHaveLength(2);
      expect(response.body.events[0]).toHaveProperty('type', 'user_message');
      expect(__mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'claude-transcripts',
            Key: `transcripts/${transcriptId}.jsonl`,
          }),
        })
      );
    });

    it('should return 404 when transcript does not exist in S3', async () => {
      // Arrange
      const transcriptId = 'non-existent-transcript';
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockRejectedValue({
        name: 'NoSuchKey',
        message: 'The specified key does not exist',
      });

      // Act & Assert
      const response = await request(app)
        .get(`/api/transcript/${transcriptId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Transcript not found');
    });

    it('should return 500 on S3 connection error', async () => {
      // Arrange
      const transcriptId = 'sample-main-transcript';
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockRejectedValue({
        name: 'NetworkingError',
        message: 'Connection timeout',
      });

      // Act & Assert
      const response = await request(app)
        .get(`/api/transcript/${transcriptId}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate transcript ID format', async () => {
      // Arrange
      const invalidId = '../../../etc/passwd';

      // Act & Assert
      const response = await request(app)
        .get(`/api/transcript/${invalidId}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid transcript ID');
    });
  });

  describe('GET /api/transcript/:id/subagent/:subagentId', () => {
    it('should fetch subagent transcript from S3', async () => {
      // Arrange
      const transcriptId = 'sample-main-transcript';
      const subagentId = 'sample-subagent-transcript';
      const mockJsonlData = [
        '{"type":"subagent_init","timestamp":"2026-02-01T10:00:15Z"}',
      ].join('\n');

      const mockStream = Readable.from([mockJsonlData]);
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Body: mockStream,
      });

      // Act
      const response = await request(app)
        .get(`/api/transcript/${transcriptId}/subagent/${subagentId}`)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events[0]).toHaveProperty('type', 'subagent_init');
    });
  });

  describe('S3 Connection Health Check', () => {
    it('should verify S3 connection on startup', async () => {
      // Arrange
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({});

      // Act
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('s3');
      expect(response.body.s3).toBe('connected');
    });

    it('should report unhealthy if S3 is unavailable', async () => {
      // Arrange
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockRejectedValue(new Error('Connection failed'));

      // Act
      const response = await request(app)
        .get('/api/health')
        .expect(503);

      // Assert
      expect(response.body).toHaveProperty('s3');
      expect(response.body.s3).toBe('disconnected');
    });
  });
});
