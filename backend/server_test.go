package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// fakeService implements TranscriptService for handler tests.
type fakeService struct {
	getTranscript           func(ctx context.Context, id string) (Transcript, error)
	getTranscriptBySession  func(ctx context.Context, sessionID string) (Transcript, error)
	listTranscripts         func(ctx context.Context) ([]string, error)
	lastSessionIDPassed     string
}

func (f *fakeService) GetTranscript(ctx context.Context, id string) (Transcript, error) {
	if f.getTranscript != nil {
		return f.getTranscript(ctx, id)
	}
	return nil, errors.New("not stubbed")
}

func (f *fakeService) GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error) {
	f.lastSessionIDPassed = sessionID
	if f.getTranscriptBySession != nil {
		return f.getTranscriptBySession(ctx, sessionID)
	}
	return nil, errors.New("not stubbed")
}

func (f *fakeService) ListTranscripts(ctx context.Context) ([]string, error) {
	if f.listTranscripts != nil {
		return f.listTranscripts(ctx)
	}
	return nil, errors.New("not stubbed")
}

func newTranscript(t *testing.T, fields map[string]any) Transcript {
	t.Helper()
	out := Transcript{}
	for k, v := range fields {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal field %q: %v", k, err)
		}
		out[k] = b
	}
	return out
}

func decodeResponse(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return got
}

func doRequest(t *testing.T, server http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	return rec
}

// --- /api/transcripts/:id --------------------------------------------------

