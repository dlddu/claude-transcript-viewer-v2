import { useState, useEffect, useRef } from 'react';

export interface SessionIdLookupProps {
  onLookup?: (sessionId: string) => void;
  isLoading?: boolean;
  error?: string;
  initialSessionId?: string;
  autoLookup?: boolean;
  clearOnSuccess?: boolean;
}

export function SessionIdLookup({
  onLookup,
  isLoading = false,
  error,
  initialSessionId = '',
  autoLookup = false,
  clearOnSuccess = false,
}: SessionIdLookupProps = {}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [validationError, setValidationError] = useState('');
  const hasAutoLookup = useRef(false);

  useEffect(() => {
    if (initialSessionId && autoLookup && !hasAutoLookup.current) {
      hasAutoLookup.current = true;
      if (onLookup) {
        onLookup(initialSessionId.trim());
      }
    }
  }, [initialSessionId, autoLookup, onLookup]);

  useEffect(() => {
    if (clearOnSuccess) {
      setSessionId('');
    }
  }, [clearOnSuccess]);

  const handleLookup = () => {
    const trimmedSessionId = sessionId.trim();

    if (!trimmedSessionId) {
      setValidationError('Please enter a session ID');
      return;
    }

    setValidationError('');

    if (onLookup) {
      onLookup(trimmedSessionId);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSessionId(e.target.value);
    if (validationError) {
      setValidationError('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmedSessionId = sessionId.trim();
      if (trimmedSessionId) {
        handleLookup();
      }
    }
  };

  const isButtonDisabled = isLoading || !sessionId.trim();
  const displayError = error || validationError;
  const errorId = displayError ? 'session-id-error' : undefined;

  return (
    <div className="session-id-lookup">
      <div className="session-id-prompt">
        <p>Enter a session ID to search for transcripts</p>
      </div>

      <div className="session-id-input-group">
        <input
          type="text"
          data-testid="session-id-input"
          placeholder="Enter Session ID..."
          value={sessionId}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-label="Session ID"
          aria-invalid={!!displayError}
          aria-describedby={errorId}
        />
        <button
          data-testid="session-id-lookup-button"
          onClick={handleLookup}
          disabled={isButtonDisabled}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {isLoading && (
        <div className="session-id-loading">
          Loading transcript...
        </div>
      )}

      {displayError && (
        <div
          id={errorId}
          className="session-id-error"
          role="alert"
        >
          {displayError}
        </div>
      )}
    </div>
  );
}
