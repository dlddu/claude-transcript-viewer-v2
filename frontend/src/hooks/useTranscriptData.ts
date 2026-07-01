import { useState, useEffect } from 'react';
import type { Transcript } from '../types/transcript';
import { loadTranscript } from '../utils/loadTranscript';

interface UseTranscriptDataResult {
  data: Transcript | null;
  isLoading: boolean;
  error: Error | null;
}

const cache = new Map<string, Transcript>();
const inflight = new Map<string, Promise<Transcript>>();

// Loads via the shared cache, deduplicating concurrent requests for the same
// session (e.g. StrictMode double-mounting) into one manifest+download run.
function getTranscript(transcriptId: string): Promise<Transcript> {
  const cached = cache.get(transcriptId);
  if (cached) {
    return Promise.resolve(cached);
  }

  let pending = inflight.get(transcriptId);
  if (!pending) {
    pending = loadTranscript(transcriptId)
      .then((transcript) => {
        cache.set(transcriptId, transcript);
        return transcript;
      })
      .finally(() => {
        inflight.delete(transcriptId);
      });
    inflight.set(transcriptId, pending);
  }
  return pending;
}

export function useTranscriptData(transcriptId: string): UseTranscriptDataResult {
  const [data, setData] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!transcriptId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getTranscript(transcriptId)
      .then((transcript) => {
        if (!cancelled) {
          setData(transcript);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [transcriptId]);

  return { data, isLoading, error };
}
