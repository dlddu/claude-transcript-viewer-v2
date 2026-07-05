package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// mockS3Client implements S3API backed by an in-memory map keyed by S3 key.
// pageSize, when > 0, paginates ListObjectsV2 responses to exercise
// continuation-token handling.
type mockS3Client struct {
	objects  map[string]string
	pageSize int
	// deleteObjectErr, when non-nil, is consulted before each DeleteObject.
	// If it returns a non-nil error for the given key the delete fails and the
	// object is left in place, letting tests simulate an interrupted delete.
	deleteObjectErr func(key string) error
	// deletedKeys records, in invocation order, every key DeleteObject was
	// asked to remove (including ones whose delete was made to fail), so tests
	// can assert the order in which objects are swept.
	deletedKeys []string
}

func (m *mockS3Client) GetObject(_ context.Context, in *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	key := aws.ToString(in.Key)
	body, ok := m.objects[key]
	if !ok {
		return nil, &s3types.NoSuchKey{}
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(body)),
	}, nil
}

func (m *mockS3Client) ListObjectsV2(_ context.Context, in *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	prefix := aws.ToString(in.Prefix)
	keys := make([]string, 0, len(m.objects))
	for k := range m.objects {
		if prefix == "" || strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	// Resume after the continuation token (the last key of the prior page).
	if token := aws.ToString(in.ContinuationToken); token != "" {
		start := 0
		for i, k := range keys {
			if k > token {
				start = i
				break
			}
			start = i + 1
		}
		keys = keys[start:]
	}

	truncated := false
	if m.pageSize > 0 && len(keys) > m.pageSize {
		keys = keys[:m.pageSize]
		truncated = true
	}

	out := &s3.ListObjectsV2Output{IsTruncated: aws.Bool(truncated)}
	if truncated {
		out.NextContinuationToken = aws.String(keys[len(keys)-1])
	}
	for _, k := range keys {
		k := k
		out.Contents = append(out.Contents, s3types.Object{Key: &k})
	}
	return out, nil
}

func (m *mockS3Client) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	body, err := io.ReadAll(in.Body)
	if err != nil {
		return nil, err
	}
	if m.objects == nil {
		m.objects = map[string]string{}
	}
	m.objects[aws.ToString(in.Key)] = string(body)
	return &s3.PutObjectOutput{}, nil
}

func (m *mockS3Client) DeleteObject(_ context.Context, in *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	key := aws.ToString(in.Key)
	m.deletedKeys = append(m.deletedKeys, key)
	if m.deleteObjectErr != nil {
		if err := m.deleteObjectErr(key); err != nil {
			return nil, err
		}
	}
	delete(m.objects, key)
	return &s3.DeleteObjectOutput{}, nil
}

// fakePresigner records the keys it was asked to sign and returns
// deterministic URLs.
type fakePresigner struct {
	lastKey        string
	getKeys        []string
	lastGetExpires time.Duration
}

func (f *fakePresigner) PresignPutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
	f.lastKey = aws.ToString(in.Key)
	return &v4.PresignedHTTPRequest{
		URL:          "https://s3.example.com/" + aws.ToString(in.Bucket) + "/" + aws.ToString(in.Key) + "?X-Amz-Signature=fake",
		Method:       http.MethodPut,
		SignedHeader: http.Header{},
	}, nil
}

func (f *fakePresigner) PresignGetObject(_ context.Context, in *s3.GetObjectInput, opts ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
	key := aws.ToString(in.Key)
	f.getKeys = append(f.getKeys, key)
	var po s3.PresignOptions
	for _, o := range opts {
		o(&po)
	}
	f.lastGetExpires = po.Expires
	return &v4.PresignedHTTPRequest{
		URL: fmt.Sprintf("https://s3.example.com/%s/%s?X-Amz-Expires=%d&X-Amz-Signature=fake",
			aws.ToString(in.Bucket), key, int(po.Expires.Seconds())),
		Method:       http.MethodGet,
		SignedHeader: http.Header{},
	}, nil
}

func fixturesDir(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Join(wd, "..", "e2e", "fixtures")
}

func readFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(fixturesDir(t), name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return string(b)
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := OpenStore(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

// hivePrefixFor is a fixed Hive prefix used by tests; the date is arbitrary
// because download resolves the prefix from the store, not from the clock.
func hivePrefixFor(sessionID string) string {
	return "year=2026/month=05/day=24/hour=00/session_id=" + sessionID + "/"
}

// sessionFixture describes a session's stored objects. The main transcript is
// named "<session_id>.jsonl" automatically; subagents are keyed by file name.
type sessionFixture struct {
	main      string
	subagents map[string]string
}

func abcFixture(t *testing.T) sessionFixture {
	return sessionFixture{
		main: readFixture(t, "session-abc123.jsonl"),
		subagents: map[string]string{
			"agent-a1b2c3d.jsonl": readFixture(t, "session-abc123/agent-a1b2c3d.jsonl"),
			"agent-xyz789.jsonl":  readFixture(t, "session-abc123/agent-xyz789.jsonl"),
		},
	}
}

func xyzFixture(t *testing.T) sessionFixture {
	return sessionFixture{main: readFixture(t, "session-xyz789.jsonl")}
}

// newServiceWithSessions seeds the mock S3 (objects under each session's Hive
// prefix) and the store (session→prefix mapping), then returns a wired service.
func newServiceWithSessions(t *testing.T, sessions map[string]sessionFixture) (*S3Service, *fakePresigner, *Store) {
	t.Helper()
	store := newTestStore(t)
	objects := map[string]string{}
	for sessionID, fx := range sessions {
		prefix := hivePrefixFor(sessionID)
		objects[prefix+mainTranscriptName(sessionID)] = fx.main
		for name, body := range fx.subagents {
			objects[prefix+name] = body
		}
		if err := store.PutSession(context.Background(), sessionID, prefix); err != nil {
			t.Fatalf("put session %q: %v", sessionID, err)
		}
	}
	presigner := &fakePresigner{}
	svc := NewS3ServiceWithClient(&mockS3Client{objects: objects}, presigner, store, "test-transcripts", "")
	return svc, presigner, store
}

func abcService(t *testing.T) *S3Service {
	svc, _, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})
	return svc
}

// --- ListTranscripts --------------------------------------------------------

func TestListTranscripts_ReturnsMappedSessionIDs(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": xyzFixture(t),
		"session-xyz789": xyzFixture(t),
	})

	got, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]bool{"session-abc123": true, "session-xyz789": true}
	if len(got) != len(want) {
		t.Fatalf("got %d ids, want %d: %v", len(got), len(want), got)
	}
	for _, id := range got {
		if !want[id] {
			t.Errorf("unexpected id %q", id)
		}
	}
}

func TestListTranscripts_EmptyStore(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, nil)

	got, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty, got %v", got)
	}
}

// --- CreateUploadURL --------------------------------------------------------

func TestCreateUploadURL_NewSessionUsesHiveKeyAndStoresMapping(t *testing.T) {
	svc, presigner, store := newServiceWithSessions(t, nil)
	fixedNow := time.Date(2026, 5, 24, 15, 30, 0, 0, time.UTC)
	svc.now = func() time.Time { return fixedNow }

	resp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: "session-new"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantPrefix := "year=2026/month=05/day=24/hour=15/session_id=session-new/"
	wantKey := wantPrefix + "session-new.jsonl"
	if resp.Key != wantKey {
		t.Errorf("key = %q, want %q", resp.Key, wantKey)
	}
	if resp.Method != http.MethodPut {
		t.Errorf("method = %q, want PUT", resp.Method)
	}
	if resp.SessionID != "session-new" {
		t.Errorf("session_id = %q, want session-new", resp.SessionID)
	}
	if !strings.Contains(resp.URL, wantKey) {
		t.Errorf("url %q should contain key %q", resp.URL, wantKey)
	}
	if presigner.lastKey != wantKey {
		t.Errorf("presigned key = %q, want %q", presigner.lastKey, wantKey)
	}

	stored, err := store.GetSessionPrefix(context.Background(), "session-new")
	if err != nil {
		t.Fatalf("expected stored mapping: %v", err)
	}
	if stored != wantPrefix {
		t.Errorf("stored prefix = %q, want %q", stored, wantPrefix)
	}
}

