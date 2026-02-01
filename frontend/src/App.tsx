import React, { useState, useEffect } from 'react';
import { TranscriptList } from './components/TranscriptList';
import { TranscriptViewer } from './components/TranscriptViewer';
import { fetchTranscripts, fetchTranscriptContent } from './api';
import { TranscriptFile, TranscriptMessage } from './types';

function App() {
  const [files, setFiles] = useState<TranscriptFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TranscriptFile | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      setLoading(true);
      setError(null);
      const transcripts = await fetchTranscripts();
      setFiles(transcripts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcripts');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (file: TranscriptFile) => {
    try {
      setLoadingContent(true);
      setSelectedFile(file);
      const content = await fetchTranscriptContent(file.key);
      setMessages(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcript content');
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>Claude Transcript Viewer</h1>
      <p>Transcript viewer with S3 integration</p>

      {loading && <div data-testid="loading-indicator">Loading transcripts...</div>}
      {error && <div data-testid="error-message" style={{ color: 'red' }}>Error: {error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
          <div>
            <h2>Transcripts</h2>
            <TranscriptList files={files} onSelect={handleSelectFile} />
          </div>

          <div>
            {loadingContent && <div>Loading transcript content...</div>}
            {selectedFile && !loadingContent && messages.length > 0 && (
              <TranscriptViewer messages={messages} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
