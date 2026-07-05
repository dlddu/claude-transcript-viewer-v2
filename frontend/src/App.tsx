import { useEffect, useState } from 'react';
import { TranscriptViewer, TranscriptViewerWithData } from './components/TranscriptViewer';
import { LookupTabs } from './components/LookupTabs.js';
import { loadTranscript } from './utils/loadTranscript';
import type { Transcript } from './types/transcript';
import './App.css';

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.pathname;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  // Master-detail for the Sessions list: opening a session from the list (which
  // can hold hundreds of rows) replaces the list/tabs with a full-screen
  // transcript view, so there's no long scroll past the list to reach its
  // content — important on mobile. The identifier lookups (Message UUID /
  // Session ID) keep their inline display, where repeated lookups from the same
  // input are common and hiding it would get in the way.
  const [detailMode, setDetailMode] = useState(false);

  useEffect(() => {
    const handleNavigation = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  // Parse route: /transcript/:id
  const transcriptMatch = route.match(/^\/transcript\/([^/]+)$/);
  const transcriptId = transcriptMatch?.[1];

  // Fetches the presigned-URL manifest, then downloads and parses the transcript
  // files directly from S3 in the browser. `detail` selects the full-screen
  // master-detail view (Sessions list) over inline display (identifier lookups).
  const openSession = async (sessionId: string, detail: boolean) => {
    try {
      setIsLoading(true);
      setError(undefined);
      setTranscript(null);
      setDetailMode(detail);

      const data = await loadTranscript(sessionId);
      setTranscript(data);

      // Do not navigate to avoid re-fetching - display transcript on current page
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transcript not found';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionLookup = (sessionId: string) => openSession(sessionId, false);
  const handleSessionOpen = (sessionId: string) => openSession(sessionId, true);

  // Return from the full-screen transcript to the Sessions list. The lookup tabs
  // stay mounted (only hidden) while a session is open, so the Sessions tab is
  // still selected when we come back.
  const handleBackToList = () => {
    setTranscript(null);
    setError(undefined);
    setDetailMode(false);
  };

  return (
    <div className="app">
      <header>
        <h1>Claude Transcript Viewer</h1>
      </header>
      <main>
        {transcriptId ? (
          <TranscriptViewerWithData transcriptId={transcriptId} />
        ) : (
          <>
            <div hidden={detailMode}>
              <LookupTabs
                onSessionLookup={handleSessionLookup}
                onSessionOpen={handleSessionOpen}
                isLoading={isLoading}
                error={error}
              />
              {transcript && !detailMode && <TranscriptViewer transcript={transcript} />}
            </div>
            {detailMode && (
              <div className="session-detail">
                <button
                  type="button"
                  className="session-detail__back"
                  data-testid="session-detail-back"
                  onClick={handleBackToList}
                >
                  ← Back to list
                </button>
                {isLoading && <div className="session-detail__loading">Loading transcript...</div>}
                {error && (
                  <div className="session-detail__error" role="alert">
                    {error}
                  </div>
                )}
                {transcript && <TranscriptViewer transcript={transcript} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
