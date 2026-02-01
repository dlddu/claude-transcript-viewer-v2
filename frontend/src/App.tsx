/**
 * Main App Component
 */

import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { TranscriptTimeline } from './components/TranscriptTimeline';
import { useTranscript } from './hooks/useTranscript';

function TranscriptPage() {
  const { transcriptId } = useParams<{ transcriptId: string }>();
  const { data, isLoading, error } = useTranscript(transcriptId || null);

  if (isLoading) {
    return (
      <div data-testid="loading-indicator" className="loading-container">
        Loading transcript...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="error-message" className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="transcript-page">
      <h1>Transcript Viewer</h1>
      <TranscriptTimeline events={data.events} />
    </div>
  );
}

function HomePage() {
  return (
    <div className="home-page">
      <h1>Claude Transcript Viewer</h1>
      <p>Enter a transcript ID in the URL: /transcript/[id]</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/transcript/:transcriptId" element={<TranscriptPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
