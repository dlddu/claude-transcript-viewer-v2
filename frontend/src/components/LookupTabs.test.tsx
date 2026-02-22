import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LookupTabs } from './LookupTabs.js';

describe('LookupTabs', () => {
  const defaultProps = {
    onLookup: vi.fn(),
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render a tablist container', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();
    });

    it('should render exactly two tabs', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
    });

    it('should render "Message UUID" tab first', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveTextContent('Message UUID');
    });

    it('should render "Session ID" tab second', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      expect(tabs[1]).toHaveTextContent('Session ID');
    });
  });

  describe('default active tab', () => {
    it('should activate "Message UUID" tab by default', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should mark "Session ID" tab as inactive by default', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should not render session-id-input when "Message UUID" tab is active by default', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      expect(screen.queryByTestId('session-id-input')).not.toBeInTheDocument();
    });
  });

  describe('tab switching - activating "Session ID" tab', () => {
    it('should mark "Session ID" tab as active after click', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should mark "Message UUID" tab as inactive after clicking "Session ID"', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should display SessionIdLookup component after clicking "Session ID" tab', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();
    });
  });

  describe('tab switching - returning to "Message UUID" tab', () => {
    it('should mark "Message UUID" tab as active after switching back', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });

      // Act - switch to Session ID, then back to Message UUID
      await user.click(sessionIdTab);
      await user.click(messageUuidTab);

      // Assert
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should mark "Session ID" tab as inactive after switching back to "Message UUID"', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });

      // Act
      await user.click(sessionIdTab);
      await user.click(messageUuidTab);

      // Assert
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should hide session-id-input after switching back to "Message UUID" tab', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });

      // Act - show SessionIdLookup, then hide it
      await user.click(sessionIdTab);
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();
      await user.click(messageUuidTab);

      // Assert
      expect(screen.queryByTestId('session-id-input')).not.toBeInTheDocument();
    });
  });

  describe('SessionIdLookup integration', () => {
    it('should pass onLookup prop through to SessionIdLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnLookup = vi.fn();
      render(<LookupTabs onLookup={mockOnLookup} isLoading={false} error={null} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act - switch to Session ID tab
      await user.click(sessionIdTab);

      // Type a session ID and trigger lookup
      const input = screen.getByTestId('session-id-input');
      const lookupButton = screen.getByTestId('session-id-lookup-button');
      await user.type(input, 'session-abc123');
      await user.click(lookupButton);

      // Assert
      expect(mockOnLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should pass isLoading prop through to SessionIdLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs onLookup={vi.fn()} isLoading={true} error={null} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert - input should be disabled when loading
      const input = screen.getByTestId('session-id-input');
      expect(input).toBeDisabled();
    });

    it('should pass error prop through to SessionIdLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const errorMessage = 'Session not found';
      render(<LookupTabs onLookup={vi.fn()} isLoading={false} error={errorMessage} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert - error message should be visible in SessionIdLookup
      expect(screen.getByText(/session not found/i)).toBeInTheDocument();
    });

    it('should render SessionIdLookup with null error without crashing', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs onLookup={vi.fn()} isLoading={false} error={null} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });

      // Act
      await user.click(sessionIdTab);

      // Assert
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Message UUID tab content', () => {
    it('should display content related to Message UUID when that tab is active', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert - Message UUID tab panel content should be present
      expect(screen.queryByTestId('session-id-input')).not.toBeInTheDocument();
    });
  });

  describe('aria attributes', () => {
    it('should set aria-selected="true" on the active tab', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      const selectedTabs = tabs.filter(
        (tab) => tab.getAttribute('aria-selected') === 'true'
      );
      expect(selectedTabs).toHaveLength(1);
    });

    it('should set aria-selected="false" on the inactive tab', () => {
      // Arrange & Act
      render(<LookupTabs {...defaultProps} />);

      // Assert
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should update aria-selected on both tabs when switching', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs {...defaultProps} />);
      const sessionIdTab = screen.getByRole('tab', { name: /session id/i });
      const messageUuidTab = screen.getByRole('tab', { name: /message uuid/i });

      // Act
      await user.click(sessionIdTab);

      // Assert - exactly one tab selected at all times
      const tabs = screen.getAllByRole('tab');
      const selectedTabs = tabs.filter(
        (tab) => tab.getAttribute('aria-selected') === 'true'
      );
      expect(selectedTabs).toHaveLength(1);
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'true');
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'false');
    });
  });
});
