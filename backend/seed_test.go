package main

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// These tests cover the `server seed` subcommand (DP-AC4). CI reproduces its
// E2E environment by running `./backend/server seed --dir e2e/fixtures`, which
// must upload the fixtures to their Hive-partitioned S3 keys and record the
// session -> prefix mapping using the SAME code paths the running server relies
// on. Prior to these tests that behavior was only asserted indirectly (the E2E
// suite depends on seed having run) and by static string checks over the CI
// workflow and kind-setup.sh; the seed logic itself (seedDir / seedSubagents)
// had no deterministic coverage, so a regression in seed's key computation,
// mapping, or subagent discovery would not have been caught by `go test ./...`.

// hivePrefixRE matches a session's Hive partition prefix (relative to any
// configured S3 base prefix) ending in the session's own directory.
func hivePrefixRE(sessionID string) *regexp.Regexp {
	return regexp.MustCompile(`^year=\d{4}/month=\d{2}/day=\d{2}/hour=\d{2}/session_id=` +
		regexp.QuoteMeta(sessionID) + `/$`)
}

// TestSeedDir_PopulatesStorageForServerReadPath seeds a purpose-built fixtures
// directory that exercises every subagent layout the seed subcommand promises
// to handle, then asserts the resulting objects, mapping, and — the crux of
// DP-AC4 — that the seeded state is resolvable through the server's own read
// path (GetTranscriptFiles, what GET /api/transcript/session/{id} calls).
func TestSeedDir_PopulatesStorageForServerReadPath(t *testing.T) {
	ctx := context.Background()

	dir := t.TempDir()
	writeFixture := func(rel, body string) {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", filepath.Dir(p), err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatalf("write %q: %v", p, err)
		}
	}

	// Three sessions:
	//   - main transcript only (no subagents)
	//   - agent-*.jsonl files directly in the session dir (legacy layout)
	//   - files under a subagents/ subdirectory (canonical layout)
	mainOnlyBody := `{"sessionId":"session-main-only","uuid":"m1"}` + "\n"
	agentsMainBody := `{"sessionId":"session-with-agents","uuid":"a-main"}` + "\n"
	agentAlpha := `{"sessionId":"session-with-agents","uuid":"alpha"}` + "\n"
	agentBeta := `{"sessionId":"session-with-agents","uuid":"beta"}` + "\n"
	subdirMainBody := `{"sessionId":"session-subdir","uuid":"s-main"}` + "\n"
	worker1 := `{"sessionId":"session-subdir","uuid":"w1"}` + "\n"
	worker2 := `{"sessionId":"session-subdir","uuid":"w2"}` + "\n"

	writeFixture("session-main-only.jsonl", mainOnlyBody)
	writeFixture("session-with-agents.jsonl", agentsMainBody)
	writeFixture("session-with-agents/agent-alpha.jsonl", agentAlpha)
	writeFixture("session-with-agents/agent-beta.jsonl", agentBeta)
	writeFixture("session-subdir.jsonl", subdirMainBody)
	writeFixture("session-subdir/subagents/worker-1.jsonl", worker1)
	writeFixture("session-subdir/subagents/worker-2.jsonl", worker2)

	// Wire a service over an in-memory S3 and a real (temp) SQLite store, then
	// run the exact function the seed subcommand runs.
	mock := &mockS3Client{objects: map[string]string{}}
	store := newTestStore(t)
	svc := NewS3ServiceWithClient(mock, &fakePresigner{}, store, "test-transcripts", "")

	if err := seedDir(ctx, svc, store, dir); err != nil {
		t.Fatalf("seedDir: %v", err)
	}

	type want struct {
		main      string
		subagents map[string]string // object name (relative to session prefix) -> body
	}
	cases := map[string]want{
		"session-main-only": {main: mainOnlyBody, subagents: map[string]string{}},
		"session-with-agents": {main: agentsMainBody, subagents: map[string]string{
			"agent-alpha.jsonl": agentAlpha,
			"agent-beta.jsonl":  agentBeta,
		}},
		"session-subdir": {main: subdirMainBody, subagents: map[string]string{
			"subagents/worker-1.jsonl": worker1,
			"subagents/worker-2.jsonl": worker2,
		}},
	}

	// (1) Each session is mapped to a Hive prefix, and each object was uploaded
	//     to that prefix with the exact fixture bytes.
	wantKeys := map[string]bool{}
	for sessionID, w := range cases {
		prefix, err := store.GetSessionPrefix(ctx, sessionID)
		if err != nil {
			t.Fatalf("mapping missing for %q: %v", sessionID, err)
		}
		if !hivePrefixRE(sessionID).MatchString(prefix) {
			t.Errorf("session %q prefix %q is not a Hive partition path", sessionID, prefix)
		}

		mainKey := prefix + mainTranscriptName(sessionID)
		if got := mock.objects[mainKey]; got != w.main {
			t.Errorf("main object for %q at %q = %q, want %q", sessionID, mainKey, got, w.main)
		}
		wantKeys[mainKey] = true

		for name, body := range w.subagents {
			k := prefix + name
			if got := mock.objects[k]; got != body {
				t.Errorf("subagent object %q = %q, want %q", k, got, body)
			}
			wantKeys[k] = true
		}
	}

	// (2) Seed uploads nothing beyond the fixtures — no stray objects.
	if len(mock.objects) != len(wantKeys) {
		gotKeys := make([]string, 0, len(mock.objects))
		for k := range mock.objects {
			gotKeys = append(gotKeys, k)
		}
		sort.Strings(gotKeys)
		t.Errorf("seed wrote %d objects, want %d; got keys: %v",
			len(mock.objects), len(wantKeys), gotKeys)
	}

	// (3) The crux of DP-AC4: seeded storage is resolvable through the server's
	//     own read path. If GetTranscriptFiles returns each session's main plus
	//     every subagent, the seed subcommand has reproduced exactly the state
	//     the running server (and thus the E2E suite in CI) depends on.
	for sessionID, w := range cases {
		resp, err := svc.GetTranscriptFiles(ctx, sessionID)
		if err != nil {
			t.Fatalf("GetTranscriptFiles(%q) after seed: %v", sessionID, err)
		}
		if resp.Main.Name != mainTranscriptName(sessionID) {
			t.Errorf("session %q main name = %q, want %q",
				sessionID, resp.Main.Name, mainTranscriptName(sessionID))
		}

		gotSub := make([]string, 0, len(resp.Subagents))
		for _, s := range resp.Subagents {
			gotSub = append(gotSub, s.Name)
		}
		sort.Strings(gotSub)

		wantSub := make([]string, 0, len(w.subagents))
		for name := range w.subagents {
			wantSub = append(wantSub, baseName(name))
		}
		sort.Strings(wantSub)

		if strings.Join(gotSub, ",") != strings.Join(wantSub, ",") {
			t.Errorf("session %q subagents via server read path = %v, want %v",
				sessionID, gotSub, wantSub)
		}
	}
}

