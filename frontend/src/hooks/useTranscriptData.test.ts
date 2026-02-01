import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTranscriptData } from './useTranscriptData';

describe('useTranscriptData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('should return loading state initially', () => {
      // Arrange & Act
      const { result } = renderHook(() => useTranscriptData('test-1'));

      // Assert
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('should handle fetch errors gracefully', async () => {
      // Arrange
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      // Act
      const { result } = renderHook(() => useTranscriptData('test-1'));

      // Assert
      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });
      expect(result.current.error?.message).toContain('Network error');
    });
  });

  describe('caching', () => {
    it('should cache transcript data after first fetch', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'test-1', content: 'Test' }),
      });
      global.fetch = mockFetch;

      // Act
      const { result, rerender } = renderHook(() => useTranscriptData('test-1'));
      await waitFor(() => expect(result.current.data).toBeDefined());

      rerender();

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
