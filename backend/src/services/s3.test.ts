import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Service } from './s3';

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    s3Service = new S3Service({
      bucket: 'test-bucket',
      region: 'us-east-1',
    });
  });

  describe('getTranscript', () => {
    it('should fetch transcript from S3', async () => {
      // Arrange
      const transcriptId = 'test-transcript-1';

      // Act
      const result = await s3Service.getTranscript(transcriptId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(transcriptId);
      expect(result.content).toBeDefined();
    });

    it('should throw error when transcript not found', async () => {
      // Arrange
      const nonExistentId = 'non-existent';

      // Act & Assert
      await expect(s3Service.getTranscript(nonExistentId)).rejects.toThrow(
        'Transcript not found'
      );
    });

    it('should parse JSON transcript correctly', async () => {
      // Arrange
      const transcriptId = 'test-json-transcript';

      // Act
      const result = await s3Service.getTranscript(transcriptId);

      // Assert
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('listTranscripts', () => {
    it('should list all transcripts in bucket', async () => {
      // Act
      const results = await s3Service.listTranscripts();

      // Assert
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when bucket is empty', async () => {
      // Arrange
      const emptyService = new S3Service({
        bucket: 'empty-bucket',
        region: 'us-east-1',
      });

      // Act
      const results = await emptyService.listTranscripts();

      // Assert
      expect(results).toEqual([]);
    });
  });
});
