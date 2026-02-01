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
});