// TestSeedDir_RealFixturesReproduceServerEnvironment seeds the very directory CI
// feeds to `server seed --dir e2e/fixtures` and asserts every fixture session
// becomes resolvable through the server read path, including the subagent case
// (session-abc123) the E2E timeline tests rely on. This guards against a fixture
// added in a layout seed doesn't handle, or a seed regression, silently breaking
// the reproducible environment DP-AC4 promises.
func TestSeedDir_RealFixturesReproduceServerEnvironment(t *testing.T) {
	ctx := context.Background()
	dir := fixturesDir(t)

	mock := &mockS3Client{objects: map[string]string{}}
	store := newTestStore(t)
	svc := NewS3ServiceWithClient(mock, &fakePresigner{}, store, "test-transcripts", "")

	if err := seedDir(ctx, svc, store, dir); err != nil {
		t.Fatalf("seedDir(e2e/fixtures): %v", err)
	}

	// The mapped sessions are exactly the top-level *.jsonl fixtures.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read fixtures dir: %v", err)
	}
	wantSessions := make([]string, 0)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".jsonl") {
			wantSessions = append(wantSessions, strings.TrimSuffix(e.Name(), ".jsonl"))
		}
	}
	sort.Strings(wantSessions)
	if len(wantSessions) == 0 {
		t.Fatal("no *.jsonl fixtures found; expected the CI seed corpus")
	}

	gotSessions, err := store.ListSessionIDs(ctx)
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	sort.Strings(gotSessions)
	if strings.Join(gotSessions, ",") != strings.Join(wantSessions, ",") {
		t.Fatalf("seeded sessions = %v, want %v", gotSessions, wantSessions)
	}

	// Every seeded session resolves through the server read path.
	for _, sessionID := range wantSessions {
		resp, err := svc.GetTranscriptFiles(ctx, sessionID)
		if err != nil {
			t.Errorf("GetTranscriptFiles(%q): %v", sessionID, err)
			continue
		}
		if resp.Main.Name != mainTranscriptName(sessionID) {
			t.Errorf("session %q main name = %q, want %q",
				sessionID, resp.Main.Name, mainTranscriptName(sessionID))
		}
	}

	// The one fixture that ships subagents (session-abc123, agent-* layout)
	// exposes both of them — the subagent case the timeline E2E tests depend on.
	resp, err := svc.GetTranscriptFiles(ctx, "session-abc123")
	if err != nil {
		t.Fatalf("GetTranscriptFiles(session-abc123): %v", err)
	}
	gotSub := make([]string, 0, len(resp.Subagents))
	for _, s := range resp.Subagents {
		gotSub = append(gotSub, s.Name)
	}
	sort.Strings(gotSub)
	wantSub := []string{"agent-a1b2c3d.jsonl", "agent-xyz789.jsonl"}
	if strings.Join(gotSub, ",") != strings.Join(wantSub, ",") {
		t.Errorf("session-abc123 subagents = %v, want %v", gotSub, wantSub)
	}
}

// TestRunSeed_RequiresDir pins the subcommand's CLI contract: `server seed`
// without --dir fails fast (before touching the store or S3) with a message
// naming the missing flag.
func TestRunSeed_RequiresDir(t *testing.T) {
	err := runSeed(context.Background(), nil)
	if err == nil {
		t.Fatal("runSeed with no --dir should error")
	}
	if !strings.Contains(err.Error(), "dir") {
		t.Errorf("runSeed error = %q, want it to mention --dir", err)
	}
}
