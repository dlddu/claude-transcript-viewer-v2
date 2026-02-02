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

  describe('unified timeline display', () => {
    it('should display messages in chronological order in timeline view', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'user' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'main',
            message: {
              role: 'user' as const,
              content: 'User message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-2',
            parentUuid: 'msg-1',
            agentId: 'main',
            message: {
              role: 'assistant' as const,
              content: 'Assistant response',
            },
          },
          {
            type: 'user' as const,
            sessionId: 'agent-sub1',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-3',
            parentUuid: null,
            agentId: 'agent-sub1',
            isSidechain: true,
            message: {
              role: 'user' as const,
              content: 'Subagent message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const timeline = screen.getByTestId('timeline-view');
      expect(timeline).toBeInTheDocument();
    });

    it('should visually distinguish subagent messages from main agent messages', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'main',
            message: {
              role: 'assistant' as const,
              content: 'Main agent message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-sub1',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-2',
            parentUuid: null,
            agentId: 'agent-sub1',
            isSidechain: true,
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
      const timelineItems = screen.getAllByTestId('timeline-item');
      expect(timelineItems).toHaveLength(2);

      const mainItem = timelineItems[0];
      const subagentItem = timelineItems[1];

      expect(mainItem).toHaveClass('timeline-item-main');
      expect(subagentItem).toHaveClass('timeline-item-subagent');
    });

    it('should apply indentation to subagent messages', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-sub1',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'agent-sub1',
            isSidechain: true,
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
      const subagentItem = screen.getByTestId('timeline-item');
      expect(subagentItem).toHaveClass('timeline-item-indented');
    });

    it('should display subagent badge with agent identifier', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-data-analyzer',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'agent-data-analyzer',
            isSidechain: true,
            message: {
              role: 'assistant' as const,
              content: 'Analyzing data',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const badge = screen.getByTestId('subagent-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('agent-data-analyzer');
    });

    it('should display different background color for subagent messages', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'main',
            message: {
              role: 'assistant' as const,
              content: 'Main message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-sub1',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-2',
            parentUuid: null,
            agentId: 'agent-sub1',
            isSidechain: true,
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
      const items = screen.getAllByTestId('timeline-item');
      const mainItem = items[0];
      const subagentItem = items[1];

      const mainStyles = window.getComputedStyle(mainItem);
      const subagentStyles = window.getComputedStyle(subagentItem);

      expect(mainStyles.backgroundColor).not.toBe(subagentStyles.backgroundColor);
    });

    it('should show timestamp for each message in timeline', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'main',
            message: {
              role: 'assistant' as const,
              content: 'Message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const timestamp = screen.getByTestId('item-timestamp');
      expect(timestamp).toBeInTheDocument();
      expect(timestamp).toHaveAttribute('data-timestamp', '2026-02-01T05:00:00Z');
    });

    it('should merge and display messages from agentId field', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-123',
            timestamp: '2026-02-01T05:00:00Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'main',
            message: {
              role: 'assistant' as const,
              content: 'Main message',
            },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a1b2c3',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-2',
            parentUuid: null,
            agentId: 'agent-a1b2c3',
            isSidechain: true,
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
      expect(screen.getByText('Main message')).toBeInTheDocument();
      expect(screen.getByText('Subagent message')).toBeInTheDocument();
    });

    it('should use isSidechain field to determine visual treatment', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-sub1',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'msg-1',
            parentUuid: null,
            agentId: 'agent-sub1',
            isSidechain: true,
            message: {
              role: 'assistant' as const,
              content: 'Sidechain message',
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const item = screen.getByTestId('timeline-item');
      expect(item).toHaveAttribute('data-is-sidechain', 'true');
    });

    it('should handle empty messages array gracefully', () => {
      // Arrange
      const mockTranscript = {
        id: 'session-123',
        session_id: 'session-123',
        content: '',
        messages: [],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const timeline = screen.getByTestId('timeline-view');
      expect(timeline).toBeInTheDocument();
      expect(screen.getByText(/no messages/i)).toBeInTheDocument();
    });
  });
});
