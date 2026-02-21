package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/gorilla/mux"
)

// SnapshotInfo describes a single configuration snapshot.
type SnapshotInfo struct {
	ID        string   `json:"id"`
	CreatedAt string   `json:"created_at"`
	Label     string   `json:"label,omitempty"`
	Files     []string `json:"files"`
	SizeBytes int64    `json:"size_bytes"`
}

// snapshotDir returns the base snapshots directory for an agent.
// Stored at: ~/.openclaw/snapshots/{agent_id}/
func snapshotDir(agentID string) string {
	openClawDir := config.GetOpenClawDir()
	return filepath.Join(openClawDir, "snapshots", agentID)
}

// resolveWorkspaceForAgent resolves the workspace directory for an agent.
// Returns empty string if not found.
func resolveWorkspaceForAgent(ca *config.Agent) string {
	openClawDir := config.GetOpenClawDir()
	agentID := ca.ID

	candidates := []string{
		filepath.Join(openClawDir, "workspace-"+agentID),
		filepath.Join(openClawDir, "workspace-"+ca.Name),
	}
	legacyDirs := config.GetLegacyDirs()
	if aliases, ok := legacyDirs[ca.Name]; ok {
		for _, alias := range aliases {
			candidates = append(candidates, filepath.Join(openClawDir, "workspace-"+alias))
		}
	}
	if agentID == "main" || ca.Name == "thunder" || ca.Name == "titan" {
		candidates = append(candidates, filepath.Join(openClawDir, "workspace"))
	}

	allowedBase := filepath.Clean(openClawDir)
	for _, c := range candidates {
		clean := filepath.Clean(c)
		if !strings.HasPrefix(clean, allowedBase) {
			continue
		}
		if info, err := os.Stat(clean); err == nil && info.IsDir() {
			return clean
		}
	}
	return ""
}

// snapshotFiles lists the files we capture in snapshots.
var snapshotFiles = []string{"SOUL.md", "MEMORY.md", "HEARTBEAT.md", "AGENTS.md", "TOOLS.md"}

// CreateSnapshotForAgent creates a snapshot of the agent's workspace files.
// This is called both from the REST handler and from UpdateAgentSoul (auto-save).
func CreateSnapshotForAgent(agentID string, label string) (*SnapshotInfo, error) {
	ca := config.GetAgentByID(agentID)
	if ca == nil {
		ca = config.GetAgent(agentID)
	}
	if ca == nil {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	workspaceDir := resolveWorkspaceForAgent(ca)
	if workspaceDir == "" {
		return nil, fmt.Errorf("workspace directory not found for agent: %s", agentID)
	}

	// Snapshot ID is a timestamp-based string: 20060102-150405
	now := time.Now().UTC()
	snapID := now.Format("20060102-150405")

	snapPath := filepath.Join(snapshotDir(ca.ID), snapID)
	if err := os.MkdirAll(snapPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create snapshot dir: %w", err)
	}

	// Write label file if provided
	if label != "" {
		_ = os.WriteFile(filepath.Join(snapPath, ".label"), []byte(label), 0644)
	}

	var copiedFiles []string
	var totalSize int64

	for _, fname := range snapshotFiles {
		src := filepath.Join(workspaceDir, fname)
		data, err := os.ReadFile(src)
		if err != nil {
			continue // file doesn't exist — skip silently
		}
		dst := filepath.Join(snapPath, fname)
		if err := os.WriteFile(dst, data, 0644); err != nil {
			return nil, fmt.Errorf("failed to write snapshot file %s: %w", fname, err)
		}
		copiedFiles = append(copiedFiles, fname)
		totalSize += int64(len(data))
	}

	if len(copiedFiles) == 0 {
		// Nothing to snapshot — clean up empty dir
		_ = os.RemoveAll(snapPath)
		return nil, fmt.Errorf("no workspace files found to snapshot")
	}

	return &SnapshotInfo{
		ID:        snapID,
		CreatedAt: now.Format(time.RFC3339),
		Label:     label,
		Files:     copiedFiles,
		SizeBytes: totalSize,
	}, nil
}

// listSnapshots returns all snapshots for an agent, newest first.
func listSnapshots(agentID string) ([]SnapshotInfo, error) {
	dir := snapshotDir(agentID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SnapshotInfo{}, nil
		}
		return nil, err
	}

	var result []SnapshotInfo
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		snapID := e.Name()
		snapPath := filepath.Join(dir, snapID)

		// Parse creation time from directory name
		t, err := time.Parse("20060102-150405", snapID)
		if err != nil {
			continue // not a snapshot dir we recognise
		}

		// List files in snapshot
		var files []string
		var totalSize int64
		subEntries, _ := os.ReadDir(snapPath)
		for _, sf := range subEntries {
			if sf.IsDir() || strings.HasPrefix(sf.Name(), ".") {
				continue
			}
			files = append(files, sf.Name())
			if info, err := sf.Info(); err == nil {
				totalSize += info.Size()
			}
		}

		// Read optional label
		label := ""
		if labelBytes, err := os.ReadFile(filepath.Join(snapPath, ".label")); err == nil {
			label = strings.TrimSpace(string(labelBytes))
		}

		result = append(result, SnapshotInfo{
			ID:        snapID,
			CreatedAt: t.UTC().Format(time.RFC3339),
			Label:     label,
			Files:     files,
			SizeBytes: totalSize,
		})
	}

	// Sort newest first
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID > result[j].ID
	})

	return result, nil
}

