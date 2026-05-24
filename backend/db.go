package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// ErrMappingNotFound is returned by the store when no S3 key is recorded for a
// session ID.
var ErrMappingNotFound = errors.New("no s3 key mapping found for session id")

// SQLiteStore persists the mapping between a session ID and the S3 key its
// transcript was written to. It is the source of truth for which transcripts
// exist; reads resolve a session ID to an S3 key through this store.
type SQLiteStore struct {
	db *sql.DB
}

// OpenSQLiteStore opens (creating if needed) the SQLite database at path and
// ensures the schema exists. The parent directory is created when missing so a
// fresh PersistentVolume mount works out of the box.
func OpenSQLiteStore(path string) (*SQLiteStore, error) {
	if path != ":memory:" {
		if dir := filepath.Dir(path); dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create sqlite dir: %w", err)
			}
		}
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// SQLite allows a single writer; serialise all access through one
	// connection to avoid "database is locked" errors under concurrent uploads.
	db.SetMaxOpenConns(1)

	store := &SQLiteStore{db: db}
	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *SQLiteStore) init() error {
	const schema = `
CREATE TABLE IF NOT EXISTS transcript_mappings (
    session_id  TEXT PRIMARY KEY,
    s3_key      TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
);`
	if _, err := s.db.Exec(schema); err != nil {
		return fmt.Errorf("init schema: %w", err)
	}
	return nil
}

// Put records (or replaces) the S3 key and upload time for a session ID.
func (s *SQLiteStore) Put(ctx context.Context, sessionID, s3Key, uploadedAt string) error {
	const q = `
INSERT INTO transcript_mappings (session_id, s3_key, uploaded_at)
VALUES (?, ?, ?)
ON CONFLICT(session_id) DO UPDATE SET
    s3_key = excluded.s3_key,
    uploaded_at = excluded.uploaded_at;`
	if _, err := s.db.ExecContext(ctx, q, sessionID, s3Key, uploadedAt); err != nil {
		return fmt.Errorf("put mapping: %w", err)
	}
	return nil
}

// Get resolves a session ID to its S3 key, returning ErrMappingNotFound when no
// mapping exists.
func (s *SQLiteStore) Get(ctx context.Context, sessionID string) (string, error) {
	const q = `SELECT s3_key FROM transcript_mappings WHERE session_id = ?;`
	var key string
	err := s.db.QueryRowContext(ctx, q, sessionID).Scan(&key)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrMappingNotFound
	}
	if err != nil {
		return "", fmt.Errorf("get mapping: %w", err)
	}
	return key, nil
}

// List returns the known session IDs, most recently uploaded first.
func (s *SQLiteStore) List(ctx context.Context) ([]string, error) {
	const q = `SELECT session_id FROM transcript_mappings ORDER BY uploaded_at DESC, session_id ASC;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list mappings: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan mapping: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Close releases the underlying database handle.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