func TestCreateUploadURL_ReusesPrefixForSubagentUpload(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, nil)
	calls := 0
	svc.now = func() time.Time {
		calls++
		// Different clock per call: a stable prefix proves reuse, not the clock.
		return time.Date(2026, 5, 24, 10+calls, 0, 0, 0, time.UTC)
	}

	main, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: "session-x"})
	if err != nil {
		t.Fatalf("main: %v", err)
	}
	sub, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: "session-x", FileName: "agent-abc.jsonl"})
	if err != nil {
		t.Fatalf("subagent: %v", err)
	}

	mainDir := strings.TrimSuffix(main.Key, "session-x.jsonl")
	subDir := strings.TrimSuffix(sub.Key, "agent-abc.jsonl")
	if mainDir != subDir {
		t.Errorf("subagent dir %q should match main dir %q", subDir, mainDir)
	}
	if !strings.HasSuffix(sub.Key, "agent-abc.jsonl") {
		t.Errorf("subagent key %q should end with agent-abc.jsonl", sub.Key)
	}
}

func TestCreateUploadURL_AppliesConfiguredPrefix(t *testing.T) {
	store := newTestStore(t)
	svc := NewS3ServiceWithClient(&mockS3Client{objects: map[string]string{}}, &fakePresigner{}, store, "test-transcripts", "tenants/acme/")
	svc.now = func() time.Time { return time.Date(2026, 1, 2, 3, 0, 0, 0, time.UTC) }

	resp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: "abc"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "tenants/acme/year=2026/month=01/day=02/hour=03/session_id=abc/abc.jsonl"
	if resp.Key != want {
		t.Errorf("key = %q, want %q", resp.Key, want)
	}
}

func TestCreateUploadURL_RejectsInvalidInput(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, nil)

	cases := []struct {
		name string
		req  UploadURLRequest
	}{
		{"empty session", UploadURLRequest{SessionID: "  "}},
		{"bad session chars", UploadURLRequest{SessionID: "a/b"}},
		{"bad filename ext", UploadURLRequest{SessionID: "abc", FileName: "evil.txt"}},
		{"filename traversal", UploadURLRequest{SessionID: "abc", FileName: "../escape.jsonl"}},
		{"wrong subdir", UploadURLRequest{SessionID: "abc", FileName: "evil/agent.jsonl"}},
		{"nested subagents", UploadURLRequest{SessionID: "abc", FileName: "subagents/deep/x.jsonl"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := svc.CreateUploadURL(context.Background(), c.req); err == nil {
				t.Errorf("expected error for %+v", c.req)
			}
		})
	}
}

func TestCreateUploadURL_AcceptsSubagentsSubdir(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, nil)
	svc.now = func() time.Time { return time.Date(2026, 5, 24, 15, 0, 0, 0, time.UTC) }

	resp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{
		SessionID: "session-x",
		FileName:  "subagents/agent-1.jsonl",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "year=2026/month=05/day=24/hour=15/session_id=session-x/subagents/agent-1.jsonl"
	if resp.Key != want {
		t.Errorf("key = %q, want %q", resp.Key, want)
	}
}

// --- GetTranscriptFiles ------------------------------------------------------

func TestGetTranscriptFiles_NotMappedReturnsNotFound(t *testing.T) {
	svc := abcService(t)
	_, err := svc.GetTranscriptFiles(context.Background(), "session-unmapped")
	if err != ErrNoSessionTranscriptFound {
		t.Errorf("err = %v, want ErrNoSessionTranscriptFound", err)
	}
}

func TestGetTranscriptFiles_EmptySessionIDRequired(t *testing.T) {
	svc := abcService(t)
	_, err := svc.GetTranscriptFiles(context.Background(), "   ")
	if err != ErrSessionIDRequired {
		t.Errorf("err = %v, want ErrSessionIDRequired", err)
	}
}

func TestGetTranscriptFiles_MissingMainReturnsNotFound(t *testing.T) {
	// Session mapped and subagent present, but no "<session>.jsonl" main file.
	store := newTestStore(t)
	prefix := hivePrefixFor("session-nomain")
	if err := store.PutSession(context.Background(), "session-nomain", prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}
	client := &mockS3Client{objects: map[string]string{
		prefix + "agent-only.jsonl": "{}",
	}}
	svc := NewS3ServiceWithClient(client, &fakePresigner{}, store, "test-transcripts", "")

	_, err := svc.GetTranscriptFiles(context.Background(), "session-nomain")
	if err != ErrNoSessionTranscriptFound {
		t.Errorf("err = %v, want ErrNoSessionTranscriptFound", err)
	}
}

