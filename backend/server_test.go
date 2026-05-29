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
	"time"
)

// fakeService implements TranscriptService for handler tests.
type fakeService struct {
	getTranscriptBySession   func(ctx context.Context, sessionID string) (Transcript, error)
	listTranscripts          func(ctx context.Context) ([]string, error)
	createUploadURL          func(ctx context.Context, req UploadURLRequest) (UploadURLResponse, error)
	createMigrationUploadURL func(ctx context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error)
	lastSessionIDPassed      string
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

func (f *fakeService) CreateUploadURL(ctx context.Context, req UploadURLRequest) (UploadURLResponse, error) {
	if f.createUploadURL != nil {
		return f.createUploadURL(ctx, req)
	}
	return UploadURLResponse{}, errors.New("not stubbed")
}

func (f *fakeService) CreateMigrationUploadURL(ctx context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error) {
	if f.createMigrationUploadURL != nil {
		return f.createMigrationUploadURL(ctx, req)
	}
	return UploadURLResponse{}, errors.New("not stubbed")
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

func doPost(t *testing.T, server http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	return rec
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

// --- /api/transcript/upload-url ---------------------------------------------

func TestHandleCreateUploadURL_ReturnsPresignedURL(t *testing.T) {
	var gotReq UploadURLRequest
	fake := &fakeService{
		createUploadURL: func(_ context.Context, req UploadURLRequest) (UploadURLResponse, error) {
			gotReq = req
			return UploadURLResponse{
				URL:       "https://s3.example.com/bucket/key?sig=x",
				Method:    http.MethodPut,
				Key:       "year=2026/month=05/day=24/hour=00/session_id=" + req.SessionID + "/" + req.SessionID + ".jsonl",
				SessionID: req.SessionID,
				ExpiresIn: 900,
			}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/upload-url/session-abc123", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if gotReq.SessionID != "session-abc123" {
		t.Errorf("service got session id %q from path, want session-abc123", gotReq.SessionID)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["url"] == "" || body["url"] == nil {
		t.Error("missing url")
	}
	if body["method"] != http.MethodPut {
		t.Errorf("method = %v, want PUT", body["method"])
	}
	if body["session_id"] != "session-abc123" {
		t.Errorf("session_id = %v, want session-abc123", body["session_id"])
	}
}

func TestHandleCreateUploadURL_PassesFileNameQueryParam(t *testing.T) {
	var gotReq UploadURLRequest
	fake := &fakeService{
		createUploadURL: func(_ context.Context, req UploadURLRequest) (UploadURLResponse, error) {
			gotReq = req
			return UploadURLResponse{URL: "https://x", Method: http.MethodPut, SessionID: req.SessionID}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/upload-url/session-abc123?file_name=agent-xyz.jsonl", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if gotReq.SessionID != "session-abc123" {
		t.Errorf("session id = %q, want session-abc123", gotReq.SessionID)
	}
	if gotReq.FileName != "agent-xyz.jsonl" {
		t.Errorf("file_name = %q, want agent-xyz.jsonl", gotReq.FileName)
	}
}

func TestHandleCreateUploadURL_BothBasePrefixes(t *testing.T) {
	fake := &fakeService{
		createUploadURL: func(_ context.Context, req UploadURLRequest) (UploadURLResponse, error) {
			return UploadURLResponse{URL: "https://x", Method: http.MethodPut, SessionID: req.SessionID}, nil
		},
	}
	server := NewServer(fake)
	for _, base := range []string{"/api/transcripts", "/api/transcript"} {
		rec := doPost(t, server, base+"/upload-url/abc", "")
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", base, rec.Code)
		}
	}
}

func TestHandleCreateUploadURL_InvalidSessionReturns400(t *testing.T) {
	fake := &fakeService{
		createUploadURL: func(_ context.Context, _ UploadURLRequest) (UploadURLResponse, error) {
			return UploadURLResponse{}, ErrSessionIDInvalid
		},
	}
	server := NewServer(fake)
	rec := doPost(t, server, "/api/transcripts/upload-url/bad-session", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// --- /api/transcript/migrate-upload-url -------------------------------------

func TestHandleCreateMigrationUploadURL_ReturnsPresignedURL(t *testing.T) {
	var gotReq MigrationUploadURLRequest
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error) {
			gotReq = req
			return UploadURLResponse{
				URL:       "https://s3.example.com/bucket/key?sig=x",
				Method:    http.MethodPut,
				Key:       "year=2026/month=03/day=01/hour=09/session_id=" + req.SessionID + "/" + req.SessionID + ".jsonl",
				SessionID: req.SessionID,
				ExpiresIn: 900,
			}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/migrate-upload-url/session-abc123?timestamp=2026-03-01T09:00:00Z", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if gotReq.SessionID != "session-abc123" {
		t.Errorf("session id = %q, want session-abc123", gotReq.SessionID)
	}
	want := time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)
	if !gotReq.Timestamp.Equal(want) {
		t.Errorf("timestamp = %v, want %v", gotReq.Timestamp, want)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["url"] == "" || body["url"] == nil {
		t.Error("missing url")
	}
	if body["method"] != http.MethodPut {
		t.Errorf("method = %v, want PUT", body["method"])
	}
}

func TestHandleCreateMigrationUploadURL_PassesFileNameQueryParam(t *testing.T) {
	var gotReq MigrationUploadURLRequest
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error) {
			gotReq = req
			return UploadURLResponse{URL: "https://x", Method: http.MethodPut, SessionID: req.SessionID}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/migrate-upload-url/session-abc123?timestamp=2026-03-01T09:00:00Z&file_name=subagents/agent-1.jsonl", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if gotReq.FileName != "subagents/agent-1.jsonl" {
		t.Errorf("file_name = %q, want subagents/agent-1.jsonl", gotReq.FileName)
	}
}

func TestHandleCreateMigrationUploadURL_MissingTimestampReturns400(t *testing.T) {
	called := false
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, _ MigrationUploadURLRequest) (UploadURLResponse, error) {
			called = true
			return UploadURLResponse{}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/migrate-upload-url/session-abc123", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if called {
		t.Error("service should not be called when timestamp is missing")
	}
}

func TestHandleCreateMigrationUploadURL_InvalidTimestampReturns400(t *testing.T) {
	called := false
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, _ MigrationUploadURLRequest) (UploadURLResponse, error) {
			called = true
			return UploadURLResponse{}, nil
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/migrate-upload-url/session-abc123?timestamp=not-a-time", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if called {
		t.Error("service should not be called when timestamp is invalid")
	}
}

func TestHandleCreateMigrationUploadURL_BothBasePrefixes(t *testing.T) {
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error) {
			return UploadURLResponse{URL: "https://x", Method: http.MethodPut, SessionID: req.SessionID}, nil
		},
	}
	server := NewServer(fake)
	for _, base := range []string{"/api/transcripts", "/api/transcript"} {
		rec := doPost(t, server, base+"/migrate-upload-url/abc?timestamp=2026-03-01T09:00:00Z", "")
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", base, rec.Code)
		}
	}
}

func TestHandleCreateMigrationUploadURL_AlreadyMappedReturns409(t *testing.T) {
	fake := &fakeService{
		createMigrationUploadURL: func(_ context.Context, _ MigrationUploadURLRequest) (UploadURLResponse, error) {
			return UploadURLResponse{}, ErrSessionAlreadyMapped
		},
	}
	server := NewServer(fake)

	rec := doPost(t, server, "/api/transcripts/migrate-upload-url/session-abc123?timestamp=2026-03-01T09:00:00Z", "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
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

	for _, base := range []string{"/api/transcripts", "/api/transcript"} {
		rec := doRequest(t, server, base+"/session/"+sessionID)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", base, rec.Code)
		}
	}
}
