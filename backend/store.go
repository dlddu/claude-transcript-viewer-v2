package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// ErrSessionNotMapped is returned when a session id has no row in the
// session→S3-key mapping table.
var ErrSessionNotMapped = errors.New("session id is not mapped to an S3 key")

// Store persists the mapping between a session id and the S3 key prefix
// where its Hive-partitioned transcript files live. It is the source of
// truth for which sessions exist and where to read them from.
type Store struct {
	db *sql.DB
}

// OpenStore opens (creating if necessary) the SQLite database at path and
// ensures the schema exists. The pure-Go modernc.org/sqlite driver is used
// so the binary builds with CGO disabled.
func OpenStore(ctx context.Context, path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %q: %w", path, err)
	}
	// A single connection avoids "database is locked" churn for this
	// low-concurrency workload.
	db.SetMaxOpenConns(1)

	// The database lives on EFS. WAL requires every process that opens the file
	// to share a -shm mapping, which a network filesystem does not guarantee, so
	// stay on the rollback journal. maxSurge=0 on the Deployment keeps this a
	// single-writer database, which is what the rollback journal assumes.
	for _, pragma := range []string{
		"PRAGMA journal_mode=DELETE",
		"PRAGMA busy_timeout=5000",
		"PRAGMA foreign_keys=ON",
	} {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("apply %q: %w", pragma, err)
		}
	}

	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate(ctx context.Context) error {
	const schema = `
CREATE TABLE IF NOT EXISTS transcript_sessions (
	session_id TEXT PRIMARY KEY,
	s3_prefix  TEXT NOT NULL,
	created_at TEXT NOT NULL
);`
	if _, err := s.db.ExecContext(ctx, schema); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	return nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// GetSessionPrefix returns the S3 key prefix (with trailing slash) mapped to
// sessionID, or ErrSessionNotMapped if none exists.
func (s *Store) GetSessionPrefix(ctx context.Context, sessionID string) (string, error) {
	var prefix string
	err := s.db.QueryRowContext(ctx,
		"SELECT s3_prefix FROM transcript_sessions WHERE session_id = ?",
		sessionID,
	).Scan(&prefix)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrSessionNotMapped
	}
	if err != nil {
		return "", fmt.Errorf("lookup session %q: %w", sessionID, err)
	}
	return prefix, nil
}

// PutSession records that sessionID's transcript files live under s3Prefix,
// stamping the mapping with the current time. It is the production entry point;
// tests and seeding use PutSessionAt to inject a deterministic created_at.
func (s *Store) PutSession(ctx context.Context, sessionID, s3Prefix string) error {
	return s.PutSessionAt(ctx, sessionID, s3Prefix, time.Now().UTC())
}

// PutSessionAt records sessionID's mapping with an explicit created_at. The
// first mapping wins: a session keeps its original prefix (and original
// created_at) so that the main transcript and any later subagent uploads share
// one directory. Exposing the timestamp as a parameter is the seam that lets
// tests and the seed subcommand assert a deterministic newest-first ordering.
func (s *Store) PutSessionAt(ctx context.Context, sessionID, s3Prefix string, createdAt time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO transcript_sessions (session_id, s3_prefix, created_at)
		 VALUES (?, ?, ?)
		 ON CONFLICT(session_id) DO NOTHING`,
		sessionID, s3Prefix, createdAt.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("put session %q: %w", sessionID, err)
	}
	return nil
}

// DeleteSession removes the mapping for sessionID. Deleting a session that is
// not mapped is a no-op and not an error, so callers can converge on a clean
// state without first checking for existence.
func (s *Store) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx,
		"DELETE FROM transcript_sessions WHERE session_id = ?",
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("delete session %q: %w", sessionID, err)
	}
	return nil
}

// SessionRecord is one row of the session→prefix mapping as returned by
// ListSessions: the session id and when it was first recorded. It is the
// store's minimal shape; higher layers project it into the API response type.
type SessionRecord struct {
	SessionID string
	CreatedAt time.Time
}

// ListSessions returns every mapped session ordered newest-first by created_at
// so callers can present the most recently uploaded sessions at the top. The
// session id breaks ties for a deterministic order when two rows share a
// timestamp (RFC3339 is second-resolution). created_at is stored as an RFC3339
// UTC string, whose lexicographic order matches chronological order, so the SQL
// ORDER BY is sound; it is parsed back to time.Time here.
func (s *Store) ListSessions(ctx context.Context) ([]SessionRecord, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT session_id, created_at FROM transcript_sessions ORDER BY created_at DESC, session_id DESC")
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	records := make([]SessionRecord, 0)
	for rows.Next() {
		var (
			id        string
			createdAt string
		)
		if err := rows.Scan(&id, &createdAt); err != nil {
			return nil, fmt.Errorf("scan session row: %w", err)
		}
		t, err := time.Parse(time.RFC3339, createdAt)
		if err != nil {
			return nil, fmt.Errorf("parse created_at %q for session %q: %w", createdAt, id, err)
		}
		records = append(records, SessionRecord{SessionID: id, CreatedAt: t})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sessions: %w", err)
	}
	return records, nil
}

// ListSessionIDs returns every mapped session id, ordered for stable output.
func (s *Store) ListSessionIDs(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT session_id FROM transcript_sessions ORDER BY session_id")
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan session id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sessions: %w", err)
	}
	return ids, nil
}