func TestGetTranscriptFiles_ReturnsPresignedMain(t *testing.T) {
	svc, presigner, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-xyz789": xyzFixture(t),
	})

	got, err := svc.GetTranscriptFiles(context.Background(), "session-xyz789")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.SessionID != "session-xyz789" {
		t.Errorf("session_id = %q, want session-xyz789", got.SessionID)
	}
	wantKey := hivePrefixFor("session-xyz789") + "session-xyz789.jsonl"
	if got.Main.Key != wantKey {
		t.Errorf("main key = %q, want %q", got.Main.Key, wantKey)
	}
	if got.Main.ID != "session-xyz789" {
		t.Errorf("main id = %q, want session id", got.Main.ID)
	}
	if got.Main.Name != "session-xyz789.jsonl" {
		t.Errorf("main name = %q, want session-xyz789.jsonl", got.Main.Name)
	}
	if !strings.Contains(got.Main.URL, wantKey) || !strings.Contains(got.Main.URL, "X-Amz-Signature") {
		t.Errorf("main url %q should be a presigned URL for %q", got.Main.URL, wantKey)
	}
	if len(presigner.getKeys) != 1 || presigner.getKeys[0] != wantKey {
		t.Errorf("presigned keys = %v, want [%q]", presigner.getKeys, wantKey)
	}
	if len(got.Subagents) != 0 {
		t.Errorf("expected no subagents, got %d", len(got.Subagents))
	}
}

func TestGetTranscriptFiles_UsesShortDownloadTTL(t *testing.T) {
	svc, presigner, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-xyz789": xyzFixture(t),
	})

	got, err := svc.GetTranscriptFiles(context.Background(), "session-xyz789")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ExpiresIn != int(defaultDownloadTTL.Seconds()) {
		t.Errorf("expires_in = %d, want %d", got.ExpiresIn, int(defaultDownloadTTL.Seconds()))
	}
	if presigner.lastGetExpires != defaultDownloadTTL {
		t.Errorf("presign expires = %v, want %v", presigner.lastGetExpires, defaultDownloadTTL)
	}

	svc.downloadTTL = 90 * time.Second
	got, err = svc.GetTranscriptFiles(context.Background(), "session-xyz789")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ExpiresIn != 90 {
		t.Errorf("expires_in = %d, want 90", got.ExpiresIn)
	}
	if presigner.lastGetExpires != 90*time.Second {
		t.Errorf("presign expires = %v, want 90s", presigner.lastGetExpires)
	}
}

func TestGetTranscriptFiles_DiscoversSubagentsInSessionDir(t *testing.T) {
	svc, presigner, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})

	got, err := svc.GetTranscriptFiles(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Subagents) != 2 {
		t.Fatalf("expected 2 subagents, got %d", len(got.Subagents))
	}
	// sort.Strings on keys makes the order deterministic.
	wantIDs := []string{"agent-a1b2c3d", "agent-xyz789"}
	for i, sub := range got.Subagents {
		if sub.ID != wantIDs[i] {
			t.Errorf("subagent[%d].id = %q, want %q", i, sub.ID, wantIDs[i])
		}
		if sub.Name != wantIDs[i]+".jsonl" {
			t.Errorf("subagent[%d].name = %q, want %q", i, sub.Name, wantIDs[i]+".jsonl")
		}
		if !strings.Contains(sub.URL, sub.Key) || !strings.Contains(sub.URL, "X-Amz-Signature") {
			t.Errorf("subagent url %q should be presigned for %q", sub.URL, sub.Key)
		}
	}
	// Main + 2 subagents signed.
	if len(presigner.getKeys) != 3 {
		t.Errorf("expected 3 presigned keys, got %v", presigner.getKeys)
	}
}

