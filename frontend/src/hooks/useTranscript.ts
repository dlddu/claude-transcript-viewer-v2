/**
 * Custom hook for fetching transcript data
 */

import { useState, useEffect } from 'react';
import { fetchTranscript } from '../api/transcript';
import type { TranscriptData } from '../types';

interface UseTranscriptResult {
  data: TranscriptData | null;
  isLoading: boolean;
  error: string | null;
}

export function useTranscript(transcriptId: string | null): UseTranscriptResult {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transcriptId) {
      setIsLoading(false);
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadTranscript = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchTranscript(transcriptId);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transcript');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadTranscript();

    return () => {
      cancelled = true;
    };
  }, [transcriptId]);

  return { data, isLoading, error };
}
