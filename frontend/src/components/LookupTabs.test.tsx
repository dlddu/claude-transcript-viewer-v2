import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LookupTabs } from './LookupTabs.js';

// The Sessions tab renders SessionList, which fetches GET /api/transcripts on
// mount. Tests that open that tab install this stub so the list can settle.
function stubSessionListFetch(sessions: unknown[] = []) {
  const mock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => sessions,
  }));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('LookupTabs', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render "Message UUID" tab', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tab', { name: 'Message UUID' })).toBeInTheDocument();
    });

    it('should render "Session ID" tab', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tab', { name: 'Session ID' })).toBeInTheDocument();
    });

    it('should render "Sessions" tab', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument();
    });

    it('should render exactly three tabs', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
    });

    it('should render a tablist container', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should render a tabpanel', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
  });

  describe('default active tab', () => {
    it('should have "Message UUID" tab active by default (aria-selected="true")', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      const messageUuidTab = screen.getByRole('tab', { name: 'Message UUID' });
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should have "Session ID" tab inactive by default (aria-selected="false")', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      const sessionIdTab = screen.getByRole('tab', { name: 'Session ID' });
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should not show session-id-input when "Message UUID" tab is active by default', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.queryByTestId('session-id-input')).not.toBeInTheDocument();
    });
  });

  describe('tab switching', () => {
    it('should activate "Session ID" tab when clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);
      const sessionIdTab = screen.getByRole('tab', { name: 'Session ID' });

      // Act
      await user.click(sessionIdTab);

      // Assert
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should deactivate "Message UUID" tab when "Session ID" tab is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);
      const messageUuidTab = screen.getByRole('tab', { name: 'Message UUID' });
      const sessionIdTab = screen.getByRole('tab', { name: 'Session ID' });

      // Act
      await user.click(sessionIdTab);

      // Assert
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should show session-id-input when "Session ID" tab is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();
    });

    it('should show session-id-lookup-button when "Session ID" tab is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert
      expect(screen.getByTestId('session-id-lookup-button')).toBeInTheDocument();
    });

    it('should switch back to "Message UUID" tab when it is clicked after "Session ID"', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);
      const messageUuidTab = screen.getByRole('tab', { name: 'Message UUID' });
      const sessionIdTab = screen.getByRole('tab', { name: 'Session ID' });

      // Act
      await user.click(sessionIdTab);
      await user.click(messageUuidTab);

      // Assert
      expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');
      expect(sessionIdTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should hide session-id-input when switching back to "Message UUID" tab', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Message UUID' }));

      // Assert
      expect(screen.queryByTestId('session-id-input')).not.toBeInTheDocument();
    });
  });

  describe('Session ID panel content', () => {
    it('should render SessionIdLookup component when "Session ID" tab is active', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert - SessionIdLookup renders session-id-input as its primary element
      expect(screen.getByTestId('session-id-input')).toBeInTheDocument();
    });

    it('should pass onSessionLookup prop to SessionIdLookup as onLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockOnSessionLookup = vi.fn();
      render(<LookupTabs onSessionLookup={mockOnSessionLookup} />);

      // Act - switch to Session ID tab
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Enter a session ID and click lookup
      const input = screen.getByTestId('session-id-input');
      const button = screen.getByTestId('session-id-lookup-button');
      await user.type(input, 'session-abc123');
      await user.click(button);

      // Assert
      expect(mockOnSessionLookup).toHaveBeenCalledWith('session-abc123');
    });

    it('should pass isLoading prop to SessionIdLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs isLoading={true} />);

      // Act - switch to Session ID tab
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert - SessionIdLookup disables input when isLoading is true
      expect(screen.getByTestId('session-id-input')).toBeDisabled();
    });

    it('should pass error prop to SessionIdLookup', async () => {
      // Arrange
      const user = userEvent.setup();
      const errorMessage = 'Session not found';
      render(<LookupTabs error={errorMessage} />);

      // Act - switch to Session ID tab
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert - SessionIdLookup renders the error message
      expect(screen.getByText(/session not found/i)).toBeInTheDocument();
    });
  });

  describe('Sessions tab', () => {
    it('should have "Sessions" tab inactive by default and not show the session list', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
    });

    it('should activate the "Sessions" tab and render the session list when clicked', async () => {
      // Arrange
      stubSessionListFetch([]);
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Sessions' }));

      // Assert — wait for the list to finish loading (settled empty state) so
      // the stubbed fetch's state updates are flushed inside act().
      expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Message UUID' })).toHaveAttribute('aria-selected', 'false');
      expect(await screen.findByTestId('session-list-empty')).toBeInTheDocument();
      expect(screen.getByTestId('session-list')).toBeInTheDocument();
    });

    it('should pass onSessionLookup to SessionList so a row click opens a session', async () => {
      // Arrange
      stubSessionListFetch([{ session_id: 'session-xyz789', created_at: '2026-07-05T10:00:00Z' }]);
      const mockOnSessionLookup = vi.fn();
      const user = userEvent.setup();
      render(<LookupTabs onSessionLookup={mockOnSessionLookup} />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Sessions' }));
      await user.click(await screen.findByText('session-xyz789'));

      // Assert
      expect(mockOnSessionLookup).toHaveBeenCalledWith('session-xyz789');
    });

    it('should hide the session list when switching back to "Message UUID"', async () => {
      // Arrange
      stubSessionListFetch([]);
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act — wait for the list to settle before switching away, so the
      // stubbed fetch's state updates are flushed inside act().
      await user.click(screen.getByRole('tab', { name: 'Sessions' }));
      expect(await screen.findByTestId('session-list-empty')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Message UUID' }));

      // Assert
      expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('should render without any props (all props optional)', () => {
      // Arrange & Act & Assert
      expect(() => render(<LookupTabs />)).not.toThrow();
    });

    it('should accept onSessionLookup as an optional callback prop', () => {
      // Arrange
      const mockOnSessionLookup = vi.fn();

      // Act & Assert
      expect(() => render(<LookupTabs onSessionLookup={mockOnSessionLookup} />)).not.toThrow();
    });

    it('should accept isLoading as an optional boolean prop', () => {
      // Act & Assert
      expect(() => render(<LookupTabs isLoading={false} />)).not.toThrow();
    });

    it('should accept error as an optional string prop', () => {
      // Act & Assert
      expect(() => render(<LookupTabs error="some error" />)).not.toThrow();
    });
  });

  describe('accessibility', () => {
    it('should have role="tablist" on the tab container', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should have role="tab" on each tab button', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('role', 'tab');
      });
    });

    it('should have role="tabpanel" on the panel area', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should have aria-selected="true" only on the active tab', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert - only Message UUID tab is selected by default
      const tabs = screen.getAllByRole('tab');
      const selectedTabs = tabs.filter(
        (tab) => tab.getAttribute('aria-selected') === 'true'
      );
      expect(selectedTabs).toHaveLength(1);
      expect(selectedTabs[0]).toHaveAccessibleName('Message UUID');
    });

    it('should update aria-selected correctly after tab switch', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<LookupTabs />);

      // Act
      await user.click(screen.getByRole('tab', { name: 'Session ID' }));

      // Assert - exactly one tab should be selected
      const tabs = screen.getAllByRole('tab');
      const selectedTabs = tabs.filter(
        (tab) => tab.getAttribute('aria-selected') === 'true'
      );
      expect(selectedTabs).toHaveLength(1);
      expect(selectedTabs[0]).toHaveAccessibleName('Session ID');
    });

    it('should have accessible names for all three tabs', () => {
      // Arrange & Act
      render(<LookupTabs />);

      // Assert
      expect(screen.getByRole('tab', { name: 'Message UUID' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Session ID' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument();
    });
  });
});
