import { useEffect, useState } from 'react';
import './App.css';
import { TranscriptViewer } from './components/TranscriptViewer';

function App() {
  const [bucket, setBucket] = useState<string | null>(null);
  const [transcriptKey, setTranscriptKey] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bucketParam = params.get('bucket');
    const keyParam = params.get('key');

    setBucket(bucketParam);
    setTranscriptKey(keyParam);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>Claude Transcript Viewer</h1>
      </header>

      {bucket && transcriptKey ? (
        <TranscriptViewer bucket={bucket} transcriptKey={transcriptKey} />
      ) : (
        <div>
          <p>Please provide bucket and key parameters in the URL:</p>
          <p>Example: /?bucket=my-bucket&key=transcripts/my-transcript.jsonl</p>
        </div>
      )}
    </div>
  );
}

export default App;
