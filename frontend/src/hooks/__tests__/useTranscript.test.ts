import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTranscript } from '../useTranscript';

/**
 * Frontend Unit Tests: useTranscript Hook
 *
 * Tests the custom hook that fetches transcript data from the backend
 */

// Mock fetch
global.fetch = vi.fn();

describe('useTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch transcript data on mount', async () => {
    // Arrange
    const transcriptId = 'test-transcript';
    const mockData = {
      events: [
        { type: 'user_message', content: 'Hello' },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    // Act
    const { result } = renderHook(() => useTranscript(transcriptId));

    // Assert - should start in loading state
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch errors', async () => {
    // Arrange
    const transcriptId = 'test-transcript';
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    // Act
    const { result } = renderHook(() => useTranscript(transcriptId));

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('should handle network errors', async () => {
    // Arrange
    const transcriptId = 'test-transcript';
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useTranscript(transcriptId));

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('should not fetch when transcriptId is null', () => {
    // Act
    const { result } = renderHook(() => useTranscript(null));

    // Assert
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should refetch when transcriptId changes', async () => {
    // Arrange
    const transcriptId1 = 'transcript-1';
    const transcriptId2 = 'transcript-2';

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    });

    // Act
    const { result, rerender } = renderHook(
      ({ id }) => useTranscript(id),
      { initialProps: { id: transcriptId1 } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Change transcript ID
    rerender({ id: transcriptId2 });

    // Assert
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
