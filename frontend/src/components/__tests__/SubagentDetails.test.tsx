import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubagentDetails } from '../SubagentDetails';

/**
 * Frontend Unit Tests: Subagent Details Component
 *
 * Tests the component that displays expanded subagent transcript
 */

describe('SubagentDetails', () => {
  const mockSubagentData = {
    subagent_name: 'test-writer',
    transcript_id: 'subagent-123',
    events: [
      {
        type: 'subagent_init',
        timestamp: '2026-02-01T10:00:15Z',
        subagent_name: 'test-writer',
      },
      {
        type: 'assistant_message',
        timestamp: '2026-02-01T10:00:20Z',
        content: 'Creating tests...',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render subagent details container', () => {
    // Act
    render(<SubagentDetails {...mockSubagentData} />);

    // Assert
    const container = screen.getByTestId('subagent-details');
    expect(container).toBeInTheDocument();
  });

  it('should display subagent name', () => {
    // Act
    render(<SubagentDetails {...mockSubagentData} />);

    // Assert
    expect(screen.getByText('test-writer')).toBeInTheDocument();
  });

  it('should display all subagent events', () => {
    // Act
    render(<SubagentDetails {...mockSubagentData} />);

    // Assert
    expect(screen.getByText('Creating tests...')).toBeInTheDocument();
  });

  it('should show loading state while fetching subagent transcript', async () => {
    // Arrange
    const loadingProps = {
      ...mockSubagentData,
      events: undefined,
      isLoading: true,
    };

    // Act
    render(<SubagentDetails {...loadingProps} />);

    // Assert
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('should show error message when subagent transcript fails to load', () => {
    // Arrange
    const errorProps = {
      ...mockSubagentData,
      events: undefined,
      error: 'Failed to load subagent transcript',
    };

    // Act
    render(<SubagentDetails {...errorProps} />);

    // Assert
    expect(screen.getByTestId('error-message')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });
});
