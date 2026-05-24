package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// fakeService implements TranscriptService for handler tests.
type fakeService struct {
	getTranscriptBySession func(ctx context.Context, sessionID string) (Transcript, error)
	listTranscripts        func(ctx context.Context) ([]string, error)
	uploadTranscript       func(ctx context.Context, in UploadInput) (string, error)
	lastSessionIDPassed    string
	lastUploadInput        UploadInput
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

func (f *fakeService) UploadTranscript(ctx context.Context, in UploadInput) (string, error) {
	f.lastUploadInput = in
	if f.uploadTranscript != nil {
		return f.uploadTranscript(ctx, in)
	}
	return "", errors.New("not stubbed")
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

// --- POST /api/transcripts (upload) ----------------------------------------

func newUploadRequest(t *testing.T, path, sessionID, mainContent string, subagents map[string]string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if sessionID != "" {
		if err := mw.WriteField("sessionId", sessionID); err != nil {
			t.Fatalf("write field: %v", err)
		}
	}
	if mainContent != "" {
		fw, err := mw.CreateFormFile("file", "main.jsonl")
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		if _, err := fw.Write([]byte(mainContent)); err != nil {
			t.Fatalf("write file: %v", err)
		}
	}
	for name, content := range subagents {
		fw, err := mw.CreateFormFile("subagents", name)
		if err != nil {
			t.Fatalf("create subagent file: %v", err)
		}
		if _, err := fw.Write([]byte(content)); err != nil {
			t.Fatalf("write subagent: %v", err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func TestHandleUpload_StoresAndReturnsKey(t *testing.T) {
	const wantKey = "year=2026/month=05/day=24/hour=14/session-new.jsonl"
	fake := &fakeService{
		uploadTranscript: func(_ context.Context, _ UploadInput) (string, error) {
			return wantKey, nil
		},
	}
	server := NewServer(fake)

	req := newUploadRequest(t, "/api/transcripts", "session-new",
		`{"type":"user","sessionId":"session-new","uuid":"u1","timestamp":"2026-05-24T14:00:00Z"}`,
		map[string]string{"agent-1.jsonl": `{"type":"assistant","sessionId":"agent-1","uuid":"a1"}`})
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["s3_key"] != wantKey {
		t.Errorf("s3_key = %v, want %q", body["s3_key"], wantKey)
	}
	if body["session_id"] != "session-new" {
		t.Errorf("session_id = %v", body["session_id"])
	}
	if fake.lastUploadInput.SessionID != "session-new" {
		t.Errorf("service got session %q", fake.lastUploadInput.SessionID)
	}
	if len(fake.lastUploadInput.Subagents) != 1 {
		t.Errorf("service got %d subagents, want 1", len(fake.lastUploadInput.Subagents))
	}
}

func TestHandleUpload_RequiresSessionAndFile(t *testing.T) {
	fake := &fakeService{
		uploadTranscript: func(_ context.Context, _ UploadInput) (string, error) {
			return "k", nil
		},
	}
	server := NewServer(fake)

	// Missing sessionId.
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, newUploadRequest(t, "/api/transcripts", "", `{"a":1}`, nil))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing session: status = %d, want 400", rec.Code)
	}

	// Missing file.
	rec = httptest.NewRecorder()
	server.ServeHTTP(rec, newUploadRequest(t, "/api/transcripts", "s1", "", nil))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing file: status = %d, want 400", rec.Code)
	}
}

func TestHandleUpload_PropagatesValidationError(t *testing.T) {
	fake := &fakeService{
		uploadTranscript: func(_ context.Context, _ UploadInput) (string, error) {
			return "", ErrInvalidTranscript
		},
	}
	server := NewServer(fake)

	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, newUploadRequest(t, "/api/transcript", "s1", "garbage", nil))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
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
