import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionList } from './SessionList.js';
import type { SessionSummary } from '../types/transcript';

// The backend returns the list already newest-first; the component renders it in
// the received order, so tests pass sessions in that order.
const SESSIONS: SessionSummary[] = [
  { session_id: 'session-newest', created_at: '2026-07-05T12:30:00Z' },
  { session_id: 'session-middle', created_at: '2026-07-05T11:00:00Z' },
  { session_id: 'other-oldest', created_at: '2026-07-05T09:15:00Z' },
];

function jsonResponse(body: unknown, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  };
}

interface Routes {
  list?: () => Partial<Response> | Promise<Partial<Response>>;
  del?: (sessionId: string) => Partial<Response> | Promise<Partial<Response>>;
}

// Installs a fetch mock that routes the list GET and the per-session DELETE.
// Returns the mock so tests can assert on the exact calls made.
function installFetch(routes: Routes) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'DELETE') {
      const id = decodeURIComponent(url.split('/session/')[1] ?? '');
      const handler = routes.del ?? (() => jsonResponse({ status: 'deleted', session_id: id }));
      return (await handler(id)) as Response;
    }
    if (url.endsWith('/api/transcripts')) {
      const handler = routes.list ?? (() => jsonResponse(SESSIONS));
      return (await handler()) as Response;
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

// Flushes the fetch-on-mount / post-click promise chain inside act(), so the
// resulting state updates are captured (no "not wrapped in act" warnings) and
// the DOM is settled before assertions. A macrotask boundary (setTimeout) drains
// all pending microtasks — fetch → await json → setState spans several hops —
// which a single awaited microtask would not. findBy would instead resolve on
// its polling boundary and race those microtasks.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Renders SessionList and waits for its initial list load to settle.
async function renderList(props: Parameters<typeof SessionList>[0] = {}) {
  const result = render(<SessionList {...props} />);
  await settle();
  return result;
}

describe('SessionList', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('rendering and ordering (SL-AC2)', () => {
    it('renders every session in the received (newest-first) order', async () => {
      installFetch({ list: () => jsonResponse(SESSIONS) });
      await renderList();

      const items = screen.getAllByTestId('session-list-item');
      expect(items).toHaveLength(3);
      const renderedIds = items.map(
        (item) => within(item).getByTestId('session-open-button').querySelector('.session-list__id')?.textContent
      );
      expect(renderedIds).toEqual(['session-newest', 'session-middle', 'other-oldest']);
    });

    it("shows each session's upload date formatted in UTC", async () => {
      installFetch({ list: () => jsonResponse(SESSIONS) });
      await renderList();

      // 2026-07-05T12:30:00Z -> "2026-07-05 12:30 UTC"
      expect(screen.getByText('2026-07-05 12:30 UTC')).toBeInTheDocument();
      expect(screen.getByText('2026-07-05 11:00 UTC')).toBeInTheDocument();
    });
  });

  describe('search and filter (SL-AC3)', () => {
    it('filters to sessions whose id contains the query (case-insensitive)', async () => {
      installFetch({ list: () => jsonResponse(SESSIONS) });
      const user = userEvent.setup();
      await renderList();

      await user.type(screen.getByTestId('session-search-input'), 'SESSION');

      const items = screen.getAllByTestId('session-list-item');
      expect(items).toHaveLength(2);
      expect(screen.getByText('session-newest')).toBeInTheDocument();
      expect(screen.getByText('session-middle')).toBeInTheDocument();
      expect(screen.queryByText('other-oldest')).not.toBeInTheDocument();
    });

    it('shows a no-results message when nothing matches, and restores on clear', async () => {
      installFetch({ list: () => jsonResponse(SESSIONS) });
      const user = userEvent.setup();
      await renderList();
      const input = screen.getByTestId('session-search-input');

      await user.type(input, 'nomatch-xyz');
      expect(screen.getByTestId('session-list-no-results')).toBeInTheDocument();
      expect(screen.queryByTestId('session-list-item')).not.toBeInTheDocument();

      await user.clear(input);
      expect(screen.getAllByTestId('session-list-item')).toHaveLength(3);
      expect(screen.queryByTestId('session-list-no-results')).not.toBeInTheDocument();
    });
  });

  describe('opening a session (SL-AC4)', () => {
    it('calls onSessionLookup with the clicked session id', async () => {
      installFetch({ list: () => jsonResponse(SESSIONS) });
      const onSessionLookup = vi.fn();
      const user = userEvent.setup();
      await renderList({ onSessionLookup });

      // Clicking the row's id opens it (the id span sits inside the open button).
      await user.click(screen.getByText('session-middle'));

      expect(onSessionLookup).toHaveBeenCalledTimes(1);
      expect(onSessionLookup).toHaveBeenCalledWith('session-middle');
    });
  });

  describe('deletion (SL-AC5)', () => {
    it('deletes after confirmation and removes the row', async () => {
      const fetchMock = installFetch({});
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();
      await renderList();

      await user.click(screen.getByRole('button', { name: 'Delete session-middle' }));
      await settle();

      expect(screen.queryByText('session-middle')).not.toBeInTheDocument();
      // Other sessions remain.
      expect(screen.getByText('session-newest')).toBeInTheDocument();
      // The DELETE went to the right endpoint.
      const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'DELETE');
      expect(deleteCall).toBeTruthy();
      expect(String(deleteCall?.[0])).toContain('/api/transcript/session/session-middle');
    });

    it('does not call DELETE when the confirmation is cancelled', async () => {
      const fetchMock = installFetch({});
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      await renderList();

      await user.click(screen.getByRole('button', { name: 'Delete session-middle' }));

      expect(screen.getByText('session-middle')).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE')).toBe(false);
    });

    it('keeps the row and shows an error when the delete fails', async () => {
      installFetch({
        del: () => jsonResponse({ error: 'Failed to delete transcript' }, 500),
      });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();
      await renderList();

      await user.click(screen.getByRole('button', { name: 'Delete session-middle' }));
      await settle();

      expect(screen.getByTestId('session-delete-error')).toHaveTextContent('Failed to delete transcript');
      // The row is retained so the delete can be retried.
      expect(screen.getByText('session-middle')).toBeInTheDocument();
    });
  });

  describe('empty, loading, and error states (SL-AC6)', () => {
    it('shows an empty state when no sessions are stored', async () => {
      installFetch({ list: () => jsonResponse([]) });
      await renderList();

      expect(screen.getByTestId('session-list-empty')).toBeInTheDocument();
      expect(screen.getByText(/no sessions stored yet/i)).toBeInTheDocument();
      expect(screen.queryByTestId('session-search-input')).not.toBeInTheDocument();
    });

    it('shows a loading state while the list request is in flight', () => {
      // A never-resolving list keeps the component in its loading state.
      installFetch({ list: () => new Promise<Partial<Response>>(() => {}) });
      render(<SessionList />);

      expect(screen.getByTestId('session-list-loading')).toBeInTheDocument();
    });

    it('shows an error state when the list request fails', async () => {
      installFetch({ list: () => jsonResponse({ error: 'Failed to list transcripts' }, 500) });
      await renderList();

      expect(screen.getByTestId('session-list-error')).toHaveTextContent('Failed to list transcripts');
    });
  });
});
