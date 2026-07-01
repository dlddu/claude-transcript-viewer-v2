package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeStaticFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatalf("mkdir assets: %v", err)
	}
	files := map[string]string{
		"index.html":              "<!DOCTYPE html><html><body>viewer</body></html>",
		"assets/app-abc123.js":    "console.log('app')",
		filepath.Join("vite.svg"): "<svg></svg>",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return dir
}

func TestStatic_ServesIndexAtRoot(t *testing.T) {
	server := NewServer(&fakeService{}, WithStaticDir(writeStaticFixture(t)))

	rec := doRequest(t, server, "/")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<!DOCTYPE html>") {
		t.Errorf("body = %q, want index.html content", rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control = %q, want no-cache", got)
	}
}

func TestStatic_ServesExistingFile(t *testing.T) {
	server := NewServer(&fakeService{}, WithStaticDir(writeStaticFixture(t)))

	rec := doRequest(t, server, "/vite.svg")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "<svg></svg>" {
		t.Errorf("body = %q, want file content", got)
	}
}

func TestStatic_HashedAssetsAreImmutable(t *testing.T) {
	server := NewServer(&fakeService{}, WithStaticDir(writeStaticFixture(t)))

	rec := doRequest(t, server, "/assets/app-abc123.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Errorf("Cache-Control = %q, want immutable", got)
	}
}

func TestStatic_FallsBackToIndexForClientRoutes(t *testing.T) {
	server := NewServer(&fakeService{}, WithStaticDir(writeStaticFixture(t)))

	for _, route := range []string{"/session/session-abc123", "/lookup", "/deep/nested/route"} {
		rec := doRequest(t, server, route)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s status = %d, want 200", route, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "<!DOCTYPE html>") {
			t.Errorf("GET %s body = %q, want index.html fallback", route, rec.Body.String())
		}
	}
}

func TestStatic_PathTraversalStaysInRoot(t *testing.T) {
	dir := writeStaticFixture(t)
	secret := filepath.Join(filepath.Dir(dir), "secret.txt")
	if err := os.WriteFile(secret, []byte("top secret"), 0o644); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	server := NewServer(&fakeService{}, WithStaticDir(dir))

	rec := doRequest(t, server, "/../secret.txt")
	if strings.Contains(rec.Body.String(), "top secret") {
		t.Error("path traversal escaped the static root")
	}
}

func TestStatic_UnknownAPIPathStaysJSON404(t *testing.T) {
	server := NewServer(&fakeService{}, WithStaticDir(writeStaticFixture(t)))

	rec := doRequest(t, server, "/api/nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["error"] != "Not found" {
		t.Errorf("error = %v, want %q", body["error"], "Not found")
	}
}

func TestStatic_APIRoutesTakePrecedence(t *testing.T) {
	fake := &fakeService{}
	server := NewServer(fake, WithStaticDir(writeStaticFixture(t)))

	rec := doRequest(t, server, "/api/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["status"] != "healthy" {
		t.Errorf("status = %v, want healthy", body["status"])
	}
}

func TestStatic_DisabledWithoutStaticDir(t *testing.T) {
	server := NewServer(&fakeService{})

	rec := doRequest(t, server, "/")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := decodeResponse(t, rec.Body.Bytes())
	if body["error"] != "Not found" {
		t.Errorf("error = %v, want %q", body["error"], "Not found")
	}
}
