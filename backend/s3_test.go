package main

import (
	"context"
	"encoding/json"
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
type mockS3Client struct {
	objects map[string]string
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
	if len(keys) == 0 {
		return &s3.ListObjectsV2Output{}, nil
	}
	contents := make([]s3types.Object, 0, len(keys))
	for _, k := range keys {
		k := k
		contents = append(contents, s3types.Object{Key: &k})
	}
	return &s3.ListObjectsV2Output{Contents: contents}, nil
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

// fakePresigner records the last key it was asked to sign and returns a
// deterministic URL.
type fakePresigner struct {
	lastKey string
}

func (f *fakePresigner) PresignPutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
	f.lastKey = aws.ToString(in.Key)
	return &v4.PresignedHTTPRequest{
		URL:          "https://s3.example.com/" + aws.ToString(in.Bucket) + "/" + aws.ToString(in.Key) + "?X-Amz-Signature=fake",
		Method:       http.MethodPut,
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

func abcFiles(t *testing.T) map[string]string {
	return map[string]string{
		mainTranscriptFile:    readFixture(t, "session-abc123.jsonl"),
		"agent-a1b2c3d.jsonl": readFixture(t, "session-abc123/agent-a1b2c3d.jsonl"),
		"agent-xyz789.jsonl":  readFixture(t, "session-abc123/agent-xyz789.jsonl"),
	}
}

func xyzFiles(t *testing.T) map[string]string {
	return map[string]string{
		mainTranscriptFile: readFixture(t, "session-xyz789.jsonl"),
	}
}

// newServiceWithSessions seeds the mock S3 (objects under each session's Hive
// prefix) and the store (session→prefix mapping), then returns a wired service.
func newServiceWithSessions(t *testing.T, sessions map[string]map[string]string) (*S3Service, *fakePresigner, *Store) {
	t.Helper()
	store := newTestStore(t)
	objects := map[string]string{}
	for sessionID, files := range sessions {
		prefix := hivePrefixFor(sessionID)
		for name, body := range files {
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
	svc, _, _ := newServiceWithSessions(t, map[string]map[string]string{
		"session-abc123": abcFiles(t),
	})
	return svc
}

// --- ListTranscripts --------------------------------------------------------

func TestListTranscripts_ReturnsMappedSessionIDs(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, map[string]map[string]string{
		"session-abc123": xyzFiles(t),
		"session-xyz789": xyzFiles(t),
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
	wantKey := wantPrefix + mainTranscriptFile
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

	mainDir := strings.TrimSuffix(main.Key, mainTranscriptFile)
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
	want := "tenants/acme/year=2026/month=01/day=02/hour=03/session_id=abc/transcript.jsonl"
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
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := svc.CreateUploadURL(context.Background(), c.req); err == nil {
				t.Errorf("expected error for %+v", c.req)
			}
		})
	}
}

// --- GetTranscriptBySessionId ----------------------------------------------

func TestGetTranscriptBySessionId_NotMappedReturnsNotFound(t *testing.T) {
	svc := abcService(t)
	_, err := svc.GetTranscriptBySessionId(context.Background(), "session-unmapped")
	if err != ErrNoSessionTranscriptFound {
		t.Errorf("err = %v, want ErrNoSessionTranscriptFound", err)
	}
}

func TestGetTranscriptBySessionId_MergesMainAndSubagentTimeline(t *testing.T) {
	svc := abcService(t)
	sessionID := "session-abc123"

	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.GetString("session_id") != sessionID {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), sessionID)
	}
	msgs := decodeMessages(t, got)
	if len(msgs) <= 2 {
		t.Errorf("expected > 2 merged messages, got %d", len(msgs))
	}
	var main, sub int
	for _, m := range msgs {
		if m.GetString("sessionId") == sessionID {
			main++
		} else {
			sub++
		}
	}
	if main == 0 {
		t.Error("expected at least one main message")
	}
	if sub == 0 {
		t.Error("expected at least one subagent message")
	}
}

func TestGetTranscriptBySessionId_SortsByTimestamp(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	msgs := decodeMessages(t, got)
	if len(msgs) <= 1 {
		t.Fatalf("not enough messages to test ordering: %d", len(msgs))
	}
	for i := 1; i < len(msgs); i++ {
		prev := parseTimestamp(msgs[i-1].GetString("timestamp"))
		curr := parseTimestamp(msgs[i].GetString("timestamp"))
		if curr.Before(prev) {
			t.Errorf("messages out of order at %d: %v before %v", i, curr, prev)
		}
	}
}

func TestGetTranscriptBySessionId_AddsAgentIdToAllMessages(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		if m.GetString("agentId") == "" {
			t.Errorf("message missing agentId: %v", m)
		}
	}
}

