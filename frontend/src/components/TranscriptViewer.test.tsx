import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

      // Assert - main message is visible directly
      expect(screen.getByText('Main agent message')).toBeInTheDocument();
      // Subagent message is inside a collapsed group, so check for the group header
      expect(screen.getByTestId('subagent-group-header')).toBeInTheDocument();
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

      // Assert - main messages are directly visible
      const mainMessages = container.querySelectorAll('.message:not(.message-subagent)');
      expect(mainMessages).toHaveLength(2);
      expect(mainMessages[0]).toHaveTextContent('First message');
      expect(mainMessages[1]).toHaveTextContent('Third message');

      // Subagent group is between them
      const subagentGroup = container.querySelector('.subagent-group');
      expect(subagentGroup).toBeInTheDocument();
    });

    it('should visually distinguish subagent messages with a group container', () => {
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

      // Assert - subagent messages are wrapped in a group
      const subagentGroup = container.querySelector('.subagent-group');
      expect(subagentGroup).toBeInTheDocument();
      expect(subagentGroup).toHaveClass('subagent-group');
    });

    it('should display subagent name in group header', () => {
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

      // Assert - subagent name is shown in the group header
      const groupHeader = screen.getByTestId('subagent-group-header');
      expect(groupHeader).toBeInTheDocument();
      expect(groupHeader).toHaveTextContent('agent-a1b2c3d');
    });

    it('should apply different background color to subagent group', () => {
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
      const subagentGroup = container.querySelector('.subagent-group');

      expect(mainMessage).toBeInTheDocument();
      expect(subagentGroup).toBeInTheDocument();
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

      // Assert - main message is rendered directly, subagent is in a group
      const mainMessages = container.querySelectorAll('.message:not(.message-subagent)');
      expect(mainMessages[0]).not.toHaveClass('message-subagent');

      const subagentGroup = container.querySelector('.subagent-group');
      expect(subagentGroup).toBeInTheDocument();
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

    it('should display subagent name when available in group header', () => {
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
      const groupHeader = screen.getByTestId('subagent-group-header');
      expect(groupHeader).toHaveTextContent('Data Analyzer');
    });
  });

  describe('Subagent Group Collapse/Expand', () => {
    it('should render subagent groups collapsed by default', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'Subagent message' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByTestId('subagent-group-header')).toBeInTheDocument();
      expect(screen.getByTestId('subagent-group-header')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('subagent-group-body')).not.toBeInTheDocument();
    });

    it('should expand subagent group when header is clicked', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'Subagent message' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);
      screen.getByTestId('subagent-group-header').click();

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('subagent-group-body')).toBeInTheDocument();
        expect(screen.getByText('Subagent message')).toBeInTheDocument();
      });
    });

    it('should collapse subagent group when header is clicked again', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'Subagent message' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);
      const header = screen.getByTestId('subagent-group-header');

      // Expand
      header.click();
      await waitFor(() => {
        expect(screen.getByTestId('subagent-group-body')).toBeInTheDocument();
      });

      // Collapse
      header.click();
      await waitFor(() => {
        expect(screen.queryByTestId('subagent-group-body')).not.toBeInTheDocument();
      });
    });

    it('should display message count in group header', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg1' },
          },
          {
            type: 'user' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-002',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'user' as const, content: 'msg2' },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:15Z',
            uuid: 'sub-003',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg3' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const count = screen.getByTestId('subagent-group-count');
      expect(count).toHaveTextContent('3 messages');
    });

    it('should display singular message count for single message group', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg1' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const count = screen.getByTestId('subagent-group-count');
      expect(count).toHaveTextContent('1 message');
    });

    it('should group consecutive subagent messages from same agentId', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg1' },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-002',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg2' },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:15Z',
            uuid: 'sub-003',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'msg3' },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert - only 1 subagent group
      const groups = container.querySelectorAll('.subagent-group');
      expect(groups).toHaveLength(1);
      expect(screen.getByTestId('subagent-group-count')).toHaveTextContent('3 messages');
    });

    it('should create separate groups for different subagents', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'Agent A message' },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-b',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-002',
            parentUuid: null,
            agentId: 'agent-b',
            message: { role: 'assistant' as const, content: 'Agent B message' },
          },
        ],
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const groups = container.querySelectorAll('.subagent-group');
      expect(groups).toHaveLength(2);
    });

    it('should maintain expand state of one group when toggling another', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: { role: 'assistant' as const, content: 'Agent A message' },
          },
          {
            type: 'assistant' as const,
            sessionId: 'agent-b',
            timestamp: '2026-02-01T05:00:10Z',
            uuid: 'sub-002',
            parentUuid: null,
            agentId: 'agent-b',
            message: { role: 'assistant' as const, content: 'Agent B message' },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);
      const headers = screen.getAllByTestId('subagent-group-header');

      // Expand first group
      headers[0].click();
      await waitFor(() => {
        expect(headers[0]).toHaveAttribute('aria-expanded', 'true');
      });

      // Expand second group
      headers[1].click();
      await waitFor(() => {
        expect(headers[1]).toHaveAttribute('aria-expanded', 'true');
      });

      // First group should still be expanded
      expect(headers[0]).toHaveAttribute('aria-expanded', 'true');
    });

    it('should show tool details inside expanded subagent group', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'agent-a',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'sub-001',
            parentUuid: null,
            agentId: 'agent-a',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' },
                },
              ],
            },
          },
        ],
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Expand the subagent group first
      screen.getByTestId('subagent-group-header').click();
      await waitFor(() => {
        expect(screen.getByTestId('subagent-group-body')).toBeInTheDocument();
      });

      // Then click the message to expand tool details
      screen.getByTestId('timeline-item').click();
      await waitFor(() => {
        expect(screen.getByTestId('tool-detail-view')).toBeInTheDocument();
        expect(screen.getByTestId('tool-name')).toHaveTextContent('DataAnalyzer');
      });
    });
  });

  describe('Tool Detail View - tool_use and tool_result display', () => {
    it('should identify messages containing tool_use content blocks', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Let me analyze this for you.' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ],
              model: 'claude-sonnet-4-5'
            }
          }
        ]
      };

      // Act
      render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      expect(screen.getByText('Let me analyze this for you.')).toBeInTheDocument();
      const toolIndicators = screen.queryAllByTestId('tool-use-indicator');
      expect(toolIndicators.length).toBeGreaterThan(0);
    });

    it('should display tool_use indicator for messages with tool_use blocks', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using a tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/test.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const toolIndicator = container.querySelector('[data-testid="tool-use-indicator"]');
      expect(toolIndicator).toBeInTheDocument();
    });

    it('should not display tool indicator for messages without tool_use', () => {
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
              content: 'Regular message without tools'
            }
          }
        ]
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const toolIndicator = container.querySelector('[data-testid="tool-use-indicator"]');
      expect(toolIndicator).not.toBeInTheDocument();
    });

    it('should make messages with tool_use clickable', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Analyzing dataset' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { container } = render(<TranscriptViewer transcript={mockTranscript} />);

      // Assert
      const messageWithTool = container.querySelector('[data-testid="timeline-item"]');
      expect(messageWithTool).toHaveAttribute('role', 'button');
      expect(messageWithTool).toHaveAttribute('aria-expanded');
    });

    it('should display tool details when tool_use message is expanded', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Analyzing data' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');

      // Simulate click to expand
      messageWithTool.click();

      // Assert - Tool detail view should be visible
      const toolDetailView = await findByTestId('tool-detail-view');
      expect(toolDetailView).toBeInTheDocument();
      expect(toolDetailView).toBeVisible();
    });

    it('should display tool name in expanded detail view', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');
      messageWithTool.click();

      // Assert
      const toolName = await findByTestId('tool-name');
      expect(toolName).toHaveTextContent('DataAnalyzer');
    });

    it('should display tool ID in expanded detail view', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');
      messageWithTool.click();

      // Assert
      const toolId = await findByTestId('tool-id');
      expect(toolId).toHaveTextContent('tool-001');
    });

    it('should display tool input as formatted JSON', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv', format: 'csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');
      messageWithTool.click();

      // Assert
      const toolInput = await findByTestId('tool-input');
      expect(toolInput).toBeInTheDocument();
      expect(toolInput).toHaveTextContent('file_path');
      expect(toolInput).toHaveTextContent('input.csv');

      // Should contain pre or code element for JSON formatting
      const codeBlock = toolInput.querySelector('pre, code');
      expect(codeBlock).toBeInTheDocument();
    });

    it('should match and display tool_result for corresponding tool_use', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          },
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:30Z',
            uuid: 'msg-002b',
            parentUuid: 'msg-002',
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-001',
                  content: 'Analysis complete. Found 1000 rows.'
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getAllByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const timelineItems = getAllByTestId('timeline-item');
      const messageWithTool = timelineItems[0];
      messageWithTool.click();

      // Assert
      const toolOutput = await findByTestId('tool-output');
      expect(toolOutput).toBeInTheDocument();
      expect(toolOutput).toHaveTextContent('Analysis complete. Found 1000 rows.');
    });

    it('should collapse tool details when clicked again', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, queryByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');

      // First click - expand
      messageWithTool.click();
      const toolDetailView = await findByTestId('tool-detail-view');
      expect(toolDetailView).toBeVisible();

      // Second click - collapse
      messageWithTool.click();

      // Assert
      await waitFor(() => {
        const collapsedView = queryByTestId('tool-detail-view');
        expect(collapsedView).not.toBeInTheDocument();
      });
    });

    it('should show error when tool_result contains error', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          },
          {
            type: 'user' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:30Z',
            uuid: 'msg-002b',
            parentUuid: 'msg-002',
            agentId: 'session-abc123',
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-001',
                  content: 'Error: File not found',
                  is_error: true
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getAllByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const timelineItems = getAllByTestId('timeline-item');
      const messageWithTool = timelineItems[0];
      messageWithTool.click();

      // Assert
      const toolOutput = await findByTestId('tool-output');
      expect(toolOutput).toHaveClass('tool-output-error');
      expect(toolOutput).toHaveTextContent('Error: File not found');
    });

    it('should support keyboard navigation for expand/collapse', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tool' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');

      // Simulate keyboard Enter
      messageWithTool.focus();
      fireEvent.keyDown(messageWithTool, { key: 'Enter' });

      // Assert
      await waitFor(() => {
        expect(messageWithTool).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should handle multiple tool_use blocks in the same message', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using multiple tools' },
                {
                  type: 'tool_use',
                  id: 'tool-001',
                  name: 'DataAnalyzer',
                  input: { file_path: '/data/input.csv' }
                },
                {
                  type: 'tool_use',
                  id: 'tool-002',
                  name: 'Visualizer',
                  input: { chart_type: 'bar' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findAllByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');
      messageWithTool.click();

      // Assert
      const toolDetailViews = await findAllByTestId('tool-detail-view');
      expect(toolDetailViews.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Task tool subagent_type display', () => {
    it('should display Task tool name with subagentType in brackets', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Creating a task' },
                {
                  type: 'tool_use',
                  id: 'task-001',
                  name: 'Task',
                  input: { subagent_type: 'test-writer', instruction: 'Write tests' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const toolNamesInline = getByTestId('tool-names-inline');

      // Assert
      expect(toolNamesInline).toHaveTextContent('Task [test-writer]');
    });

    it('should display Task without brackets when no subagentType', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Creating a task' },
                {
                  type: 'tool_use',
                  id: 'task-001',
                  name: 'Task',
                  input: { instruction: 'Do something' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const toolNamesInline = getByTestId('tool-names-inline');

      // Assert
      expect(toolNamesInline).toHaveTextContent('Task');
      expect(toolNamesInline).not.toHaveTextContent('[');
    });

    it('should not display brackets for non-Task tools', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Reading file' },
                {
                  type: 'tool_use',
                  id: 'read-001',
                  name: 'Read',
                  input: { file_path: '/test.ts' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const toolNamesInline = getByTestId('tool-names-inline');

      // Assert
      expect(toolNamesInline).toHaveTextContent('Read');
      expect(toolNamesInline).not.toHaveTextContent('[');
    });

    it('should display Task tool name with subagentType in expanded detail view', async () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Creating task' },
                {
                  type: 'tool_use',
                  id: 'task-001',
                  name: 'Task',
                  input: { subagent_type: 'codebase-analyzer', instruction: 'Analyze code' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId, findByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const messageWithTool = getByTestId('timeline-item');
      messageWithTool.click();

      // Assert
      const toolName = await findByTestId('tool-name');
      expect(toolName).toHaveTextContent('Task [codebase-analyzer]');
    });

    it('should handle multiple Task tools with different subagentTypes', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Running tasks' },
                {
                  type: 'tool_use',
                  id: 'task-001',
                  name: 'Task',
                  input: { subagent_type: 'analyzer', instruction: 'Analyze' }
                },
                {
                  type: 'tool_use',
                  id: 'task-002',
                  name: 'Task',
                  input: { subagent_type: 'formatter', instruction: 'Format' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const toolNamesInline = getByTestId('tool-names-inline');

      // Assert
      expect(toolNamesInline).toHaveTextContent('Task [analyzer], Task [formatter]');
    });

    it('should handle mixed Task and non-Task tools in same message', () => {
      // Arrange
      const mockTranscript = {
        id: 'test-transcript',
        session_id: 'session-abc123',
        content: '',
        messages: [
          {
            type: 'assistant' as const,
            sessionId: 'session-abc123',
            timestamp: '2026-02-01T05:00:05Z',
            uuid: 'msg-002',
            parentUuid: 'msg-001',
            agentId: 'session-abc123',
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text', text: 'Using tools' },
                {
                  type: 'tool_use',
                  id: 'read-001',
                  name: 'Read',
                  input: { file_path: '/test.ts' }
                },
                {
                  type: 'tool_use',
                  id: 'task-001',
                  name: 'Task',
                  input: { subagent_type: 'writer', instruction: 'Write code' }
                }
              ]
            }
          }
        ]
      };

      // Act
      const { getByTestId } = render(<TranscriptViewer transcript={mockTranscript} />);
      const toolNamesInline = getByTestId('tool-names-inline');

      // Assert
      expect(toolNamesInline).toHaveTextContent('Read, Task [writer]');
    });
  });
});
