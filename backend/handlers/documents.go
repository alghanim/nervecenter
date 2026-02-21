package handlers

import (
	"encoding/base64"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type DocumentsHandler struct{}

// Allowed directories for document browsing
var allowedDirs = []string{
	"/home/aalghanim/agentboard/",
	"/home/aalghanim/.openclaw/workspace/",
}

// Allowed file extensions
var allowedExts = map[string]string{
	".md":  "markdown",
	".pdf": "pdf",
	".png": "image",
	".jpg": "image",
	".jpeg": "image",
	".txt": "text",
}

type DocumentInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
	Ext      string `json:"ext"`
	Modified string `json:"modified"`
}

func isPathAllowed(p string) bool {
	cleaned := filepath.Clean(p)
	for _, dir := range allowedDirs {
		if strings.HasPrefix(cleaned, filepath.Clean(dir)) {
			return true
		}
	}
	return false
}

// ListDocuments handles GET /api/documents
func (h *DocumentsHandler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	var docs []DocumentInfo

	// Scan patterns
	patterns := []string{
		"/home/aalghanim/agentboard/*.md",
		"/home/aalghanim/.openclaw/workspace/brand-samples/*.png",
		"/home/aalghanim/.openclaw/workspace/brand-samples/*.jpg",
		"/home/aalghanim/.openclaw/workspace/*.pdf",
	}

	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, m := range matches {
			info, err := os.Stat(m)
			if err != nil || info.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(m))
			fileType, ok := allowedExts[ext]
			if !ok {
				continue
			}
			docs = append(docs, DocumentInfo{
				Name:     info.Name(),
				Path:     m,
				Size:     info.Size(),
				Type:     fileType,
				Ext:      strings.TrimPrefix(ext, "."),
				Modified: info.ModTime().Format(time.RFC3339),
			})
		}
	}

	if docs == nil {
		docs = []DocumentInfo{}
	}
	respondJSON(w, http.StatusOK, docs)
}

// GetDocumentContent handles GET /api/documents/content?path=...
func (h *DocumentsHandler) GetDocumentContent(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if p == "" {
		respondError(w, http.StatusBadRequest, "path parameter required")
		return
	}

	cleaned := filepath.Clean(p)
	if !isPathAllowed(cleaned) {
		respondError(w, http.StatusForbidden, "access denied")
		return
	}

	info, err := os.Stat(cleaned)
	if err != nil {
		respondError(w, http.StatusNotFound, "file not found")
		return
	}

	ext := strings.ToLower(filepath.Ext(cleaned))
	fileType := allowedExts[ext]

	switch fileType {
	case "markdown", "text":
		data, err := ioutil.ReadFile(cleaned)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to read file")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"type":     fileType,
			"content":  string(data),
			"name":     info.Name(),
			"path":     cleaned,
			"modified": info.ModTime().Format(time.RFC3339),
			"size":     info.Size(),
		})

	case "image":
		data, err := ioutil.ReadFile(cleaned)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to read file")
			return
		}
		mime := "image/png"
		if ext == ".jpg" || ext == ".jpeg" {
			mime = "image/jpeg"
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"type":     "image",
			"content":  "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data),
			"name":     info.Name(),
			"path":     cleaned,
			"modified": info.ModTime().Format(time.RFC3339),
			"size":     info.Size(),
		})

	case "pdf":
		data, err := ioutil.ReadFile(cleaned)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to read file")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"type":     "pdf",
			"content":  "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(data),
			"name":     info.Name(),
			"path":     cleaned,
			"modified": info.ModTime().Format(time.RFC3339),
			"size":     info.Size(),
		})

	default:
		respondError(w, http.StatusBadRequest, "unsupported file type")
	}
}
