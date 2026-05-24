package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
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
	if m.objects == nil {
		m.objects = map[string]string{}
	}
	body, err := io.ReadAll(in.Body)
	if err != nil {
		return nil, err
	}
	m.objects[aws.ToString(in.Key)] = string(body)
	return &s3.PutObjectOutput{}, nil
}

// fakeStore is an in-memory MappingStore for unit tests.
type fakeStore struct {
	keys  map[string]string
	order []string
}

func newFakeStore() *fakeStore {
	return &fakeStore{keys: map[string]string{}}
}

func (f *fakeStore) Put(_ context.Context, sessionID, s3Key, _ string) error {
	if _, ok := f.keys[sessionID]; !ok {
		f.order = append(f.order, sessionID)
	}
	f.keys[sessionID] = s3Key
	return nil
}

func (f *fakeStore) Get(_ context.Context, sessionID string) (string, error) {
	if k, ok := f.keys[sessionID]; ok {
		return k, nil
	}
	return "", ErrMappingNotFound
}

func (f *fakeStore) List(_ context.Context) ([]string, error) {
	return append([]string{}, f.order...), nil
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

func sessionAbcObjects(t *testing.T) map[string]string {
	return map[string]string{
		"session-abc123.jsonl":                 readFixture(t, "session-abc123.jsonl"),
		"session-abc123/agent-a1b2c3d.jsonl":   readFixture(t, "session-abc123/agent-a1b2c3d.jsonl"),
		"session-abc123/agent-xyz789.jsonl":    readFixture(t, "session-abc123/agent-xyz789.jsonl"),
	}
}

func sessionXyzObjects(t *testing.T) map[string]string {
	return map[string]string{
		"session-xyz789.jsonl": readFixture(t, "session-xyz789.jsonl"),
	}
}

// newServiceWithMock builds a service over the given S3 objects and seeds the
// mapping store with one entry per "main" object (a top-level "<id>.jsonl",
// i.e. one with no slash after the prefix). Subagent objects live under a
// subdirectory and are resolved at read time, not listed in the store.
func newServiceWithMock(objects map[string]string, prefix string) *S3Service {
	store := newFakeStore()
	np := normalizePrefix(prefix)
	for k := range objects {
		rel := k
		if np != "" && strings.HasPrefix(rel, np) {
			rel = rel[len(np):]
		}
		if strings.Contains(rel, "/") || !strings.HasSuffix(rel, ".jsonl") {
			continue
		}
		id := strings.TrimSuffix(rel, ".jsonl")
		_ = store.Put(context.Background(), id, k, "2026-01-01T00:00:00Z")
	}
	return NewS3ServiceWithClient(&mockS3Client{objects: objects}, "test-transcripts", prefix, store)
}

// --- ListTranscripts --------------------------------------------------------

func TestListTranscripts_ReturnsAllIDs(t *testing.T) {
	svc := newServiceWithMock(map[string]string{
		"transcript-a.jsonl": "{}",
		"transcript-b.jsonl": "{}",
	}, "")

	got, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) == 0 {
		t.Fatal("expected at least one transcript")
	}
}

func TestListTranscripts_EmptyBucket(t *testing.T) {
	svc := newServiceWithMock(map[string]string{}, "")

	got, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty, got %v", got)
	}
}

// --- GetTranscriptBySessionId timeline integration --------------------------

func TestGetTranscriptBySessionId_MergesMainAndSubagentTimeline(t *testing.T) {
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionXyzObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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
	svc := newServiceWithMock(sessionAbcObjects(t), "")
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

// --- Strict mapping behaviour ----------------------------------------------

func TestGetTranscriptBySessionId_NotFoundWhenNoMapping(t *testing.T) {
	// Object exists in S3 but no mapping is recorded: strict mode returns 404.
	mock := &mockS3Client{objects: map[string]string{
		"orphan.jsonl": readFixture(t, "session-xyz789.jsonl"),
	}}
	svc := NewS3ServiceWithClient(mock, "test-transcripts", "", newFakeStore())

	_, err := svc.GetTranscriptBySessionId(context.Background(), "orphan")
	if !errors.Is(err, ErrNoSessionTranscriptFound) {
		t.Errorf("expected ErrNoSessionTranscriptFound, got %v", err)
	}
}

func TestListTranscripts_ComesFromStoreNotBucket(t *testing.T) {
	mock := &mockS3Client{objects: map[string]string{"orphan.jsonl": "{}"}}
	store := newFakeStore()
	_ = store.Put(context.Background(), "mapped-only", "year=2026/month=05/day=24/hour=00/mapped-only.jsonl", "2026-05-24T00:00:00Z")
	svc := NewS3ServiceWithClient(mock, "test-transcripts", "", store)

	got, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0] != "mapped-only" {
		t.Errorf("expected [mapped-only], got %v", got)
	}
}

// --- Hive-style upload ------------------------------------------------------

