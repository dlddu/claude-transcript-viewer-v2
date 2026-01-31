import { useState, useEffect } from 'react';
import './App.css';

interface TranscriptMessage {
  type: string;
  content: string;
  timestamp?: string;
  subagent?: string;
  agent?: string;
  tool?: string;
}

interface Transcript {
  id: string;
  name: string;
  messages: TranscriptMessage[];
}

function App() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<string>('');
  const [currentTranscript, setCurrentTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Initialize available transcripts
    setTranscripts([
      { id: 'main-transcript', name: 'Main Transcript', messages: [] },
      { id: 'subagent-transcript', name: 'Subagent Transcript', messages: [] },
      { id: 'invalid-transcript', name: 'Invalid Transcript', messages: [] },
    ]);
  }, []);

  const loadTranscript = async (transcriptId: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/transcripts/${transcriptId}`);

      if (!response.ok) {
        throw new Error(`Failed to load transcript: ${response.statusText}`);
      }

      const data = await response.json();
      const transcript = transcripts.find(t => t.id === transcriptId);

      if (transcript) {
        setCurrentTranscript({
          ...transcript,
          messages: data.messages,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcript');
      setCurrentTranscript(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTranscriptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const transcriptId = e.target.value;
    setSelectedTranscript(transcriptId);

    if (transcriptId) {
      loadTranscript(transcriptId);
    } else {
      setCurrentTranscript(null);
    }
  };

  const getTranscriptTitle = () => {
    if (!currentTranscript) return '';
    return currentTranscript.name;
  };

  return (
    <div className="app">
      <nav className="navbar">
        <h1>Claude Transcript Viewer</h1>
      </nav>

      <div className="container">
        <div data-testid="transcript-viewer" className="transcript-viewer">
          <div className="controls">
            <label htmlFor="transcript-selector">Select Transcript:</label>
            <select
              id="transcript-selector"
              data-testid="transcript-selector"
              value={selectedTranscript}
              onChange={handleTranscriptChange}
            >
              <option value="">-- Select a transcript --</option>
              {transcripts.map(transcript => (
                <option key={transcript.id} value={transcript.id}>
                  {transcript.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div data-testid="error-message" className="error">
              {error}
            </div>
          )}

          {loading && (
            <div data-testid="loading-indicator" className="loading">
              Loading transcript...
            </div>
          )}

          {currentTranscript && !loading && (
            <div data-testid="transcript-content" className="transcript-content">
              <h2 data-testid="transcript-title">{getTranscriptTitle()}</h2>

              <div data-testid="transcript-list" className="message-list">
                {currentTranscript.messages.map((message, index) => (
                  <div
                    key={index}
                    data-testid={`message-${index}`}
                    className={`message message-${message.type}`}
                  >
                    <div data-testid="message-type" className="message-type">
                      {message.type}
                      {message.agent && ` (${message.agent})`}
                      {message.subagent && ` (${message.subagent})`}
                      {message.tool && ` - ${message.tool}`}
                    </div>
                    <div data-testid="message-content" className="message-content">
                      {message.content}
                    </div>
                    {message.timestamp && (
                      <div className="message-timestamp">
                        {new Date(message.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
