import { useEffect, useState } from 'react';
import { TranscriptViewer, TranscriptViewerWithData } from './components/TranscriptViewer';
import { SessionIdLookup } from './components/SessionIdLookup.js';
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch transcript');
      }

      const data = await response.json();
      setTranscript(data);

      // Navigate to transcript view
      const transcriptPath = `/transcript/${data.id}`;
      window.history.pushState({}, '', transcriptPath);
      setRoute(transcriptPath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transcript';
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
            <SessionIdLookup
              onLookup={handleSessionLookup}
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
