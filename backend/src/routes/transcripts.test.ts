import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('Transcripts API', () => {
  describe('GET /api/transcripts/:id', () => {
    it('should return transcript data from S3', async () => {
      // Arrange
      const transcriptId = 'test-transcript-1';

      // Act
      const response = await request(app).get(`/api/transcripts/${transcriptId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', transcriptId);
      expect(response.body).toHaveProperty('content');
    });

    it('should return 404 when transcript not found', async () => {
      // Arrange
      const nonExistentId = 'non-existent-id';

      // Act
      const response = await request(app).get(`/api/transcripts/${nonExistentId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle S3 errors gracefully', async () => {
      // Arrange
      const invalidId = 'invalid-id';

      // Act
      const response = await request(app).get(`/api/transcripts/${invalidId}`);

      // Assert
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should include subagent transcripts in response', async () => {
      // Arrange
      const transcriptId = 'test-with-subagents';

      // Act
      const response = await request(app).get(`/api/transcripts/${transcriptId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subagents');
      expect(Array.isArray(response.body.subagents)).toBe(true);
    });
  });

  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });
});
