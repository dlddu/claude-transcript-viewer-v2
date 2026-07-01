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
	getTranscriptFiles  func(ctx context.Context, sessionID string) (TranscriptFilesResponse, error)
	listTranscripts     func(ctx context.Context) ([]string, error)
	createUploadURL     func(ctx context.Context, req UploadURLRequest) (UploadURLResponse, error)
	lastSessionIDPassed string
}

func (f *fakeService) GetTranscriptFiles(ctx context.Context, sessionID string) (TranscriptFilesResponse, error) {
	f.lastSessionIDPassed = sessionID
	if f.getTranscriptFiles != nil {
		return f.getTranscriptFiles(ctx, sessionID)
	}
	return TranscriptFilesResponse{}, errors.New("not stubbed")
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

func manifestFor(sessionID string) TranscriptFilesResponse {
	return TranscriptFilesResponse{
		SessionID: sessionID,
		ExpiresIn: 300,
		Main: TranscriptFileRef{
			ID:   sessionID,
			Name: sessionID + ".jsonl",
			Key:  "year=2026/month=05/day=24/hour=00/session_id=" + sessionID + "/" + sessionID + ".jsonl",
			URL:  "https://s3.example.com/bucket/" + sessionID + ".jsonl?X-Amz-Signature=fake",
		},
		Subagents: []TranscriptFileRef{},
	}
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

func TestHandleGetBySession_ReturnsFileManifest(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptFiles: func(_ context.Context, _ string) (TranscriptFilesResponse, error) {
			m := manifestFor(sessionID)
			m.Subagents = []TranscriptFileRef{{
				ID:   "agent-a1b2c3d",
				Name: "agent-a1b2c3d.jsonl",
				Key:  "year=2026/month=05/day=24/hour=00/session_id=" + sessionID + "/agent-a1b2c3d.jsonl",
				URL:  "https://s3.example.com/bucket/agent-a1b2c3d.jsonl?X-Amz-Signature=fake",
			}}
			return m, nil
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
	if _, ok := body["expires_in"].(float64); !ok {
		t.Error("missing expires_in")
	}
	main, ok := body["main"].(map[string]any)
	if !ok {
		t.Fatal("main not an object")
	}
	if u, _ := main["url"].(string); !strings.Contains(u, "X-Amz-Signature") {
		t.Errorf("main.url = %v, want presigned URL", main["url"])
	}
	subs, ok := body["subagents"].([]any)
	if !ok {
		t.Fatal("subagents not an array")
	}
	if len(subs) != 1 {
		t.Fatalf("expected 1 subagent, got %d", len(subs))
	}
	sub, _ := subs[0].(map[string]any)
	for _, k := range []string{"id", "name", "key", "url"} {
		if _, ok := sub[k]; !ok {
			t.Errorf("subagent missing %q", k)
		}
	}
}

func TestHandleGetBySession_NotFound(t *testing.T) {
	fake := &fakeService{
		getTranscriptFiles: func(_ context.Context, _ string) (TranscriptFilesResponse, error) {
			return TranscriptFilesResponse{}, ErrNoSessionTranscriptFound
		},
	}
	server := NewServer(fake)

	rec := doRequest(t, server, "/api/transcript/session/session-nonexistent-999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	errStr, _ := body["error"].(string)
	// The message must satisfy both e2e error matchers:
	// /session.*not.*found|no.*transcript.*found/i and /not found|error/i.
	if !strings.Contains(strings.ToLower(errStr), "not found") ||
		!strings.Contains(strings.ToLower(errStr), "session") {
		t.Errorf("error message should mention the session not being found, got %q", errStr)
	}
}

func TestHandleGetBySession_EmptySubagentsStaysArray(t *testing.T) {
	sessionID := "session-abc123"
	fake := &fakeService{
		getTranscriptFiles: func(_ context.Context, _ string) (TranscriptFilesResponse, error) {
			return manifestFor(sessionID), nil
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

func TestHandleGetBySession_S3ErrorReturns500(t *testing.T) {
	fake := &fakeService{
		getTranscriptFiles: func(_ context.Context, _ string) (TranscriptFilesResponse, error) {
			return TranscriptFilesResponse{}, errors.New("S3 connection failed")
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
		getTranscriptFiles: func(_ context.Context, got string) (TranscriptFilesResponse, error) {
			if got != sessionID {
				t.Errorf("service got %q, want %q (whitespace not trimmed)", got, sessionID)
			}
			return manifestFor(sessionID), nil
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
		getTranscriptFiles: func(_ context.Context, _ string) (TranscriptFilesResponse, error) {
			return manifestFor(sessionID), nil
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
