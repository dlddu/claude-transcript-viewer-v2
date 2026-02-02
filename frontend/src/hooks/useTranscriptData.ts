import { useState, useEffect, useRef } from 'react';
import type { Transcript, TranscriptMessage } from '../types/transcript';

interface UseTranscriptDataResult {
  data: Transcript | null;
  isLoading: boolean;
  error: Error | null;
}

interface UseTimelineDataResult {
  messages: TranscriptMessage[];
  isLoading: boolean;
  error: Error | null;
}

const cache = new Map<string, Transcript>();
const timelineCache = new Map<string, TranscriptMessage[]>();

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

export function useTimelineData(sessionId: string): UseTimelineDataResult {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (timelineCache.has(sessionId)) {
      setMessages(timelineCache.get(sessionId)!);
      setIsLoading(false);
      return;
    }

    // Prevent duplicate fetches
    if (hasFetched.current) {
      return;
    }

    hasFetched.current = true;

    const fetchTimeline = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/transcript/session/${sessionId}/timeline`);

        if (!response.ok) {
          throw new Error(`Failed to fetch timeline: ${response.statusText}`);
        }

        const data = await response.json();

        // Cache the result
        timelineCache.set(sessionId, data.messages);

        setMessages(data.messages);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeline();
  }, [sessionId]);

  return { messages, isLoading, error };
}
