import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTranscriptData } from './useTranscriptData';
import type { TranscriptFilesResponse } from '../types/transcript';

function manifestFor(sessionId: string): TranscriptFilesResponse {
  return {
    session_id: sessionId,
    expires_in: 300,
    main: {
      id: sessionId,
      name: `${sessionId}.jsonl`,
      key: `year=2026/month=05/day=24/hour=00/session_id=${sessionId}/${sessionId}.jsonl`,
      url: `https://s3.example.com/test-transcripts/${sessionId}.jsonl?X-Amz-Signature=fake`,
    },
    subagents: [],
  };
}

const MAIN_JSONL = [
  '{"type":"user","sessionId":"%ID%","timestamp":"2026-02-01T05:00:00Z","uuid":"msg-001","parentUuid":null,"message":{"role":"user","content":"Hello"}}',
  '{"type":"assistant","sessionId":"%ID%","timestamp":"2026-02-01T05:00:05Z","uuid":"msg-002","parentUuid":"msg-001","message":{"role":"assistant","content":"Hi"}}',
].join('\n');

// Routes manifest requests to the API mock and presigned URLs to file bodies.
function mockTranscriptFetch(sessionId: string) {
  const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/transcript/session/')) {
      return {
        ok: true,
        status: 200,
        json: async () => manifestFor(sessionId),
      } as Response;
    }
    if (url.includes('X-Amz-Signature')) {
      return {
        ok: true,
        status: 200,
        text: async () => MAIN_JSONL.split('%ID%').join(sessionId),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

describe('useTranscriptData', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('data fetching', () => {
    it('should fetch the manifest and download transcript files from S3', async () => {
      // Arrange
      const mockFetch = mockTranscriptFetch('test-1');

      // Act
      const { result } = renderHook(() => useTranscriptData('test-1'));

      // Assert
      await waitFor(() => {
        expect(result.current.data).toBeDefined();
        expect(result.current.data).not.toBeNull();
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/transcript/session/test-1')
      );
      // The transcript bytes come straight from the presigned S3 URL.
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('X-Amz-Signature'));
      expect(result.current.data?.session_id).toBe('test-1');
      expect(result.current.data?.messages).toHaveLength(2);
    });

    it('should return loading state initially', async () => {
      // Arrange - use a delayed promise to ensure we can check loading state
      let resolvePromise: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolvePromise = resolve;
        });
      });
      global.fetch = mockFetch;

      // Act
      const { result } = renderHook(() => useTranscriptData('test-2'));

      // Assert - check initial loading state
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();

      // Cleanup - resolve as a not-found manifest so the load settles
      await act(async () => {
        resolvePromise!({
          ok: false,
          status: 404,
          json: async () => ({ error: 'Session transcript not found' }),
        });
      });
    });

    it('should handle fetch errors gracefully', async () => {
      // Arrange
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      // Act
      const { result } = renderHook(() => useTranscriptData('test-error'));

      // Assert
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.error).toBeDefined();
      expect(result.current.error).toBeInstanceOf(Error);
      if (result.current.error) {
        expect(result.current.error.message).toContain('Network error');
      }
    });

    it('should surface the backend error message on a not-found session', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Session transcript not found' }),
      });
      global.fetch = mockFetch;

      // Act
      const { result } = renderHook(() => useTranscriptData('test-missing'));

      // Assert
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.error?.message).toBe('Session transcript not found');
    });
  });
});
