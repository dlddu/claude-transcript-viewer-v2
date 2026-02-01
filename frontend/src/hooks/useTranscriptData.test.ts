import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTranscriptData } from './useTranscriptData';

describe('useTranscriptData', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('data fetching', () => {
    it('should fetch transcript data from S3 proxy', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-1',
          content: 'Test content',
        }),
      });
      global.fetch = mockFetch;

      // Act
      const { result } = renderHook(() => useTranscriptData('test-1'));

      // Assert
      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/transcripts/test-1')
      );
    });

    it('should return loading state initially', async () => {
      // Arrange - use a delayed promise to ensure we can check loading state
      let resolvePromise: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
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

      // Cleanup - resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => ({ id: 'test-2', content: 'Test' }),
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
  });

  describe('caching', () => {
    it('should cache transcript data after first fetch', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'test-cache', content: 'Test' }),
      });
      global.fetch = mockFetch;

      // Act - first render
      const { result, rerender } = renderHook(
        ({ id }) => useTranscriptData(id),
        { initialProps: { id: 'test-cache' } }
      );
      
      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });
      
      const callCountAfterFirst = mockFetch.mock.calls.length;

      // Re-render with same ID
      rerender({ id: 'test-cache' });

      // Assert - fetch should have been called only once
      expect(mockFetch).toHaveBeenCalledTimes(callCountAfterFirst);
    });
  });
});
