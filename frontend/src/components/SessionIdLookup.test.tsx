import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionIdLookup } from './SessionIdLookup.js';

describe('SessionIdLookup', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render session ID input field', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      const input = screen.getByTestId('session-id-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should render lookup button', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toBeInTheDocument();
    });

    it('should display placeholder text in input field', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      const input = screen.getByTestId('session-id-input');
      expect(input).toHaveAttribute('placeholder', expect.stringMatching(/session.*id/i));
    });

    it('should display initial prompt message', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      expect(screen.getByText(/enter.*session.*id|search.*session/i)).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('should update input value when user types', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;

      // Act
      await user.type(input, 'session-abc123');

      // Assert
      expect(input.value).toBe('session-abc123');
    });

    it('should trigger lookup when button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      // Act
      await user.type(input, 'session-abc123');
      await user.click(button);

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should trigger lookup when Enter key is pressed in input', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');

      // Act
      await user.type(input, 'session-abc123');
      await user.keyboard('{Enter}');

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should trim whitespace from session ID before lookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      // Act
      await user.type(input, '  session-abc123  ');
      await user.click(button);

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });
  });

  describe('validation', () => {
    it('should show validation error when session ID is empty', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const button = screen.getByTestId('session-id-lookup-button');

      // Act
      await user.click(button);

      // Assert
      await waitFor(() => {
        expect(
          screen.getByText(/please.*enter.*session.*id|session.*id.*required/i)
        ).toBeInTheDocument();
      });
    });

    it('should disable button when session ID is empty', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toBeDisabled();
    });

    it('should enable button when session ID is entered', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      // Act
      await user.type(input, 'session-abc123');

      // Assert
      expect(button).not.toBeDisabled();
    });

    it('should clear validation error when user starts typing', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      // Act - trigger validation error
      await user.click(button);
      await waitFor(() => {
        expect(screen.getByText(/session.*id.*required/i)).toBeInTheDocument();
      });

      // Act - start typing
      await user.type(input, 's');

      // Assert
      expect(screen.queryByText(/session.*id.*required/i)).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should display loading indicator when isLoading is true', () => {
      // Arrange & Act
      render(<SessionIdLookup isLoading={true} />);

      // Assert
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should disable input and button during loading', () => {
      // Arrange & Act
      render(<SessionIdLookup isLoading={true} />);

      // Assert
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');
      expect(input).toBeDisabled();
      expect(button).toBeDisabled();
    });

    it('should show loading text on button when loading', () => {
      // Arrange & Act
      render(<SessionIdLookup isLoading={true} />);

      // Assert
      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toHaveTextContent(/loading|searching/i);
    });
  });

  describe('error handling', () => {
    it('should display error message when error prop is provided', () => {
      // Arrange
      const errorMessage = 'Session not found';

      // Act
      render(<SessionIdLookup error={errorMessage} />);

      // Assert
      expect(screen.getByText(/session not found/i)).toBeInTheDocument();
    });

    it('should display generic error for network failures', () => {
      // Arrange
      const errorMessage = 'Failed to fetch transcript';

      // Act
      render(<SessionIdLookup error={errorMessage} />);

      // Assert
      expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
    });

    it('should allow retry after error by clearing error on new input', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(
        <SessionIdLookup onLookup={mockOnLookup} error="Session not found" />
      );

      // Assert - error is displayed
      expect(screen.getByText(/session not found/i)).toBeInTheDocument();

      // Act - clear error and try again
      rerender(<SessionIdLookup onLookup={mockOnLookup} error={undefined} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');
      await user.type(input, 'session-xyz789');
      await user.click(button);

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('session-xyz789');
      expect(screen.queryByText(/session not found/i)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible label for input field', () => {
      // Arrange & Act
      render(<SessionIdLookup />);

      // Assert
      const input = screen.getByTestId('session-id-input');
      expect(input).toHaveAccessibleName(/session.*id/i);
    });

    it('should associate error message with input using aria-describedby', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const button = screen.getByTestId('session-id-lookup-button');

      // Act - trigger validation error
      await user.click(button);

      // Assert
      await waitFor(() => {
        const input = screen.getByTestId('session-id-input');
        const errorId = input.getAttribute('aria-describedby');
        expect(errorId).toBeTruthy();
        const errorElement = document.getElementById(errorId!);
        expect(errorElement).toHaveTextContent(/session.*id.*required/i);
      });
    });

    it('should mark input as invalid when validation fails', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const button = screen.getByTestId('session-id-lookup-button');

      // Act
      await user.click(button);

      // Assert
      await waitFor(() => {
        const input = screen.getByTestId('session-id-input');
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });

  describe('integration with transcript display', () => {
    it('should clear input field after successful lookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      const button = screen.getByTestId('session-id-lookup-button');

      // Act - perform lookup
      await user.type(input, 'session-abc123');
      await user.click(button);

      // Simulate successful lookup by updating props
      rerender(<SessionIdLookup onLookup={mockOnLookup} clearOnSuccess={true} />);

      // Assert
      expect(input.value).toBe('');
    });

    it('should keep input value after failed lookup for retry', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      const button = screen.getByTestId('session-id-lookup-button');

      // Act - perform failed lookup
      await user.type(input, 'session-invalid');
      await user.click(button);

      // Simulate failed lookup
      rerender(
        <SessionIdLookup onLookup={mockOnLookup} error="Session not found" />
      );

      // Assert - input should retain value for easy correction
      expect(input.value).toBe('session-invalid');
    });
  });

  describe('URL parameter handling', () => {
    it('should auto-populate input from URL parameter on mount', () => {
      // Arrange
      const sessionIdFromUrl = 'session-from-url';

      // Act
      render(<SessionIdLookup initialSessionId={sessionIdFromUrl} />);

      // Assert
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      expect(input.value).toBe(sessionIdFromUrl);
    });

    it('should auto-trigger lookup when initialSessionId is provided', async () => {
      // Arrange
      const mockOnLookup = vi.fn();
      const sessionIdFromUrl = 'session-from-url';

      // Act
      render(
        <SessionIdLookup
          initialSessionId={sessionIdFromUrl}
          onLookup={mockOnLookup}
          autoLookup={true}
        />
      );

      // Assert
      await waitFor(() => {
        expect(mockOnLookup).toHaveBeenCalledWith(sessionIdFromUrl);
      });
    });
  });
});
