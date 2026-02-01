import { useState, useEffect, useRef } from 'react';
import type { Transcript } from '../types/transcript';

interface UseTranscriptDataResult {
  data: Transcript | null;
  isLoading: boolean;
  error: Error | null;
}

const cache = new Map<string, Transcript>();

export function useTranscriptData(transcriptId: string): UseTranscriptDataResult {
  const [data, setData] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!transcriptId) {
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (cache.has(transcriptId)) {
      setData(cache.get(transcriptId)!);
      setIsLoading(false);
      return;
    }

    // Prevent duplicate fetches
    if (hasFetched.current) {
      return;
    }

    hasFetched.current = true;

    const fetchTranscript = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/transcripts/${transcriptId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch transcript: ${response.statusText}`);
        }

        const transcript = await response.json();

        // Cache the result
        cache.set(transcriptId, transcript);

        setData(transcript);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTranscript();
  }, [transcriptId]);

  return { data, isLoading, error };
}
