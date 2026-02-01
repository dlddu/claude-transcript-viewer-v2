import { describe, it, expect, beforeEach, vi } from 'vitest';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { S3Service } from '../s3.service.js';

/**
 * Unit Tests: S3 Service
 *
 * Tests the S3 service layer that handles data retrieval
 */

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

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    vi.clearAllMocks();

    s3Service = new S3Service({
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      bucket: 'claude-transcripts',
      forcePathStyle: true,
    });
  });

  describe('getTranscript', () => {
    it('should retrieve and parse JSONL transcript from S3', async () => {
      // Arrange
      const transcriptId = 'test-transcript';
      const mockJsonlData = [
        '{"type":"user_message","content":"test1"}',
        '{"type":"assistant_message","content":"test2"}',
      ].join('\n');

      const mockStream = Readable.from([mockJsonlData]);
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Body: mockStream,
      });

      // Act
      const result = await s3Service.getTranscript(transcriptId);

      // Assert
      expect(result).toHaveProperty('events');
      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toEqual({
        type: 'user_message',
        content: 'test1',
      });
    });

    it('should handle malformed JSONL gracefully', async () => {
      // Arrange
      const transcriptId = 'test-transcript';
      const mockJsonlData = [
        '{"type":"user_message","content":"valid"}',
        'invalid json line',
        '{"type":"assistant_message","content":"valid2"}',
      ].join('\n');

      const mockStream = Readable.from([mockJsonlData]);
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Body: mockStream,
      });

      // Act & Assert
      await expect(s3Service.getTranscript(transcriptId)).rejects.toThrow('Invalid JSONL format');
    });

    it('should throw error when S3 object not found', async () => {
      // Arrange
      const transcriptId = 'non-existent';
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockRejectedValue({
        name: 'NoSuchKey',
      });

      // Act & Assert
      await expect(s3Service.getTranscript(transcriptId)).rejects.toThrow('Transcript not found');
    });
  });

  describe('listTranscripts', () => {
    it('should list all available transcripts from S3', async () => {
      // Arrange
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Contents: [
          { Key: 'transcripts/transcript-1.jsonl' },
          { Key: 'transcripts/transcript-2.jsonl' },
        ],
      });

      // Act
      const result = await s3Service.listTranscripts();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('transcript-1');
      expect(result).toContain('transcript-2');
    });

    it('should return empty array when no transcripts exist', async () => {
      // Arrange
      const { __mockSend } = await import('@aws-sdk/client-s3') as any;
      __mockSend.mockResolvedValue({
        Contents: [],
      });

      // Act
      const result = await s3Service.listTranscripts();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('streamToString', () => {
    it('should convert readable stream to string', async () => {
      // Arrange
      const expectedContent = 'test content';
      const mockStream = Readable.from([expectedContent]);

      // Act
      const result = await s3Service.streamToString(mockStream);

      // Assert
      expect(result).toBe(expectedContent);
    });

    it('should handle stream errors', async () => {
      // Arrange
      const mockStream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        },
      });

      // Act & Assert
      await expect(s3Service.streamToString(mockStream)).rejects.toThrow('Stream error');
    });
  });
});
