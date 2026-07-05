package main

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func openTempStore(t *testing.T) *Store {
	t.Helper()
	store, err := OpenStore(context.Background(), filepath.Join(t.TempDir(), "store.db"))
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func TestStore_PutAndGetSession(t *testing.T) {
	store := openTempStore(t)
	ctx := context.Background()
	prefix := "year=2026/month=05/day=24/hour=00/session_id=abc/"

	if err := store.PutSession(ctx, "abc", prefix); err != nil {
		t.Fatalf("PutSession: %v", err)
	}
	got, err := store.GetSessionPrefix(ctx, "abc")
	if err != nil {
		t.Fatalf("GetSessionPrefix: %v", err)
	}
	if got != prefix {
		t.Errorf("prefix = %q, want %q", got, prefix)
	}
}

func TestStore_GetMissingReturnsErrSessionNotMapped(t *testing.T) {
	store := openTempStore(t)
	_, err := store.GetSessionPrefix(context.Background(), "nope")
	if !errors.Is(err, ErrSessionNotMapped) {
		t.Errorf("err = %v, want ErrSessionNotMapped", err)
	}
}

func TestStore_PutSessionFirstWriteWins(t *testing.T) {
	store := openTempStore(t)
	ctx := context.Background()

	if err := store.PutSession(ctx, "abc", "first/"); err != nil {
		t.Fatalf("first PutSession: %v", err)
	}
	if err := store.PutSession(ctx, "abc", "second/"); err != nil {
		t.Fatalf("second PutSession: %v", err)
	}
	got, err := store.GetSessionPrefix(ctx, "abc")
	if err != nil {
		t.Fatalf("GetSessionPrefix: %v", err)
	}
	if got != "first/" {
		t.Errorf("prefix = %q, want first/ (first write should win)", got)
	}
}

func TestStore_ListSessionIDs(t *testing.T) {
	store := openTempStore(t)
	ctx := context.Background()
	for _, id := range []string{"c-three", "a-one", "b-two"} {
		if err := store.PutSession(ctx, id, "p/"+id+"/"); err != nil {
			t.Fatalf("PutSession %q: %v", id, err)
		}
	}
	got, err := store.ListSessionIDs(ctx)
	if err != nil {
		t.Fatalf("ListSessionIDs: %v", err)
	}
	want := []string{"a-one", "b-two", "c-three"} // ordered by session_id
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("index %d: got %q, want %q", i, got[i], want[i])
		}
	}
}

func TestStore_ListEmpty(t *testing.T) {
	store := openTempStore(t)
	got, err := store.ListSessionIDs(context.Background())
	if err != nil {
		t.Fatalf("ListSessionIDs: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("want empty, got %v", got)
	}
}

// TestStore_ListSessionsOrdersByCreatedAtDesc pins the newest-first contract
// ListSessions adds on top of the mapping table: sessions are returned ordered
// by created_at descending, independent of insertion order or session id. The
// injected timestamps (via PutSessionAt) make the assertion deterministic — the
// seam the E2E "최신순" check relies on.
func TestStore_ListSessionsOrdersByCreatedAtDesc(t *testing.T) {
	store := openTempStore(t)
	ctx := context.Background()

	base := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)
	// Insert in an order that is neither the chronological nor the id order, so
	// only a real created_at DESC sort produces the expected result.
	inserts := []struct {
		id      string
		created time.Time
	}{
		{"session-b", base.Add(2 * time.Hour)}, // newest
		{"session-a", base},                    // oldest
		{"session-c", base.Add(1 * time.Hour)}, // middle
	}
	for _, in := range inserts {
		if err := store.PutSessionAt(ctx, in.id, "p/"+in.id+"/", in.created); err != nil {
			t.Fatalf("PutSessionAt %q: %v", in.id, err)
		}
	}

	got, err := store.ListSessions(ctx)
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}

	wantIDs := []string{"session-b", "session-c", "session-a"} // newest → oldest
	if len(got) != len(wantIDs) {
		t.Fatalf("got %d records, want %d: %+v", len(got), len(wantIDs), got)
	}
	for i, want := range wantIDs {
		if got[i].SessionID != want {
			t.Errorf("index %d: session_id = %q, want %q (order: %+v)", i, got[i].SessionID, want, got)
		}
	}
	// created_at round-trips through storage: the newest row keeps its stamp.
	if !got[0].CreatedAt.Equal(base.Add(2 * time.Hour)) {
		t.Errorf("newest created_at = %v, want %v", got[0].CreatedAt, base.Add(2*time.Hour))
	}
}

// TestStore_ListSessionsEmpty confirms an empty store lists no sessions (and,
// unlike a nil slice, callers get a ready-to-range empty slice).
func TestStore_ListSessionsEmpty(t *testing.T) {
	store := openTempStore(t)
	got, err := store.ListSessions(context.Background())
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("want empty, got %+v", got)
	}
}

// TestStore_PutSessionAtFirstWriteWins verifies the first mapping's created_at
// (not just its prefix) is preserved when the same session is put again, so a
// later subagent upload never bumps a session to the top of the list.
func TestStore_PutSessionAtFirstWriteWins(t *testing.T) {
	store := openTempStore(t)
	ctx := context.Background()
	first := time.Date(2026, 7, 5, 8, 0, 0, 0, time.UTC)
	second := time.Date(2026, 7, 5, 9, 0, 0, 0, time.UTC)

	if err := store.PutSessionAt(ctx, "abc", "first/", first); err != nil {
		t.Fatalf("first PutSessionAt: %v", err)
	}
	if err := store.PutSessionAt(ctx, "abc", "second/", second); err != nil {
		t.Fatalf("second PutSessionAt: %v", err)
	}

	got, err := store.ListSessions(ctx)
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d records, want 1: %+v", len(got), got)
	}
	if !got[0].CreatedAt.Equal(first) {
		t.Errorf("created_at = %v, want %v (first write should win)", got[0].CreatedAt, first)
	}
}
