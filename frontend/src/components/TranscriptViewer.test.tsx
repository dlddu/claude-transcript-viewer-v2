import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptViewer } from './TranscriptViewer';

describe('TranscriptViewer', () => {
  describe('rendering', () => {
    it('should render transcript viewer container', () => {
      // Arrange & Act
      render(<TranscriptViewer />);

      // Assert
      const container = screen.getByTestId('transcript-viewer');
      expect(container).toBeInTheDocument();
    });

    it('should display loading state initially', () => {
      // Arrange & Act
      render(<TranscriptViewer />);

      // Assert
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('transcript display', () => {
    it('should display main transcript content when loaded', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript-1',
        content: 'This is a test transcript',
        timestamp: '2026-02-01T00:00:00Z',
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByText('This is a test transcript')).toBeInTheDocument();
    });

    it('should display subagent transcripts in expandable sections', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript-1',
        content: 'Main transcript',
        subagents: [
          {
            id: 'subagent-1',
            name: 'Test Subagent',
            content: 'Subagent transcript content',
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByText('Test Subagent')).toBeInTheDocument();
    });

    it('should handle empty transcript gracefully', () => {
      // Arrange & Act
      render(<TranscriptViewer transcript={null} />);

      // Assert
      expect(screen.getByText(/no transcript available/i)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should display error message when transcript fetch fails', () => {
      // Arrange
      const error = new Error('Failed to fetch transcript');

      // Act
      render(<TranscriptViewer error={error} />);

      // Assert
      expect(screen.getByText(/failed to fetch transcript/i)).toBeInTheDocument();
    });
  });

  describe('timeline integration - unified view', () => {
    it('should display messages in unified timeline when agentId field present', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'Main agent message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant' as const,
              content: 'Subagent message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByText('Main agent message')).toBeInTheDocument();
      expect(screen.getByText('Subagent message')).toBeInTheDocument();
    });

    it('should render messages in chronological order', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'First message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant' as const,
              content: 'Second message',
            },
          },
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-002',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'Third message',
            },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const messages = container.querySelectorAll('.message');
      expect(messages).toHaveLength(3);

      expect(messages[0]).toHaveTextContent('First message');
      expect(messages[1]).toHaveTextContent('Second message');
      expect(messages[2]).toHaveTextContent('Third message');
    });

    it('should visually distinguish subagent messages with indentation', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'Main message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant' as const,
              content: 'Subagent message',
            },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const subagentMessage = container.querySelector('.message-subagent');
      expect(subagentMessage).toBeInTheDocument();
      expect(subagentMessage).toHaveClass('message-subagent');
    });

    it('should display subagent label for subagent messages', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant' as const,
              content: 'Subagent message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByTestId('subagent-label')).toBeInTheDocument();
    });

    it('should apply different background color to subagent messages', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'Main message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3d',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a1b2c3d',
            message: {
              role: 'assistant' as const,
              content: 'Subagent message',
            },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const mainMessage = container.querySelector('.message:not(.message-subagent)');
      const subagentMessage = container.querySelector('.message-subagent');

      expect(mainMessage).toBeInTheDocument();
      expect(subagentMessage).toBeInTheDocument();
      expect(subagentMessage).toHaveClass('message-subagent');
    });

    it('should identify main vs subagent by comparing agentId to session_id', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: 'Main agent',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'different-agent',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'different-agent',
            message: {
              role: 'assistant' as const,
              content: 'Subagent',
            },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const messages = container.querySelectorAll('.message');
      expect(messages[0]).not.toHaveClass('message-subagent');
      expect(messages[1]).toHaveClass('message-subagent');
    });

    it('should handle messages without agentId field gracefully', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-001',
            parentUuid: null,
            // No agentId field
            message: {
              role: 'user' as const,
              content: 'Legacy message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByText('Legacy message')).toBeInTheDocument();
    });

    it('should display subagent name when available', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'data-analyzer',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'data-analyzer',
            message: {
              role: 'assistant' as const,
              content: 'Analyzing data',
            },
          },
        ],
        subagents: [
          {
            id: 'data-analyzer',
            name: 'Data Analyzer',
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const subagentLabel = screen.getByTestId('subagent-label');
      expect(subagentLabel).toHaveTextContent('Data Analyzer');
    });
  });
});
