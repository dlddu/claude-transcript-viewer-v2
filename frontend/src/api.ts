import { TranscriptFile, TranscriptMessage } from './types';

export async function fetchTranscripts(): Promise<TranscriptFile[]> {
  const response = await fetch('/api/transcripts');
  if (!response.ok) {
    throw new Error('Failed to fetch transcripts');
  }
  const data = await response.json();
  return data.files;
}

export async function fetchTranscriptContent(key: string): Promise<TranscriptMessage[]> {
  const response = await fetch(`/api/transcripts/${key}`);
  if (!response.ok) {
    throw new Error('Failed to fetch transcript content');
  }
  const text = await response.text();
  const lines = text.trim().split('\n');
  return lines.map((line) => JSON.parse(line));
}
