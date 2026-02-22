import { useState } from 'react';
import { parseFirstUuid } from '../utils/parseUuid.js';

export interface MessageUuidLookupProps {
  onLookup?: (uuid: string) => void;
  isLoading?: boolean;
  error?: string;
}

export function MessageUuidLookup({
  onLookup,
  isLoading = false,
  error,
}: MessageUuidLookupProps = {}) {
  const [text, setText] = useState('');
  const [extractedUuid, setExtractedUuid] = useState<string | null>(null);
  const [noUuidError, setNoUuidError] = useState(false);

  const handleExtract = () => {
    const uuid = parseFirstUuid(text);

    if (uuid) {
      setExtractedUuid(uuid);
      setNoUuidError(false);
      if (onLookup) {
        onLookup(uuid);
      }
    } else {
      setExtractedUuid(null);
      setNoUuidError(true);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Clear local error/badge state when user starts typing
    if (noUuidError) {
      setNoUuidError(false);
    }
    if (extractedUuid) {
      setExtractedUuid(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      if (text.trim()) {
        handleExtract();
      }
    }
  };

  const isButtonDisabled = isLoading || !text.trim();

  return (
    <div className="message-uuid-lookup">
      <div className="message-uuid-prompt">
        <p>Paste message text or log output to extract and search by UUID</p>
      </div>

      <div className="message-uuid-input-group">
        <textarea
          placeholder="Paste text containing a UUID (e.g. message log, error output)..."
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-label="Message text"
          rows={4}
        />
        <button
          onClick={handleExtract}
          disabled={isButtonDisabled}
        >
          {isLoading ? 'Searching...' : 'Extract & Search'}
        </button>
      </div>

      {isLoading && (
        <div className="message-uuid-loading">
          Loading transcript...
        </div>
      )}

      {extractedUuid && (
        <div
          data-testid="extracted-uuid-badge"
          className="message-uuid-badge"
        >
          {extractedUuid}
        </div>
      )}

      {noUuidError && (
        <div className="message-uuid-no-result">
          No UUID found
        </div>
      )}

      {error && (
        <div
          className="message-uuid-error"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
