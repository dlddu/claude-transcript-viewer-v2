import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TruncatedText } from './TruncatedText';

declare global {
  interface Window {
    __clipboardText?: string;
  }
}

describe('TruncatedText', () => {
  describe('rendering', () => {
    it('should render truncated text', () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);

      expect(screen.getByText('toolu_01Pr...')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <TruncatedText text="test" truncatedText="test" className="custom-class" />
      );

      const element = container.querySelector('.custom-class');
      expect(element).toBeInTheDocument();
    });

    it('should render as a button element', () => {
      render(<TruncatedText text="test" truncatedText="test" />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('tooltip behavior', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    afterEach(() => {
      const tooltips = document.querySelectorAll('[data-testid="truncated-text-tooltip"]');
      tooltips.forEach((tooltip) => tooltip.remove());
    });

    it('should show tooltip on click', async () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent('toolu_01PrABcDEfGHiJ');
      });
    });

    it('should hide tooltip when clicking outside', async () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      fireEvent.click(document.body);

      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });

    it('should hide tooltip when clicking button again', async () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });

    it('should position tooltip near the clicked element', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

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

      fireEvent.click(button);

      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveStyle({ position: 'absolute' });
      });
    });
  });

  describe('copy functionality', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: {
          writeText: async (text: string) => {
            window.__clipboardText = text;
          },
        },
      });
    });

    afterEach(() => {
      delete window.__clipboardText;
    });

    it('should copy full text to clipboard when clicking copy button', async () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(window.__clipboardText).toBe('toolu_01PrABcDEfGHiJ');
      });
    });

    it('should show "Copied!" feedback after copying', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });
    });

    it('should reset "Copied!" feedback after a delay', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      const copyButton = screen.getByTestId('copy-button');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });

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
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      button.focus();
      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should show tooltip on Space key', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      button.focus();
      fireEvent.keyDown(button, { key: ' ', code: 'Space' });

      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should hide tooltip on Escape key', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('truncated-text-tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('should update aria-expanded when tooltip is shown', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should have descriptive aria-label', () => {
      render(<TruncatedText text="toolu_01PrABcDEfGHiJ" truncatedText="toolu_01Pr..." />);
      const button = screen.getByRole('button');

      const ariaLabel = button.getAttribute('aria-label');
      expect(ariaLabel).toContain('Click to view full text');
    });

    it('should have tooltip with role="tooltip"', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toHaveAttribute('role', 'tooltip');
      });
    });
  });

  describe('mobile responsiveness', () => {
    it('should handle touch events on mobile', async () => {
      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.touchStart(button);
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });
    });

    it('should position tooltip properly on small screens', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        const tooltip = screen.getByTestId('truncated-text-tooltip');
        expect(tooltip).toBeInTheDocument();
        const rect = tooltip.getBoundingClientRect();
        expect(rect.right).toBeLessThanOrEqual(375);
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing text gracefully', () => {
      render(<TruncatedText text="" truncatedText="" />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle clipboard API not available', async () => {
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(<TruncatedText text="test text" truncatedText="test..." />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('truncated-text-tooltip')).toBeInTheDocument();
      });

      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    });
  });
});
