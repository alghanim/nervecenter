package handlers

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type AgentControlHandler struct{}

// Kill handles POST /api/agents/{id}/kill
func (h *AgentControlHandler) Kill(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := writeSignalFile(id, "KILL"); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updateAgentDBStatus(id, "killed")
	logActivity(id, "killed", "", nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Kill signal sent", "status": "killed"})
}

// Pause handles POST /api/agents/{id}/pause
func (h *AgentControlHandler) Pause(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := writeSignalFile(id, "PAUSE"); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updateAgentDBStatus(id, "paused")
	logActivity(id, "paused", "", nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Pause signal sent", "status": "paused"})
}

// Resume handles POST /api/agents/{id}/resume
func (h *AgentControlHandler) Resume(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	// Remove both signal files
	removeSignalFile(id, "PAUSE")
	removeSignalFile(id, "KILL")
	updateAgentDBStatus(id, "idle")
	logActivity(id, "resumed", "", nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Agent resumed", "status": "idle"})
}

func writeSignalFile(agentID, signal string) error {
	openClawDir := config.GetOpenClawDir()
	wsDir := filepath.Join(openClawDir, "workspace-"+agentID)
	// Create workspace dir if it doesn't exist
	os.MkdirAll(wsDir, 0755)
	return os.WriteFile(filepath.Join(wsDir, signal), []byte(signal+"\n"), 0644)
}

func removeSignalFile(agentID, signal string) {
	openClawDir := config.GetOpenClawDir()
	wsDir := filepath.Join(openClawDir, "workspace-"+agentID)
	os.Remove(filepath.Join(wsDir, signal))
}

func updateAgentDBStatus(agentID, status string) {
	db.DB.Exec(`UPDATE agents SET status = $1, last_active = NOW() WHERE id = $2`, status, agentID)
}
