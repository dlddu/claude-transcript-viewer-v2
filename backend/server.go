package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
)

// TranscriptService is the interface the HTTP layer needs from the
// underlying storage. Tests use a fake; production wires in *S3Service.
type TranscriptService interface {
	GetTranscriptFiles(ctx context.Context, sessionID string) (TranscriptFilesResponse, error)
	ListTranscripts(ctx context.Context) ([]string, error)
	CreateUploadURL(ctx context.Context, req UploadURLRequest) (UploadURLResponse, error)
}

type Server struct {
	svc       TranscriptService
	mux       *http.ServeMux
	staticDir string
}

// ServerOption configures optional Server behavior.
type ServerOption func(*Server)

// WithStaticDir serves the built frontend from dir on non-/api routes, with
// an index.html fallback for client-side routing.
func WithStaticDir(dir string) ServerOption {
	return func(s *Server) { s.staticDir = dir }
}

func NewServer(svc TranscriptService, opts ...ServerOption) *Server {
	s := &Server{svc: svc, mux: http.NewServeMux()}
	for _, opt := range opts {
		opt(s)
	}
	s.registerRoutes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /api/health", s.handleHealth)

	for _, base := range []string{"/api/transcripts", "/api/transcript"} {
		s.mux.HandleFunc("GET "+base, s.handleList)
		s.mux.HandleFunc("GET "+base+"/{$}", s.handleList)
		s.mux.HandleFunc("GET "+base+"/session/{sessionId}", s.handleGetBySession)
		s.mux.HandleFunc("POST "+base+"/upload-url/{sessionId}", s.handleCreateUploadURL)
	}

	// Unknown API paths always get a JSON 404, even when static serving is on.
	s.mux.HandleFunc("/api/", s.handle404)

	if s.staticDir != "" {
		s.mux.Handle("/", newSPAHandler(s.staticDir))
	} else {
		s.mux.HandleFunc("/", s.handle404)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

func (s *Server) handle404(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	ids, err := s.svc.ListTranscripts(r.Context())
	if err != nil {
		log.Printf("Error listing transcripts: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to list transcripts"})
		return
	}
	writeJSON(w, http.StatusOK, ids)
}

func (s *Server) handleGetBySession(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("sessionId"))
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		return
	}
	files, err := s.svc.GetTranscriptFiles(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, ErrNoSessionTranscriptFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": ErrNoSessionTranscriptFound.Error()})
			return
		}
		if errors.Is(err, ErrSessionIDRequired) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
			return
		}
		log.Printf("Error fetching transcript files by session ID: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch transcript"})
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (s *Server) handleCreateUploadURL(w http.ResponseWriter, r *http.Request) {
	req := UploadURLRequest{
		SessionID: strings.TrimSpace(r.PathValue("sessionId")),
		FileName:  strings.TrimSpace(r.URL.Query().Get("file_name")),
	}

	resp, err := s.svc.CreateUploadURL(r.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionIDRequired):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		case errors.Is(err, ErrSessionIDInvalid):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": ErrSessionIDInvalid.Error()})
		case errors.Is(err, ErrUploadNameInvalid):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": ErrUploadNameInvalid.Error()})
		default:
			log.Printf("Error creating upload URL: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create upload URL"})
		}
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error writing JSON: %v", err)
	}
}
