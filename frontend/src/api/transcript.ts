/**
 * Transcript API Client
 */

import type { TranscriptData } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function fetchTranscript(transcriptId: string): Promise<TranscriptData> {
  const response = await fetch(`${API_BASE_URL}/api/transcript/${transcriptId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Transcript not found');
    }
    throw new Error(`Failed to fetch transcript: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchSubagentTranscript(
  transcriptId: string,
  subagentId: string
): Promise<TranscriptData> {
  const response = await fetch(
    `${API_BASE_URL}/api/transcript/${transcriptId}/subagent/${subagentId}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Subagent transcript not found');
    }
    throw new Error(`Failed to fetch subagent transcript: ${response.statusText}`);
  }

  return response.json();
}
