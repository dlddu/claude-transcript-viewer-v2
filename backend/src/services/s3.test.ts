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

  describe('getTranscriptBySessionId - Timeline Integration', () => {
    it('should merge main and subagent transcripts into unified timeline', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result).toBeDefined();
      expect(result.session_id).toBe(sessionId);
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);

      // Should include both main agent and subagent messages
      expect(result.messages!.length).toBeGreaterThan(2);

      // Should have messages from main agent
      const mainMessages = result.messages!.filter(msg => msg.sessionId === sessionId);
      expect(mainMessages.length).toBeGreaterThan(0);

      // Should have messages from subagents
      const subagentMessages = result.messages!.filter(msg => msg.sessionId !== sessionId);
      expect(subagentMessages.length).toBeGreaterThan(0);
    });

    it('should sort messages by timestamp in chronological order', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(1);

      // Verify chronological order
      for (let i = 1; i < result.messages!.length; i++) {
        const prevTimestamp = new Date(result.messages![i - 1].timestamp);
        const currTimestamp = new Date(result.messages![i].timestamp);

        expect(currTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
      }
    });

    it('should add agentId field to all messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result.messages).toBeDefined();

      // Every message should have an agentId field
      result.messages!.forEach(msg => {
        expect(msg).toHaveProperty('agentId');
        expect(typeof msg.agentId).toBe('string');
        expect(msg.agentId).not.toBe('');
      });
    });

    it('should set agentId to sessionId for main agent messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      const mainMessages = result.messages!.filter(msg => msg.sessionId === sessionId);

      mainMessages.forEach(msg => {
        expect(msg.agentId).toBe(sessionId);
      });
    });

    it('should set agentId to subagent sessionId for subagent messages', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      const subagentMessages = result.messages!.filter(msg => msg.sessionId !== sessionId);

      subagentMessages.forEach(msg => {
        expect(msg.agentId).toBe(msg.sessionId);
        expect(msg.agentId).not.toBe(sessionId);
      });
    });

    it('should handle multiple JSONL files from subdirectory', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      // Should have subagents array populated
      expect(result.subagents).toBeDefined();
      expect(result.subagents!.length).toBeGreaterThan(0);

      // Each subagent should have messages parsed from JSONL
      result.subagents!.forEach(subagent => {
        expect(subagent.messages).toBeDefined();
        expect(Array.isArray(subagent.messages)).toBe(true);
      });
    });

    it('should parse JSONL format correctly', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result.messages).toBeDefined();

      // Verify message structure
      result.messages!.forEach(msg => {
        expect(msg).toHaveProperty('type');
        expect(msg).toHaveProperty('sessionId');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('uuid');
        expect(msg).toHaveProperty('parentUuid');
      });
    });

    it('should handle session with no subagents gracefully', async () => {
      // Arrange
      const sessionId = 'session-xyz789';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result).toBeDefined();
      expect(result.session_id).toBe(sessionId);
      expect(result.messages).toBeDefined();

      // Should only have main agent messages
      const allMessages = result.messages!;
      allMessages.forEach(msg => {
        expect(msg.sessionId).toBe(sessionId);
        expect(msg.agentId).toBe(sessionId);
      });

      // Subagents array should be empty
      expect(result.subagents).toEqual([]);
    });

    it('should maintain message metadata after merging', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      expect(result.messages).toBeDefined();

      // Check that original message fields are preserved
      result.messages!.forEach(msg => {
        if (msg.message) {
          expect(msg.message).toHaveProperty('role');
          expect(msg.message).toHaveProperty('content');

          if (msg.message.model) {
            expect(typeof msg.message.model).toBe('string');
          }
        }

        // Metadata fields should be preserved
        if (msg.cwd) {
          expect(typeof msg.cwd).toBe('string');
        }
        if (msg.version) {
          expect(typeof msg.version).toBe('string');
        }
      });
    });

    it('should preserve content blocks in message content', async () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const result = await s3Service.getTranscriptBySessionId(sessionId);

      // Assert
      const messagesWithContent = result.messages!.filter(
        msg => msg.message && Array.isArray(msg.message.content)
      );

      if (messagesWithContent.length > 0) {
        messagesWithContent.forEach(msg => {
          const content = msg.message!.content as Array<{ type: string }>;
          content.forEach(block => {
            expect(block).toHaveProperty('type');
          });
        });
      }
    });
  });
});
