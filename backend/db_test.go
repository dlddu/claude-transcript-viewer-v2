package main

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *SQLiteStore {
	t.Helper()
	store, err := OpenSQLiteStore(filepath.Join(t.TempDir(), "transcripts.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestSQLiteStore_PutGetList(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.Put(ctx, "s-older", "year=2026/month=05/day=24/hour=08/s-older.jsonl", "2026-05-24T08:00:00Z"); err != nil {
		t.Fatalf("put: %v", err)
	}
	if err := store.Put(ctx, "s-newer", "year=2026/month=05/day=24/hour=10/s-newer.jsonl", "2026-05-24T10:00:00Z"); err != nil {
		t.Fatalf("put: %v", err)
	}

	got, err := store.Get(ctx, "s-older")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != "year=2026/month=05/day=24/hour=08/s-older.jsonl" {
		t.Errorf("get = %q", got)
	}

	ids, err := store.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	// Ordered by uploaded_at DESC: newest first.
	if len(ids) != 2 || ids[0] != "s-newer" || ids[1] != "s-older" {
		t.Errorf("list = %v, want [s-newer s-older]", ids)
	}
}

func TestSQLiteStore_GetMissing(t *testing.T) {
	store := newTestStore(t)
	if _, err := store.Get(context.Background(), "nope"); !errors.Is(err, ErrMappingNotFound) {
		t.Errorf("expected ErrMappingNotFound, got %v", err)
	}
}

func TestSQLiteStore_PutUpserts(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_ = store.Put(ctx, "s1", "old-key.jsonl", "2026-05-24T08:00:00Z")
	_ = store.Put(ctx, "s1", "new-key.jsonl", "2026-05-24T09:00:00Z")

	got, err := store.Get(ctx, "s1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != "new-key.jsonl" {
		t.Errorf("get = %q, want new-key.jsonl (upsert)", got)
	}

	ids, _ := store.List(ctx)
	if len(ids) != 1 {
		t.Errorf("expected single row after upsert, got %v", ids)
	}
}

func TestSQLiteStore_CreatesParentDir(t *testing.T) {
	nested := filepath.Join(t.TempDir(), "a", "b", "c", "transcripts.db")
	store, err := OpenSQLiteStore(nested)
	if err != nil {
		t.Fatalf("open with nested missing dir: %v", err)
	}
	defer store.Close()
	if err := store.Put(context.Background(), "s1", "k.jsonl", "2026-05-24T00:00:00Z"); err != nil {
		t.Errorf("put after creating nested dir: %v", err)
	}
}

func TestSQLiteStore_PersistsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "transcripts.db")

	store, err := OpenSQLiteStore(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := store.Put(context.Background(), "s1", "k.jsonl", "2026-05-24T00:00:00Z"); err != nil {
		t.Fatalf("put: %v", err)
	}
	_ = store.Close()

	reopened, err := OpenSQLiteStore(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()
	got, err := reopened.Get(context.Background(), "s1")
	if err != nil || got != "k.jsonl" {
		t.Errorf("after reopen get = %q, err = %v; want k.jsonl", got, err)
	}
}