func TestGetTranscriptFiles_DiscoversSubagentsSubdir(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": {
			main: readFixture(t, "session-abc123.jsonl"),
			subagents: map[string]string{
				"subagents/agent-a1b2c3d.jsonl": readFixture(t, "session-abc123/agent-a1b2c3d.jsonl"),
				"subagents/agent-xyz789.jsonl":  readFixture(t, "session-abc123/agent-xyz789.jsonl"),
			},
		},
	})

	got, err := svc.GetTranscriptFiles(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Subagents) != 2 {
		t.Fatalf("expected 2 subagents from subagents/ subdir, got %d", len(got.Subagents))
	}
	for _, sub := range got.Subagents {
		if !strings.HasPrefix(sub.Key, "year=2026/") || !strings.Contains(sub.Key, "/subagents/") {
			t.Errorf("subagent key %q should live under subagents/", sub.Key)
		}
		if strings.Contains(sub.ID, "/") {
			t.Errorf("subagent id %q should be a bare agent id", sub.ID)
		}
	}
}

func TestGetTranscriptFiles_IgnoresUnrelatedObjects(t *testing.T) {
	store := newTestStore(t)
	prefix := hivePrefixFor("session-x")
	if err := store.PutSession(context.Background(), "session-x", prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}
	client := &mockS3Client{objects: map[string]string{
		prefix + "session-x.jsonl": "{}",
		prefix + "notes.txt":       "not a transcript",
		prefix + "other.jsonl":     "{}",
	}}
	svc := NewS3ServiceWithClient(client, &fakePresigner{}, store, "test-transcripts", "")

	got, err := svc.GetTranscriptFiles(context.Background(), "session-x")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Subagents) != 0 {
		t.Errorf("expected unrelated files to be ignored, got %v", got.Subagents)
	}
}

func TestGetTranscriptFiles_FollowsListPagination(t *testing.T) {
	// More objects than one page: the main file sorts after the subagent
	// files, so missing pagination would lose it (or the trailing subagents).
	store := newTestStore(t)
	prefix := hivePrefixFor("session-big")
	if err := store.PutSession(context.Background(), "session-big", prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}
	objects := map[string]string{prefix + "session-big.jsonl": "{}"}
	for i := 0; i < 7; i++ {
		objects[fmt.Sprintf("%sagent-%02d.jsonl", prefix, i)] = "{}"
	}
	client := &mockS3Client{objects: objects, pageSize: 2}
	svc := NewS3ServiceWithClient(client, &fakePresigner{}, store, "test-transcripts", "")

	got, err := svc.GetTranscriptFiles(context.Background(), "session-big")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Main.Key != prefix+"session-big.jsonl" {
		t.Errorf("main key = %q, want %q", got.Main.Key, prefix+"session-big.jsonl")
	}
	if len(got.Subagents) != 7 {
		t.Errorf("expected 7 subagents across pages, got %d", len(got.Subagents))
	}
}

// --- DeleteTranscriptBySessionId -------------------------------------------

func TestDeleteTranscriptBySessionId_RemovesObjectsAndMapping(t *testing.T) {
	svc, _, store := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})
	mock := svc.client.(*mockS3Client)
	prefix := hivePrefixFor("session-abc123")

	// Sanity: the main transcript and both subagents are seeded.
	if len(mock.objects) < 3 {
		t.Fatalf("expected at least 3 seeded objects, got %d", len(mock.objects))
	}

	if err := svc.DeleteTranscriptBySessionId(context.Background(), "session-abc123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for k := range mock.objects {
		if strings.HasPrefix(k, prefix) {
			t.Errorf("object %q under session prefix should have been deleted", k)
		}
	}
	if _, err := store.GetSessionPrefix(context.Background(), "session-abc123"); !errors.Is(err, ErrSessionNotMapped) {
		t.Errorf("store err = %v, want ErrSessionNotMapped", err)
	}
	if _, err := svc.GetTranscriptFiles(context.Background(), "session-abc123"); err != ErrNoSessionTranscriptFound {
		t.Errorf("read after delete err = %v, want ErrNoSessionTranscriptFound", err)
	}
}

func TestDeleteTranscriptBySessionId_NotMappedReturnsNotFound(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})
	mock := svc.client.(*mockS3Client)
	before := len(mock.objects)

	if err := svc.DeleteTranscriptBySessionId(context.Background(), "session-unmapped"); err != ErrNoSessionTranscriptFound {
		t.Errorf("err = %v, want ErrNoSessionTranscriptFound", err)
	}
	if len(mock.objects) != before {
		t.Errorf("objects changed %d -> %d; deleting an unmapped session must not touch storage", before, len(mock.objects))
	}
}

