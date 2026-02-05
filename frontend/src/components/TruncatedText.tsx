import { useState, useEffect, useRef } from 'react';

interface TruncatedTextProps {
  text: string;
  truncatedText: string;
  className?: string;
}

export function TruncatedText({ text, truncatedText, className = '' }: TruncatedTextProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const toggleTooltip = () => {
    if (!isTooltipVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
    }
    setIsTooltipVisible(!isTooltipVisible);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTooltip();
    }
  };

  useEffect(() => {
    if (!isTooltipVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        tooltipRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsTooltipVisible(false);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTooltipVisible(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isTooltipVisible]);

  // Position tooltip properly on small screens
  useEffect(() => {
    if (isTooltipVisible && tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // If tooltip overflows right edge, adjust position
      if (tooltipRect.right > viewportWidth) {
        setTooltipPosition((prev) => ({
          ...prev,
          left: Math.max(0, prev.left - (tooltipRect.right - viewportWidth + 10)),
        }));
      }
    }
  }, [isTooltipVisible]);

  const combinedClassName = `truncated-text ${className}`.trim();

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <button
        ref={buttonRef}
        className={combinedClassName}
        onClick={toggleTooltip}
        onKeyDown={handleKeyDown}
        aria-label="Click to view full text"
        aria-expanded={isTooltipVisible}
      >
        {truncatedText}
      </button>

      {isTooltipVisible && (
        <div
          ref={tooltipRef}
          className="truncated-text-tooltip"
          data-testid="truncated-text-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-text">{text}</div>
            <button
              className="copy-button"
              data-testid="copy-button"
              onClick={handleCopy}
            >
              Copy
            </button>
          </div>
          {copied && (
            <div className="copied-feedback">Copied!</div>
          )}
        </div>
      )}
    </span>
  );
}