func TestGetTranscriptBySessionId_MainMessagesUseSessionIdAsAgentId(t *testing.T) {
	svc := abcService(t)
	sessionID := "session-abc123"
	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		if m.GetString("sessionId") == sessionID && m.GetString("agentId") != sessionID {
			t.Errorf("main message agentId = %q, want %q", m.GetString("agentId"), sessionID)
		}
	}
}

func TestGetTranscriptBySessionId_SubagentMessagesUseTheirOwnSessionId(t *testing.T) {
	svc := abcService(t)
	sessionID := "session-abc123"
	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		if m.GetString("sessionId") == sessionID {
			continue
		}
		if m.GetString("agentId") != m.GetString("sessionId") {
			t.Errorf("subagent message agentId = %q, want %q", m.GetString("agentId"), m.GetString("sessionId"))
		}
		if m.GetString("agentId") == sessionID {
			t.Errorf("subagent message agentId should differ from main session id")
		}
	}
}

func TestGetTranscriptBySessionId_AttachesSubagents(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	raw, ok := got["subagents"]
	if !ok {
		t.Fatal("missing subagents field")
	}
	var subs []SubagentTranscript
	if err := json.Unmarshal(raw, &subs); err != nil {
		t.Fatalf("subagents not array: %v", err)
	}
	if len(subs) == 0 {
		t.Fatal("expected subagents")
	}
	for _, s := range subs {
		if len(s.Messages) == 0 {
			t.Errorf("subagent %q missing messages", s.ID)
		}
	}
}

func TestGetTranscriptBySessionId_ParsesJSONLLineStructure(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		for _, k := range []string{"type", "sessionId", "timestamp", "uuid", "parentUuid"} {
			if _, ok := m[k]; !ok {
				t.Errorf("message missing required field %q", k)
			}
		}
	}
}

func TestGetTranscriptBySessionId_HandlesSessionWithoutSubagents(t *testing.T) {
	svc, _, _ := newServiceWithSessions(t, map[string]map[string]string{
		"session-xyz789": xyzFiles(t),
	})
	sessionID := "session-xyz789"
	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.GetString("session_id") != sessionID {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), sessionID)
	}
	for _, m := range decodeMessages(t, got) {
		if m.GetString("sessionId") != sessionID {
			t.Errorf("sessionId = %q, want %q", m.GetString("sessionId"), sessionID)
		}
		if m.GetString("agentId") != sessionID {
			t.Errorf("agentId = %q, want %q", m.GetString("agentId"), sessionID)
		}
	}
	if raw, ok := got["subagents"]; ok {
		var subs []SubagentTranscript
		_ = json.Unmarshal(raw, &subs)
		if len(subs) != 0 {
			t.Errorf("expected no subagents, got %d", len(subs))
		}
	}
}

func TestGetTranscriptBySessionId_PreservesMessageMetadata(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		if rawMsg, ok := m["message"]; ok {
			var inner map[string]json.RawMessage
			if err := json.Unmarshal(rawMsg, &inner); err != nil {
				t.Fatalf("message field not object: %v", err)
			}
			if _, ok := inner["role"]; !ok {
				t.Error("message.role missing")
			}
			if _, ok := inner["content"]; !ok {
				t.Error("message.content missing")
			}
		}
	}
}