func TestHandleGetByID_ReturnsTranscript(t *testing.T) {
	id := "test-transcript-1"
	fake := &fakeService{
		getTranscript: func(_ context.Context, gotID string) (Transcript, error) {
			if gotID != id {
				t.Errorf("service got id %q, want %q", gotID, id)
			}
			return newTranscript(t, map[string]any{
				"id":      id,
				"content": "Some transcript content",
			}), nil
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcripts/"+id)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["id"] != id {
		t.Errorf("id = %v, want %q", body["id"], id)
	}
	if _, ok := body["content"]; !ok {
		t.Error("missing content field")
	}
}

func TestHandleGetByID_NotFound(t *testing.T) {
	fake := &fakeService{
		getTranscript: func(_ context.Context, _ string) (Transcript, error) {
			return nil, ErrTranscriptNotFound
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcripts/non-existent-id")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if _, ok := body["error"]; !ok {
		t.Error("expected error field")
	}
}

func TestHandleGetByID_S3FailureReturnsError(t *testing.T) {
	fake := &fakeService{
		getTranscript: func(_ context.Context, _ string) (Transcript, error) {
			return nil, errors.New("Unexpected S3 failure")
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcripts/invalid-id")
	if rec.Code < 400 {
		t.Errorf("status = %d, want >= 400", rec.Code)
	}
}

func TestHandleGetByID_IncludesSubagents(t *testing.T) {
	id := "test-with-subagents"
	fake := &fakeService{
		getTranscript: func(_ context.Context, _ string) (Transcript, error) {
			return newTranscript(t, map[string]any{
				"id":        id,
				"content":   "Transcript with subagents",
				"subagents": []any{},
			}), nil
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcripts/"+id)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	subs, ok := body["subagents"].([]any)
	if !ok {
		t.Fatalf("subagents not an array, got %T", body["subagents"])
	}
	if len(subs) != 0 {
		t.Errorf("expected empty subagents, got %v", subs)
	}
}

// --- /api/transcript/session/:sessionId -------------------------------------

func TestHandleGetBySession_ReturnsTranscript(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, _ string) (Transcript, error) {
			return newTranscript(t, map[string]any{
				"id":         sessionID,
				"session_id": sessionID,
				"content":    "{}",
				"messages": []any{
					map[string]any{
						"type":       "user",
						"sessionId":  sessionID,
						"uuid":       "msg-001",
						"timestamp":  "2026-02-01T05:00:00Z",
						"parentUuid": nil,
					},
				},
				"subagents": []any{},
			}), nil
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/"+sessionID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["session_id"] != sessionID {
		t.Errorf("session_id = %v, want %q", body["session_id"], sessionID)
	}
	if _, ok := body["id"]; !ok {
		t.Error("missing id")
	}
	if _, ok := body["content"]; !ok {
		t.Error("missing content")
	}
	if _, ok := body["messages"].([]any); !ok {
		t.Error("messages not an array")
	}
}

func TestHandleGetBySession_NotFound(t *testing.T) {
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, _ string) (Transcript, error) {
			return nil, ErrNoSessionTranscriptFound
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/session-nonexistent-999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	errStr, _ := body["error"].(string)
	if !strings.Contains(strings.ToLower(errStr), "not found") {
		t.Errorf("error message should mention 'not found', got %q", errStr)
	}
}

func TestHandleGetBySession_IncludesSubagentsArray(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, _ string) (Transcript, error) {
			return newTranscript(t, map[string]any{
				"id":         sessionID,
				"session_id": sessionID,
				"content":    "{}",
				"messages":   []any{},
				"subagents":  []any{},
			}), nil
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/"+sessionID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if _, ok := body["subagents"].([]any); !ok {
		t.Error("subagents not an array")
	}
}

func TestHandleGetBySession_MessageStructure(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, _ string) (Transcript, error) {
			return newTranscript(t, map[string]any{
				"id":         sessionID,
				"session_id": sessionID,
				"content":    "{}",
				"messages": []any{
					map[string]any{
						"type":       "user",
						"sessionId":  sessionID,
						"uuid":       "msg-001",
						"timestamp":  "2026-02-01T05:00:00Z",
						"parentUuid": nil,
					},
				},
				"subagents": []any{},
			}), nil
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/"+sessionID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	msgs, _ := body["messages"].([]any)
	if len(msgs) == 0 {
		t.Fatal("expected at least one message")
	}
	first, _ := msgs[0].(map[string]any)
	for _, k := range []string{"type", "sessionId", "uuid"} {
		if _, ok := first[k]; !ok {
			t.Errorf("first message missing %q", k)
		}
	}
}

func TestHandleGetBySession_S3ErrorReturns500(t *testing.T) {
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, _ string) (Transcript, error) {
			return nil, errors.New("S3 connection failed")
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/session-trigger-s3-error")
	if rec.Code < 400 {
		t.Errorf("status = %d, want >= 400", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if _, ok := body["error"]; !ok {
		t.Error("expected error field")
	}
}

func TestHandleGetBySession_TrimsWhitespace(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptBySession: func(_ context.Context, got string) (Transcript, error) {
			if got != sessionID {
				t.Errorf("service got %q, want %q (whitespace not trimmed)", got, sessionID)
			}
			return newTranscript(t, map[string]any{
				"id":         sessionID,
				"session_id": sessionID,
				"content":    "{}",
				"messages":   []any{},
				"subagents":  []any{},
			}), nil
		},
	}
	server := NewServer(fake)

	path := "/api/transcript/session/" + url.PathEscape("  "+sessionID+"  ")
	rec := doRequest(t, server, path)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["session_id"] != sessionID {
		t.Errorf("session_id = %v, want %q", body["session_id"], sessionID)
	}
}

// --- /api/health ------------------------------------------------------------

func TestHandleHealth_ReturnsHealthy(t *testing.T) {
	server := NewServer(&fakeService{})
	rec := doRequest(t, server, "/api/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["status"] != "healthy" {
		t.Errorf("status field = %v, want %q", body["status"], "healthy")
	}
}

// --- Both /api/transcript and /api/transcripts prefixes work ---------------

func TestBothBasePrefixes_Work(t *testing.T) {
	id := "test-transcript-1"
	fake := &fakeService{
		getTranscript: func(_ context.Context, _ string) (Transcript, error) {
			return newTranscript(t, map[string]any{"id": id, "content": "x"}), nil
		},
	}
	server := NewServer(fake)

	for _, path := range []string{"/api/transcripts/" + id, "/api/transcript/" + id} {
		rec := doRequest(t, server, path)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", path, rec.Code)
		}
	}
}