func TestDeleteTranscriptBySessionId_LeavesOtherSessionsIntact(t *testing.T) {
	svc, _, store := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
		"session-xyz789": xyzFixture(t),
	})
	mock := svc.client.(*mockS3Client)

	if err := svc.DeleteTranscriptBySessionId(context.Background(), "session-abc123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := store.GetSessionPrefix(context.Background(), "session-xyz789"); err != nil {
		t.Errorf("other session mapping should remain: %v", err)
	}
	otherPrefix := hivePrefixFor("session-xyz789")
	found := false
	for k := range mock.objects {
		if strings.HasPrefix(k, otherPrefix) {
			found = true
		}
	}
	if !found {
		t.Error("expected the other session's objects to remain")
	}
}

// TestDeleteTranscriptBySessionId_DeletesObjectsBeforeMapping locks in LC-AC5's
// ordering guarantee: every object under the session's Hive directory is swept
// before the SQLite mapping is dropped, so the mapping is removed strictly last.
// It fails the main transcript's delete (swept last, since agent-* keys sort
// ahead of session-abc123.jsonl) and asserts that the earlier subagent objects
// were already gone while the mapping — and thus the session — survives.
func TestDeleteTranscriptBySessionId_DeletesObjectsBeforeMapping(t *testing.T) {
	svc, _, store := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})
	mock := svc.client.(*mockS3Client)
	prefix := hivePrefixFor("session-abc123")
	mainKey := prefix + mainTranscriptName("session-abc123")
	subKeyA := prefix + "agent-a1b2c3d.jsonl"
	subKeyB := prefix + "agent-xyz789.jsonl"

	boom := errors.New("simulated S3 delete failure on the main object")
	mock.deleteObjectErr = func(key string) error {
		if key == mainKey {
			return boom
		}
		return nil
	}

	err := svc.DeleteTranscriptBySessionId(context.Background(), "session-abc123")
	if err == nil || !errors.Is(err, boom) {
		t.Fatalf("err = %v, want it to wrap the injected S3 failure", err)
	}

	// The whole object sweep runs before the mapping is touched, and the main
	// transcript is swept last of all.
	if n := len(mock.deletedKeys); n != 3 {
		t.Fatalf("attempted object deletes = %d (%v), want 3 (full sweep)", n, mock.deletedKeys)
	}
	if last := mock.deletedKeys[len(mock.deletedKeys)-1]; last != mainKey {
		t.Errorf("last deleted key = %q, want the main object %q swept last", last, mainKey)
	}

	// The subagent objects were removed before the failure...
	for _, k := range []string{subKeyA, subKeyB} {
		if _, ok := mock.objects[k]; ok {
			t.Errorf("subagent object %q should have been deleted before the main object", k)
		}
	}
	// ...the main object (whose delete failed) is still present...
	if _, ok := mock.objects[mainKey]; !ok {
		t.Error("main object whose delete failed should remain in storage")
	}
	// ...and crucially the mapping is intact: it is dropped only after a fully
	// successful object sweep, never midway through one.
	if _, err := store.GetSessionPrefix(context.Background(), "session-abc123"); err != nil {
		t.Errorf("mapping must survive an interrupted object sweep: %v", err)
	}
}

// TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe locks in LC-AC5's
// retry-safety guarantee: an object delete that fails partway leaves the session
// fully resolvable, and simply retrying the delete once the transient failure
// clears removes everything — objects and mapping alike.
func TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe(t *testing.T) {
	svc, _, store := newServiceWithSessions(t, map[string]sessionFixture{
		"session-abc123": abcFixture(t),
	})
	mock := svc.client.(*mockS3Client)
	prefix := hivePrefixFor("session-abc123")

	// First attempt is interrupted on the very first object delete, so nothing
	// is removed at all.
	firstKey := prefix + "agent-a1b2c3d.jsonl"
	boom := errors.New("simulated transient S3 failure")
	mock.deleteObjectErr = func(key string) error {
		if key == firstKey {
			return boom
		}
		return nil
	}
	if err := svc.DeleteTranscriptBySessionId(context.Background(), "session-abc123"); !errors.Is(err, boom) {
		t.Fatalf("first delete err = %v, want the injected failure", err)
	}

	// The session survives the interruption intact: the mapping is present and
	// the full manifest (main + both subagents) still resolves, so the delete
	// is safe to retry.
	if _, err := store.GetSessionPrefix(context.Background(), "session-abc123"); err != nil {
		t.Errorf("mapping should survive an interrupted delete: %v", err)
	}
	files, err := svc.GetTranscriptFiles(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("session should stay queryable after an interrupted delete: %v", err)
	}
	if len(files.Subagents) != 2 {
		t.Errorf("subagents still resolvable = %d, want 2", len(files.Subagents))
	}

	// Retry with the transient failure cleared: the delete now completes and
	// removes every object plus the mapping.
	mock.deleteObjectErr = nil
	if err := svc.DeleteTranscriptBySessionId(context.Background(), "session-abc123"); err != nil {
		t.Fatalf("retry delete should succeed: %v", err)
	}
	for k := range mock.objects {
		if strings.HasPrefix(k, prefix) {
			t.Errorf("object %q under session prefix should be gone after a successful retry", k)
		}
	}
	if _, err := store.GetSessionPrefix(context.Background(), "session-abc123"); !errors.Is(err, ErrSessionNotMapped) {
		t.Errorf("mapping should be removed after a successful retry: err = %v, want ErrSessionNotMapped", err)
	}
}

func TestDeleteTranscriptBySessionId_RejectsInvalidInput(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, nil)

	if err := svc.DeleteTranscriptBySessionId(context.Background(), "  "); !errors.Is(err, ErrSessionIDRequired) {
		t.Errorf("err = %v, want ErrSessionIDRequired", err)
	}
	if err := svc.DeleteTranscriptBySessionId(context.Background(), "a/b"); !errors.Is(err, ErrSessionIDInvalid) {
		t.Errorf("err = %v, want ErrSessionIDInvalid", err)
	}
}

// --- prefix normalization ---------------------------------------------------

func TestPrefixNormalization(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"foo/bar", "foo/bar/"},
		{"foo/bar/", "foo/bar/"},
		{"/foo/bar/", "foo/bar/"},
		{"///", ""},
	}
	for _, c := range cases {
		got := normalizePrefix(c.in)
		if got != c.want {
			t.Errorf("normalizePrefix(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// --- hive partition path ----------------------------------------------------

func TestHiveSessionPrefix(t *testing.T) {
	got := hiveSessionPrefix("session-abc", time.Date(2026, 5, 24, 9, 15, 0, 0, time.UTC))
	want := "year=2026/month=05/day=24/hour=09/session_id=session-abc/"
	if got != want {
		t.Errorf("hiveSessionPrefix = %q, want %q", got, want)
	}
}

func TestHiveSessionPrefix_NormalizesToUTC(t *testing.T) {
	loc := time.FixedZone("UTC+9", 9*3600)
	got := hiveSessionPrefix("s", time.Date(2026, 5, 24, 2, 0, 0, 0, loc)) // 17:00 prev day UTC
	want := "year=2026/month=05/day=23/hour=17/session_id=s/"
	if got != want {
		t.Errorf("hiveSessionPrefix = %q, want %q", got, want)
	}
}

// --- AssumeRole construction ------------------------------------------------

func TestNewS3Service_DoesNotFailWithoutAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket: "test-bucket",
		Region: "us-east-1",
	}, newTestStore(t))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_DoesNotFailWithAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:        "test-bucket",
		Region:        "us-east-1",
		AssumeRoleARN: "arn:aws:iam::123456789012:role/test-role",
	}, newTestStore(t))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_FullAssumeRoleConfig(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:                "test-bucket",
		Region:                "us-east-1",
		AssumeRoleARN:         "arn:aws:iam::123456789012:role/test-role",
		AssumeRoleSessionName: "custom-session",
		AssumeRoleExternalID:  "ext-123",
		AssumeRoleDuration:    30 * time.Minute,
	}, newTestStore(t))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_EndpointTakesPrecedenceOverAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:        "test-bucket",
		Region:        "us-east-1",
		Endpoint:      "http://localhost:9000",
		AssumeRoleARN: "arn:aws:iam::123456789012:role/test-role",
	}, newTestStore(t))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_AcceptsPublicEndpoint(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:         "test-bucket",
		Region:         "us-east-1",
		Endpoint:       "http://localstack:4566",
		PublicEndpoint: "http://localhost:4566",
	}, newTestStore(t))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}