func TestGetTranscriptBySessionId_PreservesContentBlockShape(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range decodeMessages(t, got) {
		inner := decodeInnerMessage(t, m)
		if inner == nil {
			continue
		}
		content, ok := inner["content"]
		if !ok {
			continue
		}
		var arr []map[string]json.RawMessage
		if err := json.Unmarshal(content, &arr); err != nil {
			continue // string content is fine too
		}
		for _, block := range arr {
			if _, ok := block["type"]; !ok {
				t.Error("content block missing type field")
			}
		}
	}
}

// --- Tool use / tool result matching ---------------------------------------

func TestToolUseBlocks_HaveRequiredFields(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := 0
	for _, m := range decodeMessages(t, got) {
		for _, block := range decodeContentBlocks(t, m) {
			if blockType(block) != "tool_use" {
				continue
			}
			found++
			for _, k := range []string{"id", "name", "input"} {
				if _, ok := block[k]; !ok {
					t.Errorf("tool_use block missing %q", k)
				}
			}
		}
	}
	if found == 0 {
		t.Error("expected at least one tool_use block in fixtures")
	}
}

func TestToolResultBlocks_HaveRequiredFields(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := 0
	for _, m := range decodeMessages(t, got) {
		for _, block := range decodeContentBlocks(t, m) {
			if blockType(block) != "tool_result" {
				continue
			}
			found++
			for _, k := range []string{"tool_use_id", "content"} {
				if _, ok := block[k]; !ok {
					t.Errorf("tool_result block missing %q", k)
				}
			}
		}
	}
	if found == 0 {
		t.Error("expected at least one tool_result block in fixtures")
	}
}

func TestToolUseMatchesToolResultByID(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	uses := map[string]bool{}
	for _, m := range decodeMessages(t, got) {
		for _, block := range decodeContentBlocks(t, m) {
			if blockType(block) == "tool_use" {
				uses[rawString(block["id"])] = true
			}
		}
	}
	for _, m := range decodeMessages(t, got) {
		for _, block := range decodeContentBlocks(t, m) {
			if blockType(block) != "tool_result" {
				continue
			}
			id := rawString(block["tool_use_id"])
			if !uses[id] {
				t.Errorf("tool_result references unknown tool_use_id %q", id)
			}
		}
	}
}

func TestToolResultArrivesAfterToolUse(t *testing.T) {
	svc := abcService(t)
	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	useTime := map[string]time.Time{}
	for _, m := range decodeMessages(t, got) {
		ts := parseTimestamp(m.GetString("timestamp"))
		for _, block := range decodeContentBlocks(t, m) {
			switch blockType(block) {
			case "tool_use":
				useTime[rawString(block["id"])] = ts
			case "tool_result":
				id := rawString(block["tool_use_id"])
				if prev, ok := useTime[id]; ok && ts.Before(prev) {
					t.Errorf("tool_result before tool_use for id %q", id)
				}
			}
		}
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

// --- helpers ---------------------------------------------------------------

func decodeMessages(t *testing.T, transcript Transcript) []TranscriptMessage {
	t.Helper()
	raw, ok := transcript["messages"]
	if !ok {
		return nil
	}
	var msgs []TranscriptMessage
	if err := json.Unmarshal(raw, &msgs); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	return msgs
}

func decodeInnerMessage(t *testing.T, m TranscriptMessage) map[string]json.RawMessage {
	t.Helper()
	raw, ok := m["message"]
	if !ok {
		return nil
	}
	var inner map[string]json.RawMessage
	if err := json.Unmarshal(raw, &inner); err != nil {
		return nil
	}
	return inner
}

func decodeContentBlocks(t *testing.T, m TranscriptMessage) []map[string]json.RawMessage {
	t.Helper()
	inner := decodeInnerMessage(t, m)
	if inner == nil {
		return nil
	}
	raw, ok := inner["content"]
	if !ok {
		return nil
	}
	var arr []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil
	}
	return arr
}

func blockType(block map[string]json.RawMessage) string {
	raw, ok := block["type"]
	if !ok {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return ""
	}
	return s
}

func rawString(raw json.RawMessage) string {
	var s string
	_ = json.Unmarshal(raw, &s)
	return s
}
