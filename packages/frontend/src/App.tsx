import { useState, useEffect } from 'react';

interface TranscriptEntry {
  timestamp: string;
  role: string;
  content: string;
  subagent_id?: string;
}

function App() {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/transcript/main-transcript.jsonl')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.text();
      })
      .then((text) => {
        const entries = text
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        setTranscript(entries);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div data-testid="loading">Loading transcript...</div>;
  }

  if (error) {
    return <div data-testid="error">Error: {error}</div>;
  }

  return (
    <div className="app" data-testid="transcript-viewer">
      <h1>Claude Transcript Viewer</h1>
      <div className="transcript" data-testid="transcript-list">
        {transcript.map((entry, index) => (
          <div
            key={index}
            className={`entry ${entry.role}`}
            data-testid={`transcript-entry-${index}`}
          >
            <div className="meta">
              <span className="role">{entry.role}</span>
              <span className="timestamp">{entry.timestamp}</span>
            </div>
            <div className="content">{entry.content}</div>
            {entry.subagent_id && (
              <div className="subagent-link" data-testid="subagent-link">
                Subagent: {entry.subagent_id}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
