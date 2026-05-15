import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const mockS3Service = vi.hoisted(() => ({
  getTranscript: vi.fn(),
  getTranscriptBySessionId: vi.fn(),
  listTranscripts: vi.fn(),
}));

vi.mock('../services/s3.js', () => ({
  S3Service: vi.fn().mockImplementation(() => mockS3Service),
}));

import { app } from '../app';

beforeEach(() => {
  mockS3Service.getTranscript.mockReset();
  mockS3Service.getTranscriptBySessionId.mockReset();
  mockS3Service.listTranscripts.mockReset();
});

describe('Transcripts API', () => {
  describe('GET /api/transcripts/:id', () => {
    it('should return transcript data from S3', async () => {
      const transcriptId = 'test-transcript-1';
      mockS3Service.getTranscript.mockResolvedValueOnce({
        id: transcriptId,
        content: 'Some transcript content',
      });

      const response = await request(app).get(`/api/transcripts/${transcriptId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', transcriptId);
      expect(response.body).toHaveProperty('content');
    });

    it('should return 404 when transcript not found', async () => {
      mockS3Service.getTranscript.mockRejectedValueOnce(new Error('Transcript not found'));

      const response = await request(app).get('/api/transcripts/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle S3 errors gracefully', async () => {
      mockS3Service.getTranscript.mockRejectedValueOnce(new Error('Unexpected S3 failure'));

      const response = await request(app).get('/api/transcripts/invalid-id');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should include subagent transcripts in response', async () => {
      const transcriptId = 'test-with-subagents';
      mockS3Service.getTranscript.mockResolvedValueOnce({
        id: transcriptId,
        content: 'Transcript with subagents',
        subagents: [],
      });

      const response = await request(app).get(`/api/transcripts/${transcriptId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subagents');
      expect(Array.isArray(response.body.subagents)).toBe(true);
    });
  });

  describe('GET /api/transcript/session/:sessionId', () => {
    it('should return transcript data for valid session ID', async () => {
      const sessionId = 'session-abc123';
      mockS3Service.getTranscriptBySessionId.mockResolvedValueOnce({
        id: sessionId,
        session_id: sessionId,
        content: '{}',
        messages: [{ type: 'user', sessionId, uuid: 'msg-001', timestamp: '2026-02-01T05:00:00Z', parentUuid: null }],
        subagents: [],
      });

      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id', sessionId);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
    });

    it('should return 404 when session ID not found', async () => {
      mockS3Service.getTranscriptBySessionId.mockRejectedValueOnce(
        new Error('No transcript found for session ID')
      );

      const response = await request(app).get('/api/transcript/session/session-nonexistent-999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/not found|no transcript found/i);
    });

    it('should include subagents array in response for valid session', async () => {
      const sessionId = 'session-abc123';
      mockS3Service.getTranscriptBySessionId.mockResolvedValueOnce({
        id: sessionId,
        session_id: sessionId,
        content: '{}',
        messages: [],
        subagents: [],
      });

      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subagents');
      expect(Array.isArray(response.body.subagents)).toBe(true);
    });

    it('should include messages with proper structure', async () => {
      const sessionId = 'session-abc123';
      mockS3Service.getTranscriptBySessionId.mockResolvedValueOnce({
        id: sessionId,
        session_id: sessionId,
        content: '{}',
        messages: [
          { type: 'user', sessionId, uuid: 'msg-001', timestamp: '2026-02-01T05:00:00Z', parentUuid: null },
        ],
        subagents: [],
      });

      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
      if (response.body.messages.length > 0) {
        const firstMessage = response.body.messages[0];
        expect(firstMessage).toHaveProperty('type');
        expect(firstMessage).toHaveProperty('sessionId');
        expect(firstMessage).toHaveProperty('uuid');
      }
    });

    it('should handle S3 errors gracefully', async () => {
      mockS3Service.getTranscriptBySessionId.mockRejectedValueOnce(new Error('S3 connection failed'));

      const response = await request(app).get('/api/transcript/session/session-trigger-s3-error');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should trim whitespace from session ID parameter', async () => {
      const sessionId = 'session-abc123';
      mockS3Service.getTranscriptBySessionId.mockImplementation(async (sid: string) => {
        // Route trims before calling; service should receive trimmed value
        expect(sid).toBe(sessionId);
        return {
          id: sessionId,
          session_id: sessionId,
          content: '{}',
          messages: [],
          subagents: [],
        };
      });

      const response = await request(app).get(`/api/transcript/session/${encodeURIComponent('  session-abc123  ')}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id', sessionId);
    });

    it('should return consistent response structure matching JSONL format', async () => {
      const sessionId = 'session-abc123';
      mockS3Service.getTranscriptBySessionId.mockResolvedValueOnce({
        id: sessionId,
        session_id: sessionId,
        content: '{}',
        messages: [
          { type: 'user', sessionId, uuid: 'msg-001', timestamp: '2026-02-01T05:00:00Z', parentUuid: null },
        ],
        subagents: [],
      });

      const response = await request(app).get(`/api/transcript/session/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        session_id: sessionId,
        content: expect.any(String),
        messages: expect.any(Array),
        subagents: expect.any(Array),
      });

      if (response.body.messages.length > 0) {
        const message = response.body.messages[0];
        expect(message).toMatchObject({
          type: expect.stringMatching(/^(user|assistant|queue-operation)$/),
          sessionId: expect.any(String),
          uuid: expect.any(String),
        });
      }
    });
  });

  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });
});
