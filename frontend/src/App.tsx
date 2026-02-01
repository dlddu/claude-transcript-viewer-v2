import { useEffect, useState } from 'react';
import { TranscriptViewer, TranscriptViewerWithData } from './components/TranscriptViewer';
import './App.css';

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.pathname;
  });

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

  return (
    <div className="app">
      <header>
        <h1>Claude Transcript Viewer</h1>
      </header>
      <main>
        {transcriptId ? (
          <TranscriptViewerWithData transcriptId={transcriptId} />
        ) : (
          <TranscriptViewer />
        )}
      </main>
    </div>
  );
}

export default App;
