import { useEffect, useState } from 'react';
import { TranscriptViewer, TranscriptViewerWithData } from './components/TranscriptViewer';
import { LookupTabs } from './components/LookupTabs.js';
import type { Transcript } from './types/transcript';
import './App.css';

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.pathname;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<Transcript | null>(null);

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

  const handleSessionLookup = async (sessionId: string) => {
    try {
      setIsLoading(true);
      setError(undefined);
      setTranscript(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/transcript/session/${sessionId}`);

      if (!response.ok) {
        let errorMessage = `Transcript not found for session: ${sessionId}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // JSON parsing failed, use default error message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setTranscript(data);

      // Do not navigate to avoid re-fetching - display transcript on current page
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transcript not found';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
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
            <LookupTabs
              onSessionLookup={handleSessionLookup}
              isLoading={isLoading}
              error={error}
            />
            {transcript && <TranscriptViewer transcript={transcript} />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
