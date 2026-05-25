package main

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
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
