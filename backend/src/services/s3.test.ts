import { describe, it, expect, beforeEach } from 'vitest';
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

  describe('mergeSessionTranscripts', () => {
    it('should merge main and subagent JSONL files into unified timeline', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      expect(result).toBeDefined();
      expect(result.sessionId).toBe(sessionId);
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should add agentId field to each message identifying source', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      expect(result.messages).toBeDefined();
      result.messages.forEach((msg) => {
        expect(msg).toHaveProperty('agentId');
        expect(typeof msg.agentId).toBe('string');
      });
    });

    it('should set agentId to main for main agent messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      const mainMessages = result.messages.filter(
        (msg) => msg.sessionId === sessionId
      );
      mainMessages.forEach((msg) => {
        expect(msg.agentId).toBe('main');
      });
    });

    it('should set agentId to subagent ID for subagent messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      const subagentMessages = result.messages.filter(
        (msg) => msg.sessionId !== sessionId
      );
      subagentMessages.forEach((msg) => {
        expect(msg.agentId).not.toBe('main');
        expect(msg.agentId).toBeTruthy();
      });
    });

    it('should sort messages chronologically by timestamp', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      expect(result.messages.length).toBeGreaterThan(1);
      for (let i = 1; i < result.messages.length; i++) {
        const prevTimestamp = new Date(result.messages[i - 1].timestamp).getTime();
        const currTimestamp = new Date(result.messages[i].timestamp).getTime();
        expect(currTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
      }
    });

    it('should preserve isSidechain field from original messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      result.messages.forEach((msg) => {
        if (msg.isSidechain !== undefined) {
          expect(typeof msg.isSidechain).toBe('boolean');
        }
      });
    });

    it('should include all messages from all JSONL files in session directory', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      // Should have main agent messages + subagent messages
      const mainMessages = result.messages.filter(
        (msg) => msg.agentId === 'main'
      );
      const subagentMessages = result.messages.filter(
        (msg) => msg.agentId !== 'main'
      );

      expect(mainMessages.length).toBeGreaterThan(0);
      expect(subagentMessages.length).toBeGreaterThan(0);
      expect(result.messages.length).toBe(
        mainMessages.length + subagentMessages.length
      );
    });

    it('should throw error when session not found', async () => {
      // Arrange
      const sessionId = 'non-existent-session';

      // Act & Assert
      await expect(s3Service.mergeSessionTranscripts(sessionId)).rejects.toThrow(
        'No transcript found for session ID'
      );
    });

    it('should handle session with no subagents', async () => {
      // Arrange
      const sessionId = 'session-xyz789';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      expect(result.messages).toBeDefined();
      const allMessagesAreMain = result.messages.every(
        (msg) => msg.agentId === 'main'
      );
      expect(allMessagesAreMain).toBe(true);
    });

    it('should parse JSONL format correctly', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      result.messages.forEach((msg) => {
        expect(msg).toHaveProperty('type');
        expect(msg).toHaveProperty('sessionId');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('uuid');
      });
    });

    it('should maintain message metadata during merge', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.mergeSessionTranscripts(sessionId);

      // Assert
      result.messages.forEach((msg) => {
        // Should preserve all original fields
        expect(msg).toHaveProperty('uuid');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('agentId'); // Added field

        if (msg.message) {
          expect(msg.message).toHaveProperty('role');
          expect(msg.message).toHaveProperty('content');
        }
      });
    });
  });
});
