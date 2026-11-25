package main

import (
	"strings"
	"testing"
)

func TestParseShape(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want string
	}{
		{
			name: "select with equality",
			sql:  "SELECT s3_prefix FROM transcript_sessions WHERE session_id = ?",
			want: "select transcript_sessions | eq(session_id) | - | -",
		},
		{
			name: "upsert with conflict target",
			sql:  "INSERT INTO transcript_sessions (session_id, s3_prefix, created_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO NOTHING",
			want: "upsert transcript_sessions | eq(session_id) | - | -",
		},
		{
			name: "delete with equality",
			sql:  "DELETE FROM transcript_sessions WHERE session_id = ?",
			want: "delete transcript_sessions | eq(session_id) | - | -",
		},
		{
			name: "select with descending order",
			sql:  "SELECT session_id, created_at FROM transcript_sessions ORDER BY created_at DESC, session_id DESC",
			want: "select transcript_sessions | - | - | order(created_at desc, session_id desc)",
		},
		{
			name: "select with implicit ascending order",
			sql:  "SELECT session_id FROM transcript_sessions ORDER BY session_id",
			want: "select transcript_sessions | - | - | order(session_id asc)",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := parseShape(c.sql)
			if !ok {
				t.Fatalf("parseShape(%q) failed", c.sql)
			}
			if got != c.want {
				t.Errorf("shape = %q, want %q", got, c.want)
			}
		})
	}
}

func TestParseShapeRejectsNonQuery(t *testing.T) {
	if _, ok := parseShape("PRAGMA busy_timeout=5000"); ok {
		t.Error("a pragma statement has no form and must not be accepted")
	}
}

func TestExtractCallSQL(t *testing.T) {
	src := "err := s.db.QueryRowContext(ctx,\n\t\"SELECT s3_prefix FROM transcript_sessions WHERE session_id = ?\",\n\tsessionID,\n).Scan(&prefix)"
	open := strings.Index(src, "(")
	sql, ok, hasLiteral := extractCallSQL(src, open)
	if !hasLiteral || !ok {
		t.Fatalf("want a sql literal, got ok=%v hasLiteral=%v", ok, hasLiteral)
	}
	if !strings.HasPrefix(sql, "SELECT s3_prefix") {
		t.Errorf("sql = %q", sql)
	}

	src = "if _, err := db.ExecContext(ctx, pragma); err != nil {"
	open = strings.Index(src, "(")
	if _, ok, hasLiteral := extractCallSQL(src, open); ok || hasLiteral {
		t.Errorf("a variable argument holds no literal: ok=%v hasLiteral=%v", ok, hasLiteral)
	}
}

func TestSplitTableRowKeepsEscapedPipes(t *testing.T) {
	cells := splitTableRow("| `Q-01` | `select t \\| eq(c) \\| - \\| -` | - | `a.go::B` |")
	if len(cells) != 4 {
		t.Fatalf("cells = %d (%v), want 4", len(cells), cells)
	}
	if got := canonShape(cell(cells[1])); got != "select t | eq(c) | - | -" {
		t.Errorf("shape = %q", got)
	}
}

func TestRepositoryCatalogMatchesCode(t *testing.T) {
	rep, err := run("../../..")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	for _, v := range rep.Violations {
		if v.Invariant == 2 {
			t.Errorf("invariant 2 violated: %s %s (expected %s)", v.Kind, v.Item, v.Expected)
		}
	}
	if rep.Patterns != 5 || rep.ManualForms != 1 {
		t.Errorf("patterns=%d manual_forms=%d, want 5 and 1", rep.Patterns, rep.ManualForms)
	}
	if len(rep.Sites) != 6 {
		t.Errorf("site candidates = %d, want 6", len(rep.Sites))
	}
}

func TestJudgeCatalogDetectsUnregisteredSite(t *testing.T) {
	cat := &catalog{
		Patterns: []patternRow{{ID: "Q-01", Shape: "select t | eq(c) | - | -", Sites: []string{"a.go::B"}}},
	}
	sites := []codeSite{{Call: "a.go::C", Shape: "delete t | eq(c) | - | -"}}
	vs := judgeCatalog(cat, sites)
	if len(vs) == 0 {
		t.Fatal("want a violation for the site that is not in the catalog")
	}
	if vs[0].Kind != "missing-in-catalog" {
		t.Errorf("kind = %q, want missing-in-catalog", vs[0].Kind)
	}
}

func TestJudgeCatalogDetectsDeadPattern(t *testing.T) {
	cat := &catalog{
		Patterns: []patternRow{{ID: "Q-01", Shape: "select t | eq(c) | - | -", Sites: []string{"a.go::Gone"}}},
	}
	sites := []codeSite{{Call: "a.go::C", Shape: "delete t | eq(c) | - | -"}}
	vs := judgeCatalog(cat, sites)
	kinds := map[string]bool{}
	for _, v := range vs {
		kinds[v.Kind] = true
	}
	if !kinds["stale-site"] || !kinds["stale-pattern"] {
		t.Errorf("want stale-site and stale-pattern, got %v", kinds)
	}
}
