package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
)

// maxUploadBytes caps the total size of an upload request body.
const maxUploadBytes = 64 << 20 // 64 MiB

// TranscriptService is the interface the HTTP layer needs from the
// underlying storage. Tests use a fake; production wires in *S3Service.
type TranscriptService interface {
	GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error)
	ListTranscripts(ctx context.Context) ([]string, error)
	UploadTranscript(ctx context.Context, in UploadInput) (string, error)
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
		s.mux.HandleFunc("POST "+base, s.handleUpload)
		s.mux.HandleFunc("POST "+base+"/{$}", s.handleUpload)
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

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid or too large multipart form"})
		return
	}

	sessionID := strings.TrimSpace(r.FormValue("sessionId"))
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Main transcript file is required"})
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to read uploaded file"})
		return
	}

	input := UploadInput{SessionID: sessionID, Content: content}
	if r.MultipartForm != nil {
		for _, fh := range r.MultipartForm.File["subagents"] {
			sf, err := fh.Open()
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to read subagent file"})
				return
			}
			b, err := io.ReadAll(sf)
			sf.Close()
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to read subagent file"})
				return
			}
			input.Subagents = append(input.Subagents, SubagentUpload{ID: fh.Filename, Content: b})
		}
	}

	key, err := s.svc.UploadTranscript(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionIDRequired):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Session ID is required"})
		case errors.Is(err, ErrEmptyTranscript), errors.Is(err, ErrInvalidTranscript):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		default:
			log.Printf("Error uploading transcript: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to upload transcript"})
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"session_id": sessionID,
		"s3_key":     key,
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error writing JSON: %v", err)
	}
}
