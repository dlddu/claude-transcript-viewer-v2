import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TruncatedText } from './TruncatedText';

// Add type declaration for test clipboard mock
declare global {
  interface Window {
    __clipboardText?: string;
  }
}

describe('TruncatedText', () => {
  describe('rendering', () => {
    it('should render truncated text', () => {
      // Arrange & Act
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);

      // Assert
      expect(screen.getByText('toolu_01Pr...')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      // Arrange & Act
      const { container } = render(
        <TruncatedText text="test" truncatedText="test" className="custom-class" />
      );

      // Assert
      const element = container.querySelector('.custom-class');
      expect(element).toBeInTheDocument();
    });

    it('should render as a button element', () => {
      // Arrange & Act
      render(<TruncatedText text="test" truncatedText="test" />);

      // Assert
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('tooltip behavior', () => {
    beforeEach(() => {
      // Reset any document event listeners
      document.body.innerHTML = '';
    });

    afterEach(() => {
      // Cleanup tooltips
      const tooltips = document.querySelectorAll('[data-testid="truncated-text-tooltip"]');
      tooltips.forEach((tooltip) => tooltip.remove());
    });

    it('should show tooltip on click', async () => {
      // Arrange
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent('toolu_01PrABcDEfGHiJ');
      });
    });

    it('should hide tooltip when clicking outside', async () => {
      // Arrange
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      // Act - Show tooltip
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      // Act - Click outside
      fireEvent.click(document.body);

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });

    it('should hide tooltip when clicking button again', async () => {
      // Arrange
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      // Act - Show tooltip
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      // Act - Click button again
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });

    it('should position tooltip near the clicked element', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Mock getBoundingClientRect
      button.getBoundingClientRect = () => ({
        top: 100,
        left: 200,
        bottom: 120,
        right: 300,
        width: 100,
        height: 20,
        x: 200,
        y: 100,
        toJSON: () => {},
      });

      // Act
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        // Tooltip should have position styles
        expect(tooltip).toHaveStyle({ position: 'absolute' });
      });
    });
  });

  describe('copy functionality', () => {
    beforeEach(() => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: async (text: string) => {
            // Store the text for verification
            window.__clipboardText = text;
          },
        },
      });
    });

    afterEach(() => {
      delete window.__clipboardText;
    });

    it('should copy full text to clipboard when clicking copy button', async () => {
      // Arrange
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      // Act - Show tooltip
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      // Act - Click copy button
      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      // Assert
      await waitFor(() => {
        expect(window.__clipboardText).toBe('toolu_01PrABcDEfGHiJ');
      });
    });

    it('should show "Copied!" feedback after copying', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act - Show tooltip and copy
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      // Assert - Should show "Copied!" feedback
      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });
    });

    it('should reset "Copied!" feedback after a delay', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      // Assert - Initially shows "Copied!"
      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });

      // Assert - After delay, "Copied!" should disappear
      await waitFor(
        () => {
          expect(screen.queryByText(/copied/i)).not.toBeInTheDocument();
        },
        { timeout: 2500 }
      );
    });
  });

  describe('keyboard navigation', () => {
    it('should show tooltip on Enter key', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should show tooltip on Space key', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      button.focus();
      fireEvent.keyDown(button, { key: ' ', code: 'Space' });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should hide tooltip on Escape key', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act - Show tooltip
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      // Act - Press Escape
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      // Arrange & Act
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Assert
      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('should update aria-expanded when tooltip is shown', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should have descriptive aria-label', () => {
      // Arrange & Act
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      // Assert
      const ariaLabel = button.getAttribute('aria-label');
      expect(ariaLabel).toContain('Click to view full text');
    });

    it('should have tooltip with role="tooltip"', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toHaveAttribute('role', 'tooltip');
      });
    });
  });

  describe('mobile responsiveness', () => {
    it('should handle touch events on mobile', async () => {
      // Arrange
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act - Simulate touch
      fireEvent.touchStart(button);
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should position tooltip properly on small screens', async () => {
      // Arrange
      // Mock narrow viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);

      // Assert
      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        // Tooltip should not overflow screen
        const rect = tooltip.getBoundingClientRect();
        expect(rect.right).toBeLessThanOrEqual(375);
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing text gracefully', () => {
      // Arrange & Act
      render(<TruncatedText text="" truncatedText="" />);

      // Assert
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle clipboard API not available', async () => {
      // Arrange
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      // Act
      fireEvent.click(button);

      // Assert - Should still show tooltip even if clipboard not available
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      // Cleanup
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    });
  });
});