// --- HTTP Handlers ---

// GetSnapshots handles GET /api/agents/{id}/snapshots
func GetSnapshots(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	snaps, err := listSnapshots(ca.ID)
	if err != nil {
		http.Error(w, "Failed to list snapshots: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, snaps)
}

// CreateSnapshot handles POST /api/agents/{id}/snapshots
func CreateSnapshot(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	var req struct {
		Label string `json:"label"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	snap, err := CreateSnapshotForAgent(ca.ID, req.Label)
	if err != nil {
		http.Error(w, "Failed to create snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, snap)
}

// RestoreSnapshot handles POST /api/agents/{id}/snapshots/{snapshot_id}/restore
func RestoreSnapshot(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	snapshotID := vars["snapshot_id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	workspaceDir := resolveWorkspaceForAgent(ca)
	if workspaceDir == "" {
		http.Error(w, "Workspace directory not found for agent", http.StatusNotFound)
		return
	}

	// Validate snapshot ID format (prevent path traversal)
	if _, err := time.Parse("20060102-150405", snapshotID); err != nil {
		http.Error(w, "Invalid snapshot ID format", http.StatusBadRequest)
		return
	}

	snapPath := filepath.Join(snapshotDir(ca.ID), snapshotID)
	if _, err := os.Stat(snapPath); os.IsNotExist(err) {
		http.Error(w, "Snapshot not found", http.StatusNotFound)
		return
	}

	// Auto-create a pre-restore snapshot so the user can undo
	_, _ = CreateSnapshotForAgent(ca.ID, "pre-restore-"+snapshotID)

	// Restore files from snapshot to workspace
	entries, err := os.ReadDir(snapPath)
	if err != nil {
		http.Error(w, "Failed to read snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var restoredFiles []string
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		srcPath := filepath.Join(snapPath, e.Name())
		dstPath := filepath.Join(workspaceDir, e.Name())

		// Security: ensure destination is within workspace
		if !strings.HasPrefix(filepath.Clean(dstPath), filepath.Clean(workspaceDir)) {
			continue
		}

		srcFile, err := os.Open(srcPath)
		if err != nil {
			continue
		}
		dstFile, err := os.Create(dstPath)
		if err != nil {
			srcFile.Close()
			continue
		}
		_, copyErr := io.Copy(dstFile, srcFile)
		srcFile.Close()
		dstFile.Close()
		if copyErr == nil {
			restoredFiles = append(restoredFiles, e.Name())
		}
	}

	writeJSON(w, map[string]interface{}{
		"message":        "Snapshot restored",
		"snapshot_id":    snapshotID,
		"restored_files": restoredFiles,
	})
}
