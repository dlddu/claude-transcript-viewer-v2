package main

import (
	"context"
	"encoding/json"
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

func newServiceWithMock(objects map[string]string, prefix string) *S3Service {
	return NewS3ServiceWithClient(&mockS3Client{objects: objects}, "test-transcripts", prefix)
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

// --- AssumeRole construction ------------------------------------------------

func TestNewS3Service_DoesNotFailWithoutAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket: "test-bucket",
		Region: "us-east-1",
	})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewS3Service_DoesNotFailWithAssumeRole(t *testing.T) {
	_, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:        "test-bucket",
		Region:        "us-east-1",
		AssumeRoleARN: "arn:aws:iam::123456789012:role/test-role",
	})
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
	})
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
	})
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
