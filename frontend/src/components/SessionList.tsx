import { useEffect, useMemo, useState } from 'react';
import type { SessionSummary } from '../types/transcript';
import { apiBaseUrl } from '../utils/loadTranscript';

export interface SessionListProps {
  // Opening a session reuses the app's session-lookup path (manifest → direct
  // browser-S3 download), so transcript bytes never transit the backend.
  onSessionLookup?: (sessionId: string) => void;
}

// Renders "YYYY-MM-DD HH:mm UTC" from an RFC3339 timestamp. Formatting in UTC
// (rather than toLocaleString) keeps the display stable across timezones and
// deterministic under test. Unparseable input falls back to the raw string.
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

// Reads {error} from a JSON error body, matching the backend's error shape and
// the fetchTranscriptManifest pattern; falls back to the status text.
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // Body was not JSON; use the fallback below.
  }
  return `${fallback}: ${response.statusText}`;
}

// SessionList loads every stored session (GET /api/transcripts, already
// newest-first from the backend), renders each as an openable row with its
// upload date, and offers client-side search plus retry-safe deletion. It is
// the third entry path into a transcript: browsing, rather than knowing an id.
export function SessionList({ onSessionLookup }: SessionListProps = {}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/transcripts`);
        if (!response.ok) {
          throw new Error(await errorMessage(response, 'Failed to load sessions'));
        }
        const data = (await response.json()) as SessionSummary[];
        if (!cancelled) {
          // Data and the loading flag settle together (React batches these), so
          // the list appears in a single render rather than flashing empty.
          setSessions(Array.isArray(data) ? data : []);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sessions');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side partial-match filter (case-insensitive). Small-scale operation
  // is assumed, so the already-loaded list is filtered in the browser.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sessions;
    }
    return sessions.filter((s) => s.session_id.toLowerCase().includes(query));
  }, [sessions, search]);

  const handleDelete = async (sessionId: string) => {
    // One deletion at a time keeps the confirm/row-removal flow unambiguous.
    if (deletingId) {
      return;
    }
    const confirmed = window.confirm(
      `Delete session "${sessionId}"? This removes its stored transcript and cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(sessionId);
    setDeleteError(undefined);
    try {
      const response = await fetch(
        `${apiBaseUrl()}/api/transcript/session/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(await errorMessage(response, 'Failed to delete session'));
      }
      // Success: drop the row. On failure the row stays so the delete — which is
      // retry-safe on the backend (objects → mapping) — can simply be retried.
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="session-list" data-testid="session-list">
        <div className="session-list__loading" data-testid="session-list-loading">
          Loading sessions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-list" data-testid="session-list">
        <div className="session-list__error" data-testid="session-list-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="session-list" data-testid="session-list">
      {sessions.length === 0 ? (
        <div className="session-list__empty" data-testid="session-list-empty">
          <p>No sessions stored yet.</p>
          <p className="session-list__hint">
            Upload a transcript, or use the Message UUID or Session ID tabs to open one.
          </p>
        </div>
      ) : (
        <>
          <input
            type="text"
            className="session-list__search"
            data-testid="session-search-input"
            placeholder="Search sessions by ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search sessions"
          />

          {deleteError && (
            <div className="session-list__error" data-testid="session-delete-error" role="alert">
              {deleteError}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="session-list__no-results" data-testid="session-list-no-results">
              No matching sessions.
            </div>
          ) : (
            <ul className="session-list__items">
              {filtered.map((session) => (
                <li
                  key={session.session_id}
                  className="session-list__item"
                  data-testid="session-list-item"
                >
                  <button
                    type="button"
                    className="session-list__open"
                    data-testid="session-open-button"
                    onClick={() => onSessionLookup?.(session.session_id)}
                  >
                    <span className="session-list__id">{session.session_id}</span>
                    <span className="session-list__date">{formatCreatedAt(session.created_at)}</span>
                  </button>
                  <button
                    type="button"
                    className="session-list__delete"
                    aria-label={`Delete ${session.session_id}`}
                    onClick={() => handleDelete(session.session_id)}
                    disabled={deletingId === session.session_id}
                  >
                    {deletingId === session.session_id ? 'Deleting...' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