func TestHiveKey_Format(t *testing.T) {
	ts := time.Date(2026, 5, 24, 9, 0, 0, 0, time.UTC)
	got := hiveKey("", "session-xyz789", ts)
	want := "year=2026/month=05/day=24/hour=09/session-xyz789.jsonl"
	if got != want {
		t.Errorf("hiveKey = %q, want %q", got, want)
	}
	if withPrefix := hiveKey("tenants/acme/", "s1", ts); withPrefix != "tenants/acme/year=2026/month=05/day=24/hour=09/s1.jsonl" {
		t.Errorf("prefixed hiveKey = %q", withPrefix)
	}
}

func newUploadService(prefix string, at time.Time) (*S3Service, *mockS3Client) {
	mock := &mockS3Client{objects: map[string]string{}}
	svc := NewS3ServiceWithClient(mock, "test-transcripts", prefix, newFakeStore())
	svc.now = func() time.Time { return at }
	return svc, mock
}

func TestUploadTranscript_WritesHiveKeyAndMapping(t *testing.T) {
	at := time.Date(2026, 5, 24, 14, 5, 0, 0, time.UTC)
	svc, mock := newUploadService("", at)
	body := readFixture(t, "session-xyz789.jsonl")

	key, err := svc.UploadTranscript(context.Background(), UploadInput{
		SessionID: "session-xyz789",
		Content:   []byte(body),
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}

	wantKey := "year=2026/month=05/day=24/hour=14/session-xyz789.jsonl"
	if key != wantKey {
		t.Errorf("key = %q, want %q", key, wantKey)
	}
	if _, ok := mock.objects[wantKey]; !ok {
		t.Errorf("object not stored at %q; have %v", wantKey, mock.objects)
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-xyz789")
	if err != nil {
		t.Fatalf("get after upload: %v", err)
	}
	if got.GetString("session_id") != "session-xyz789" {
		t.Errorf("session_id = %q", got.GetString("session_id"))
	}

	ids, _ := svc.ListTranscripts(context.Background())
	if len(ids) != 1 || ids[0] != "session-xyz789" {
		t.Errorf("list = %v, want [session-xyz789]", ids)
	}
}

func TestUploadTranscript_WithSubagentsRoundTrips(t *testing.T) {
	at := time.Date(2026, 5, 24, 14, 0, 0, 0, time.UTC)
	svc, mock := newUploadService("tenants/acme/", at)

	key, err := svc.UploadTranscript(context.Background(), UploadInput{
		SessionID: "session-abc123",
		Content:   []byte(readFixture(t, "session-abc123.jsonl")),
		Subagents: []SubagentUpload{
			{ID: "agent-a1b2c3d.jsonl", Content: []byte(readFixture(t, "session-abc123/agent-a1b2c3d.jsonl"))},
			{ID: "agent-xyz789.jsonl", Content: []byte(readFixture(t, "session-abc123/agent-xyz789.jsonl"))},
		},
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if !strings.HasPrefix(key, "tenants/acme/year=2026/") {
		t.Errorf("key missing prefix/partition: %q", key)
	}
	base := strings.TrimSuffix(key, ".jsonl")
	for _, agent := range []string{"agent-a1b2c3d", "agent-xyz789"} {
		if _, ok := mock.objects[base+"/"+agent+".jsonl"]; !ok {
			t.Errorf("subagent object missing: %s", base+"/"+agent+".jsonl")
		}
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), "session-abc123")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	raw, ok := got["subagents"]
	if !ok {
		t.Fatal("missing subagents")
	}
	var subs []SubagentTranscript
	if err := json.Unmarshal(raw, &subs); err != nil {
		t.Fatalf("subagents decode: %v", err)
	}
	if len(subs) != 2 {
		t.Errorf("expected 2 subagents, got %d", len(subs))
	}
}

func TestUploadTranscript_RejectsEmptyAndInvalid(t *testing.T) {
	svc, _ := newUploadService("", time.Now())

	if _, err := svc.UploadTranscript(context.Background(), UploadInput{SessionID: "s", Content: nil}); !errors.Is(err, ErrEmptyTranscript) {
		t.Errorf("empty content: expected ErrEmptyTranscript, got %v", err)
	}
	if _, err := svc.UploadTranscript(context.Background(), UploadInput{SessionID: " ", Content: []byte("{}")}); !errors.Is(err, ErrSessionIDRequired) {
		t.Errorf("blank session: expected ErrSessionIDRequired, got %v", err)
	}
	if _, err := svc.UploadTranscript(context.Background(), UploadInput{SessionID: "s", Content: []byte("not json\n")}); !errors.Is(err, ErrInvalidTranscript) {
		t.Errorf("invalid jsonl: expected ErrInvalidTranscript, got %v", err)
	}
}

// --- AssumeRole construction ------------------------------------------------

func TestNewS3Service_DoesNotFailWithoutAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket: "test-bucket",
		Region: "us-east-1",
	}, newFakeStore())
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_DoesNotFailWithAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:        "test-bucket",
		Region:        "us-east-1",
		AssumeRoleARN: "arn:aws:iam::123456789012:role/test-role",
	}, newFakeStore())
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
	}, newFakeStore())
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
	}, newFakeStore())
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
