import { useEffect, useState } from 'react';
import { TranscriptViewer, TranscriptViewerWithData } from './components/TranscriptViewer';
import { SessionIdLookup } from './components/SessionIdLookup.js';
import type { Transcript, TranscriptMessage } from './types/transcript';
import './App.css';

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.pathname;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<TranscriptMessage[]>([]);

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
      setTimelineMessages([]);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      // Fetch timeline (merged transcripts)
      const timelineResponse = await fetch(`${apiUrl}/api/transcript/session/${sessionId}/timeline`);

      if (!timelineResponse.ok) {
        const errorData = await timelineResponse.json();
        throw new Error(errorData.error || 'Failed to fetch transcript');
      }

      const timelineData = await timelineResponse.json();
      setTimelineMessages(timelineData.messages);

      // Also fetch the original transcript for metadata
      const transcriptResponse = await fetch(`${apiUrl}/api/transcript/session/${sessionId}`);
      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json();
        setTranscript(transcriptData);
      }

      // Do not navigate to avoid re-fetching - display transcript on current page
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
            {(transcript || timelineMessages.length > 0) && (
              <TranscriptViewer
                transcript={transcript}
                viewMode="timeline"
                timelineMessages={timelineMessages}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
