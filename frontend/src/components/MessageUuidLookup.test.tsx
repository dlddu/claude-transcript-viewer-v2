import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageUuidLookup } from './MessageUuidLookup.js';

describe('MessageUuidLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render a textarea for input', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render the "Extract & Search" button', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search/i })).toBeInTheDocument();
    });

    it('should render textarea with a descriptive placeholder', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('placeholder');
      expect(textarea.getAttribute('placeholder')!.length).toBeGreaterThan(0);
    });

    it('should not show extracted UUID badge on initial render', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.queryByTestId('extracted-uuid-badge')).not.toBeInTheDocument();
    });

    it('should not show error message on initial render', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('button disabled state', () => {
    it('should disable the button when textarea is empty', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search/i })).toBeDisabled();
    });

    it('should enable the button when textarea has content', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'some text');

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search/i })).not.toBeDisabled();
    });

    it('should disable the button again when textarea is cleared', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'some text');
      await user.clear(textarea);

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search/i })).toBeDisabled();
    });

    it('should treat whitespace-only input as empty and keep button disabled', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, '   ');

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search/i })).toBeDisabled();
    });
  });

  describe('UUID extraction on button click', () => {
    it('should display extracted UUID badge when UUID is found after button click', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'message id: 550e8400-e29b-41d4-a716-446655440000');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(screen.getByTestId('extracted-uuid-badge')).toBeInTheDocument();
    });

    it('should display the extracted UUID text inside the badge', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'id: 550e8400-e29b-41d4-a716-446655440000');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      const badge = screen.getByTestId('extracted-uuid-badge');
      expect(badge).toHaveTextContent('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should call onLookup with the extracted UUID when button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'id: 550e8400-e29b-41d4-a716-446655440000');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(mockOnLookup).toHaveBeenCalledTimes(1);
      expect(mockOnLookup).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should call onLookup with lowercase UUID even when UUID in text is uppercase', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'UUID: 550E8400-E29B-41D4-A716-446655440000');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should use the first UUID found when multiple UUIDs are present', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(
        textarea,
        'first: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa second: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      );
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });

    it('should not call onLookup when no UUID is found', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'no uuid here');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(mockOnLookup).not.toHaveBeenCalled();
    });
  });

  describe('"No UUID found" error display', () => {
    it('should show "No UUID found" error when button is clicked and no UUID is in the text', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'no uuid here');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(screen.getByText(/no uuid found/i)).toBeInTheDocument();
    });

    it('should clear the "No UUID found" error when user starts typing again', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act — trigger error
      await user.type(textarea, 'no uuid here');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));
      expect(screen.getByText(/no uuid found/i)).toBeInTheDocument();

      // Act — type more to clear error
      await user.type(textarea, ' more text');

      // Assert
      expect(screen.queryByText(/no uuid found/i)).not.toBeInTheDocument();
    });

    it('should not show "No UUID found" error on initial render', () => {
      // Arrange & Act
      render(<MessageUuidLookup />);

      // Assert
      expect(screen.queryByText(/no uuid found/i)).not.toBeInTheDocument();
    });

    it('should not show extracted UUID badge when no UUID is found', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.type(textarea, 'no uuid here');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Assert
      expect(screen.queryByTestId('extracted-uuid-badge')).not.toBeInTheDocument();
    });
  });

  describe('Ctrl+Enter keyboard shortcut', () => {
    it('should trigger extraction when Ctrl+Enter is pressed in the textarea', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.click(textarea);
      await user.type(textarea, 'id: 550e8400-e29b-41d4-a716-446655440000');
      await user.keyboard('{Control>}{Enter}{/Control}');

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should not trigger extraction on plain Enter (without Ctrl)', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<MessageUuidLookup onLookup={mockOnLookup} />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.click(textarea);
      // Type text without Enter so the button is enabled, then press bare Enter
      await user.type(textarea, 'id: 550e8400-e29b-41d4-a716-446655440000');
      await user.keyboard('{Enter}');

      // Assert — bare Enter should NOT trigger lookup
      expect(mockOnLookup).not.toHaveBeenCalled();
    });

    it('should show "No UUID found" error on Ctrl+Enter when text has no UUID', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act
      await user.click(textarea);
      await user.type(textarea, 'no uuid here');
      await user.keyboard('{Control>}{Enter}{/Control}');

      // Assert
      expect(screen.getByText(/no uuid found/i)).toBeInTheDocument();
    });
  });

  describe('isLoading state', () => {
    it('should show a loading indicator when isLoading is true', () => {
      // Arrange & Act
      render(<MessageUuidLookup isLoading={true} />);

      // Assert
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should disable the button when isLoading is true', () => {
      // Arrange & Act
      render(<MessageUuidLookup isLoading={true} />);

      // Assert
      expect(screen.getByRole('button', { name: /extract.*search|searching/i })).toBeDisabled();
    });

    it('should not show loading indicator when isLoading is false', () => {
      // Arrange & Act
      render(<MessageUuidLookup isLoading={false} />);

      // Assert — allow absence of text matching "loading" outside the button label
      const loadingTexts = screen.queryAllByText(/loading/i);
      // The button itself may say "Extract & Search", so no loading indicator div
      expect(loadingTexts.filter(el => el.tagName !== 'BUTTON')).toHaveLength(0);
    });
  });

  describe('error prop display', () => {
    it('should display the error message passed via error prop', () => {
      // Arrange
      const errorMessage = 'Transcript not found';

      // Act
      render(<MessageUuidLookup error={errorMessage} />);

      // Assert
      expect(screen.getByText(/transcript not found/i)).toBeInTheDocument();
    });

    it('should display error prop alongside extracted UUID badge when both are present', async () => {
      // Arrange
      const user = userEvent.setup();
      const errorMessage = 'Server error';
      const { rerender } = render(<MessageUuidLookup />);
      const textarea = screen.getByRole('textbox');

      // Act — extract a UUID first
      await user.type(textarea, 'id: 550e8400-e29b-41d4-a716-446655440000');
      await user.click(screen.getByRole('button', { name: /extract.*search/i }));

      // Then simulate an external error from the parent
      rerender(<MessageUuidLookup error={errorMessage} />);

      // Assert
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });

    it('should not display an error area when error prop is undefined', () => {
      // Arrange & Act
      render(<MessageUuidLookup error={undefined} />);

      // Assert — no role="alert" from the error prop
      const alerts = screen.queryAllByRole('alert');
      expect(alerts).toHaveLength(0);
    });
  });

  describe('props are optional', () => {
    it('should render without any props', () => {
      // Arrange & Act & Assert
      expect(() => render(<MessageUuidLookup />)).not.toThrow();
    });

    it('should accept onLookup as an optional callback prop', () => {
      // Arrange
      const mockOnLookup = vi.fn();

      // Act & Assert
      expect(() => render(<MessageUuidLookup onLookup={mockOnLookup} />)).not.toThrow();
    });

    it('should accept isLoading as an optional boolean prop', () => {
      // Act & Assert
      expect(() => render(<MessageUuidLookup isLoading={false} />)).not.toThrow();
    });

    it('should accept error as an optional string prop', () => {
      // Act & Assert
      expect(() => render(<MessageUuidLookup error="some error" />)).not.toThrow();
    });
  });
});
