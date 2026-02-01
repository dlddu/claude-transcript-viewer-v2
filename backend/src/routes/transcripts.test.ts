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

  describe('GET /api/transcript/session/:sessionId', () => {
    it('should return transcript data for valid session ID', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id', sessionId);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('metadata');
    });

    it('should return 404 when session ID not found', async () => {
      // Arrange
      const nonExistentSessionId = 'session-nonexistent-999';

      // Act
      const response = await request(app).get(`/api/transcript/session/${nonExistentSessionId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/not found|no transcript found/i);
    });

    it('should return 400 when session ID is invalid format', async () => {
      // Arrange
      const invalidSessionId = '   '; // whitespace only

      // Act
      const response = await request(app).get(`/api/transcript/session/${invalidSessionId}`);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should include subagents array in response for valid session', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subagents');
      expect(Array.isArray(response.body.subagents)).toBe(true);
    });

    it('should include tools_used array in response', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tools_used');
      expect(Array.isArray(response.body.tools_used)).toBe(true);
    });

    it('should handle S3 errors gracefully', async () => {
      // Arrange
      const sessionId = 'session-trigger-s3-error';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      // Assert
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should trim whitespace from session ID parameter', async () => {
      // Arrange
      const sessionIdWithSpaces = '  session-abc123  ';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionIdWithSpaces}`);

      // Assert
      // Should succeed after trimming whitespace
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id', 'session-abc123');
    });

    it('should return consistent response structure matching fixture data', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        session_id: sessionId,
        timestamp: expect.any(String),
        content: expect.any(String),
        metadata: {
          model: expect.any(String),
          total_tokens: expect.any(Number),
          duration_ms: expect.any(Number),
        },
        subagents: expect.any(Array),
        tools_used: expect.any(Array),
      });
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
