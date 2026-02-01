import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranscriptTimeline } from '../TranscriptTimeline';

/**
 * Frontend Unit Tests: Transcript Timeline Component
 *
 * Tests the main timeline component that displays transcript events
 */

describe('TranscriptTimeline', () => {
  const mockTranscriptData = {
    events: [
      {
        type: 'user_message',
        timestamp: '2026-02-01T10:00:00Z',
        content: 'Create a new feature',
      },
      {
        type: 'assistant_message',
        timestamp: '2026-02-01T10:00:05Z',
        content: 'I will help you with that',
      },
      {
        type: 'subagent_start',
        timestamp: '2026-02-01T10:00:15Z',
        subagent_name: 'test-writer',
        task: 'Write tests',
        transcript_id: 'subagent-123',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render timeline container', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    const timeline = screen.getByTestId('transcript-timeline');
    expect(timeline).toBeInTheDocument();
  });

  it('should display all main events in order', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    const mainEvents = screen.getAllByTestId('main-event');
    expect(mainEvents).toHaveLength(2); // user_message and assistant_message
  });

  it('should display user messages correctly', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    expect(screen.getByText('Create a new feature')).toBeInTheDocument();
  });

  it('should display assistant messages correctly', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    expect(screen.getByText('I will help you with that')).toBeInTheDocument();
  });

  it('should display subagent events with special styling', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    const subagentEvent = screen.getByTestId('subagent-event');
    expect(subagentEvent).toBeInTheDocument();
    expect(screen.getByText('test-writer')).toBeInTheDocument();
  });

  it('should expand subagent details when clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Act
    const subagentEvent = screen.getByTestId('subagent-event');
    await user.click(subagentEvent);

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('subagent-details')).toBeInTheDocument();
    });
  });

  it('should format timestamps correctly', () => {
    // Act
    render(<TranscriptTimeline events={mockTranscriptData.events} />);

    // Assert
    // Timestamps should be displayed in human-readable format
    expect(screen.getByText(/10:00:00/)).toBeInTheDocument();
  });

  it('should render empty state when no events provided', () => {
    // Act
    render(<TranscriptTimeline events={[]} />);

    // Assert
    expect(screen.getByText(/No events to display/i)).toBeInTheDocument();
  });

  it('should handle missing event properties gracefully', () => {
    // Arrange
    const incompleteEvent = {
      type: 'user_message',
      timestamp: '2026-02-01T10:00:00Z',
      // missing content
    };

    // Act & Assert - should not throw
    expect(() => {
      render(<TranscriptTimeline events={[incompleteEvent as any]} />);
    }).not.toThrow();
  });
});
