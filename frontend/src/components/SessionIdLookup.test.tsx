import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionIdLookup } from './SessionIdLookup.js';

describe('SessionIdLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render session ID input field', () => {
      render(<SessionIdLookup />);

      const input = screen.getByTestId('session-id-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should render lookup button', () => {
      render(<SessionIdLookup />);

      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toBeInTheDocument();
    });

    it('should display placeholder text in input field', () => {
      render(<SessionIdLookup />);

      const input = screen.getByTestId('session-id-input');
      expect(input).toHaveAttribute('placeholder', expect.stringMatching(/session.*id/i));
    });

    it('should display initial prompt message', () => {
      render(<SessionIdLookup />);

      expect(screen.getByText(/enter.*session.*id|search.*session/i)).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('should update input value when user types', async () => {
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;

      await user.type(input, 'session-abc123');

      expect(input.value).toBe('session-abc123');
    });

    it('should trigger lookup when button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, 'session-abc123');
      await user.click(button);

      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should trigger lookup when Enter key is pressed in input', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');

      await user.type(input, 'session-abc123');
      await user.keyboard('{Enter}');

      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should trim whitespace from session ID before lookup', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, '  session-abc123  ');
      await user.click(button);

      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });
  });

  describe('validation', () => {
    it('should disable button when session ID is empty', () => {
      render(<SessionIdLookup />);

      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toBeDisabled();
    });

    it('should enable button when session ID is entered', async () => {
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, 'session-abc123');

      expect(button).not.toBeDisabled();
    });

    it('should disable button when input is cleared', async () => {
      const user = userEvent.setup();
      render(<SessionIdLookup />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, 'session-abc123');
      expect(button).not.toBeDisabled();

      await user.clear(input);

      expect(button).toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('should display loading indicator when isLoading is true', () => {
      render(<SessionIdLookup isLoading={true} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should disable input and button during loading', () => {
      render(<SessionIdLookup isLoading={true} />);

      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');
      expect(input).toBeDisabled();
      expect(button).toBeDisabled();
    });

    it('should show loading text on button when loading', () => {
      render(<SessionIdLookup isLoading={true} />);

      const button = screen.getByTestId('session-id-lookup-button');
      expect(button).toHaveTextContent(/loading|searching/i);
    });
  });

  describe('error handling', () => {
    it('should display error message when error prop is provided', () => {
      const errorMessage = 'Session not found';

      render(<SessionIdLookup error={errorMessage} />);

      expect(screen.getByText(/session not found/i)).toBeInTheDocument();
    });

    it('should display generic error for network failures', () => {
      const errorMessage = 'Failed to fetch transcript';

      render(<SessionIdLookup error={errorMessage} />);

      expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
    });

    it('should allow retry after error by clearing error on new input', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(
        <SessionIdLookup onLookup={mockOnLookup} error="Session not found" />
      );

      expect(screen.getByText(/session not found/i)).toBeInTheDocument();

      rerender(<SessionIdLookup onLookup={mockOnLookup} error={undefined} />);
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');
      await user.type(input, 'session-xyz789');
      await user.click(button);

      expect(mockOnLookup).toHaveBeenCalledWith('session-xyz789');
      expect(screen.queryByText(/session not found/i)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible label for input field', () => {
      render(<SessionIdLookup />);

      const input = screen.getByTestId('session-id-input');
      expect(input).toHaveAccessibleName(/session.*id/i);
    });

    it('should associate error message with input using aria-describedby', () => {
      const errorMessage = 'Session not found';

      render(<SessionIdLookup error={errorMessage} />);

      const input = screen.getByTestId('session-id-input');
      const errorId = input.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      const errorElement = document.getElementById(errorId!);
      expect(errorElement).toHaveTextContent(/session not found/i);
    });

    it('should mark input as invalid when external error is provided', () => {
      const errorMessage = 'Session not found';

      render(<SessionIdLookup error={errorMessage} />);

      const input = screen.getByTestId('session-id-input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('integration with transcript display', () => {
    it('should clear input field after successful lookup', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, 'session-abc123');
      await user.click(button);

      rerender(<SessionIdLookup onLookup={mockOnLookup} clearOnSuccess={true} />);

      expect(input.value).toBe('');
    });

    it('should keep input value after failed lookup for retry', async () => {
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      const { rerender } = render(<SessionIdLookup onLookup={mockOnLookup} />);
      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      const button = screen.getByTestId('session-id-lookup-button');

      await user.type(input, 'session-invalid');
      await user.click(button);

      rerender(
        <SessionIdLookup onLookup={mockOnLookup} error="Session not found" />
      );

      expect(input.value).toBe('session-invalid');
    });
  });

  describe('URL parameter handling', () => {
    it('should auto-populate input from URL parameter on mount', () => {
      const sessionIdFromUrl = 'session-from-url';

      render(<SessionIdLookup initialSessionId={sessionIdFromUrl} />);

      const input = screen.getByTestId('session-id-input') as HTMLInputElement;
      expect(input.value).toBe(sessionIdFromUrl);
    });

    it('should auto-trigger lookup when initialSessionId is provided', async () => {
      const mockOnLookup = vi.fn();
      const sessionIdFromUrl = 'session-from-url';

      render(
        <SessionIdLookup
          initialSessionId={sessionIdFromUrl}
          onLookup={mockOnLookup}
          autoLookup={true}
        />
      );

      await waitFor(() => {
        expect(mockOnLookup).toHaveBeenCalledWith(sessionIdFromUrl);
      });
    });
  });
});
