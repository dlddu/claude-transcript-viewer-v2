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
	GetTranscript(ctx context.Context, id string) (Transcript, error)
	GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error)
	ListTranscripts(ctx context.Context) ([]string, error)
}

type Server struct {
	svc TranscriptService
	mux *http.ServeMux
}

func NewServer(svc TranscriptService) *Server {
	s := &Server{svc: svc, mux: http.NewServeMux()}
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
		s.mux.HandleFunc("GET "+base+"/{id}", s.handleGetByID)
		s.mux.HandleFunc("GET "+base+"/session/{sessionId}", s.handleGetBySession)
	}

	s.mux.HandleFunc("/", s.handle404)
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

func (s *Server) handleGetByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Transcript ID is required"})
		return
	}
	transcript, err := s.svc.GetTranscript(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrTranscriptNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Transcript not found"})
			return
		}
		log.Printf("Error fetching transcript: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch transcript"})
		return
	}
	writeJSON(w, http.StatusOK, transcript)
}

func (s *Server) handleGetBySession(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("sessionId"))
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		return
	}
	transcript, err := s.svc.GetTranscriptBySessionId(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, ErrNoSessionTranscriptFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Transcript not found"})
			return
		}
		if errors.Is(err, ErrSessionIDRequired) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
			return
		}
		log.Printf("Error fetching transcript by session ID: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch transcript"})
		return
	}
	writeJSON(w, http.StatusOK, transcript)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error writing JSON: %v", err)
	}
}
