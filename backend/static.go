package main

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// spaHandler serves the built frontend from a directory. Paths that do not
// resolve to a file fall back to index.html so client-side routing works.
type spaHandler struct {
	root  string
	files http.Handler
}

func newSPAHandler(root string) *spaHandler {
	return &spaHandler{root: root, files: http.FileServer(http.Dir(root))}
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Clean to a rooted path so ".." cannot escape the static root.
	p := path.Clean("/" + r.URL.Path)

	full := filepath.Join(h.root, filepath.FromSlash(p))
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		// Vite rewrites index.html on every build, so clients must revalidate.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(h.root, "index.html"))
		return
	}

	// Vite emits content-hashed filenames under assets/.
	if strings.HasPrefix(p, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	r.URL.Path = p
	h.files.ServeHTTP(w, r)
}
