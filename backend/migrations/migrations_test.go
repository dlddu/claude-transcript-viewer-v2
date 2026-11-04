package migrations

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"

	_ "modernc.org/sqlite"
)

const legacySchema = `
CREATE TABLE IF NOT EXISTS transcript_sessions (
	session_id TEXT PRIMARY KEY,
	s3_prefix  TEXT NOT NULL,
	created_at TEXT NOT NULL
);`

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

func catalog(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query("SELECT type || ':' || name || ':' || coalesce(sql, '') FROM sqlite_master ORDER BY type, name")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func userVersion(t *testing.T, db *sql.DB) int {
	t.Helper()
	var v int
	if err := db.QueryRow("PRAGMA user_version").Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestApplyMatchesLegacyBootstrap(t *testing.T) {
	legacy, fresh := openDB(t), openDB(t)
	if _, err := legacy.Exec(legacySchema); err != nil {
		t.Fatal(err)
	}
	if err := Apply(context.Background(), fresh); err != nil {
		t.Fatal(err)
	}
	if got, want := catalog(t, fresh), catalog(t, legacy); !reflect.DeepEqual(got, want) {
		t.Fatalf("catalog differs from legacy bootstrap:\n got %q\nwant %q", got, want)
	}
}

func TestApplyAdoptsLegacyDatabase(t *testing.T) {
	db := openDB(t)
	if _, err := db.Exec(legacySchema); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO transcript_sessions VALUES ('s', 'p/', '2026-01-01T00:00:00Z')"); err != nil {
		t.Fatal(err)
	}
	if err := Apply(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow("SELECT count(*) FROM transcript_sessions").Scan(&n); err != nil || n != 1 {
		t.Fatalf("rows after adopt = %d, %v; want 1", n, err)
	}
	if got := userVersion(t, db); got != 1 {
		t.Fatalf("user_version = %d, want 1", got)
	}
}

func TestApplyIsIdempotent(t *testing.T) {
	db := openDB(t)
	for i := 0; i < 2; i++ {
		if err := Apply(context.Background(), db); err != nil {
			t.Fatalf("apply #%d: %v", i+1, err)
		}
	}
	if got := userVersion(t, db); got != 1 {
		t.Fatalf("user_version = %d, want 1", got)
	}
}

func TestVersionOf(t *testing.T) {
	for name, ok := range map[string]bool{"0001_init.sql": true, "12_x.sql": true, "init.sql": false, "0_x.sql": false, "a_x.sql": false} {
		if _, err := versionOf(name); (err == nil) != ok {
			t.Errorf("versionOf(%q) err=%v, want ok=%v", name, err, ok)
		}
	}
}
