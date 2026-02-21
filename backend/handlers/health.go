package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

// ─── Health types ───────────────────────────────────────────────────────────

type HealthCheck struct {
	Name    string `json:"name"`
	Passed  bool   `json:"passed"`
	Message string `json:"message"`
}

type AgentHealth struct {
	AgentID   string        `json:"agent_id"`
	Status    string        `json:"status"`
	LastSeen  *time.Time    `json:"last_seen"`
	Healthy   bool          `json:"healthy"`
	Checks    []HealthCheck `json:"checks"`
	AutoRestart bool        `json:"auto_restart"`
}

// ─── GET /api/agents/{id}/health ────────────────────────────────────────────

type HealthHandler struct{}

func (h *HealthHandler) GetAgentHealth(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	health := computeAgentHealth(id)
	respondJSON(w, http.StatusOK, health)
}

// ─── POST /api/agents/{id}/health/check ─────────────────────────────────────

func (h *HealthHandler) ForceHealthCheck(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	health := computeAgentHealth(id)

	// Update status in DB based on health result
	newStatus := determineStatusFromHealth(health)
	if newStatus != "" {
		db.DB.Exec(`UPDATE agents SET status = $1 WHERE id = $2`, newStatus, id)
		health.Status = newStatus
	}

	// Auto-restart if unhealthy and enabled
	if !health.Healthy && health.AutoRestart {
		if err := writeSignalFile(id, "RESTART"); err != nil {
			log.Printf("health: failed to write RESTART for %s: %v", id, err)
		} else {
			logActivity(id, "auto_restart_triggered", "", map[string]string{"reason": "health_check_failed"})
		}
	}

	respondJSON(w, http.StatusOK, health)
}

// ─── POST /api/agents/{id}/health/auto-restart ──────────────────────────────

func (h *HealthHandler) SetAutoRestart(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid body")
		return
	}

	_, err := db.DB.Exec(`UPDATE agents SET auto_restart = $1 WHERE id = $2`, body.Enabled, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	action := "auto_restart_disabled"
	if body.Enabled {
		action = "auto_restart_enabled"
	}
	logActivity(id, action, "", nil)
	respondJSON(w, http.StatusOK, map[string]interface{}{"auto_restart": body.Enabled})
}

// ─── Core health computation ─────────────────────────────────────────────────

func computeAgentHealth(id string) AgentHealth {
	var status string
	var autoRestart bool
	var lastActive *time.Time

	row := db.DB.QueryRow(`SELECT status, COALESCE(auto_restart, false), last_active FROM agents WHERE id = $1`, id)
	var lastActiveNullable *time.Time
	err := row.Scan(&status, &autoRestart, &lastActiveNullable)
	if err != nil {
		return AgentHealth{
			AgentID: id,
			Status:  "unknown",
			Healthy: false,
			Checks: []HealthCheck{
				{Name: "agent_exists", Passed: false, Message: "Agent not found in database"},
			},
		}
	}
	lastActive = lastActiveNullable

	checks := []HealthCheck{}
	now := time.Now()

	// Check 1: Heartbeat recency
	heartbeatPassed := true
	heartbeatMsg := "Heartbeat is recent"
	if lastActive == nil {
		heartbeatPassed = false
		heartbeatMsg = "No heartbeat recorded"
	} else {
		age := now.Sub(*lastActive)
		if age > 15*time.Minute {
			heartbeatPassed = false
			heartbeatMsg = fmt.Sprintf("Last heartbeat %.0f minutes ago (threshold: 15m)", age.Minutes())
		} else if age > 5*time.Minute {
			heartbeatPassed = false
			heartbeatMsg = fmt.Sprintf("Last heartbeat %.0f minutes ago (threshold: 5m for healthy)", age.Minutes())
		} else {
			heartbeatMsg = fmt.Sprintf("Last heartbeat %.0f seconds ago", age.Seconds())
		}
	}
	checks = append(checks, HealthCheck{Name: "heartbeat", Passed: heartbeatPassed, Message: heartbeatMsg})

	// Check 2: Status is valid (not killed/paused)
	statusOK := status != "killed" && status != "paused"
	statusMsg := fmt.Sprintf("Agent status: %s", status)
	if !statusOK {
		statusMsg = fmt.Sprintf("Agent is %s (not running)", status)
	}
	checks = append(checks, HealthCheck{Name: "status", Passed: statusOK, Message: statusMsg})

	// Check 3: Workspace exists
	workspacePassed := false
	workspaceMsg := "Workspace not configured"
	openClawDir := config.GetOpenClawDir()
	wsDir := filepath.Join(openClawDir, "workspace-"+id)
	if _, statErr := os.Stat(wsDir); statErr == nil {
		workspacePassed = true
		workspaceMsg = fmt.Sprintf("Workspace found: %s", wsDir)
	} else {
		workspaceMsg = fmt.Sprintf("Workspace directory not found: %s", wsDir)
	}
	checks = append(checks, HealthCheck{Name: "workspace", Passed: workspacePassed, Message: workspaceMsg})

	// Check 4: No KILL signal file present
	killPassed := true
	killMsg := "No kill signal present"
	killFile := filepath.Join(openClawDir, "workspace-"+id, "KILL")
	if _, statErr := os.Stat(killFile); statErr == nil {
		killPassed = false
		killMsg = "KILL signal file is present"
	}
	checks = append(checks, HealthCheck{Name: "kill_signal", Passed: killPassed, Message: killMsg})

	// Determine overall health
	healthy := heartbeatPassed && statusOK

	return AgentHealth{
		AgentID:     id,
		Status:      status,
		LastSeen:    lastActive,
		Healthy:     healthy,
		Checks:      checks,
		AutoRestart: autoRestart,
	}
}

// determineStatusFromHealth returns the new status to set (or "" if no change needed)
func determineStatusFromHealth(health AgentHealth) string {
	// Only auto-downgrade agents that are "online" or "degraded"
	if health.Status != "online" && health.Status != "degraded" {
		return ""
	}

	// Find heartbeat check
	var heartbeatAge time.Duration
	for _, c := range health.Checks {
		if c.Name == "heartbeat" && !c.Passed {
			// Parse from last_seen
			if health.LastSeen != nil {
				heartbeatAge = time.Since(*health.LastSeen)
			}
		}
	}

	if health.LastSeen == nil || heartbeatAge > 15*time.Minute {
		return "offline"
	}
	if heartbeatAge > 5*time.Minute && health.Status == "online" {
		return "degraded"
	}
	return ""
}

// ─── Background health checker goroutine ─────────────────────────────────────

func StartHealthChecker() {
	log.Println("🏥 Health checker started (interval: 2 minutes)")
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		runAllHealthChecks()
	}
}

func runAllHealthChecks() {
	rows, err := db.DB.Query(`
		SELECT id, status FROM agents
		WHERE status IN ('online', 'degraded', 'busy', 'idle')
	`)
	if err != nil {
		log.Printf("health: failed to query agents: %v", err)
		return
	}
	defer rows.Close()

	type agentRow struct {
		id     string
		status string
	}
	var agents []agentRow
	for rows.Next() {
		var a agentRow
		rows.Scan(&a.id, &a.status)
		agents = append(agents, a)
	}

	for _, a := range agents {
		health := computeAgentHealth(a.id)
		newStatus := determineStatusFromHealth(health)

		if newStatus != "" && newStatus != a.status {
			db.DB.Exec(`UPDATE agents SET status = $1 WHERE id = $2`, newStatus, a.id)
			logActivity(a.id, "health_status_changed", "", map[string]string{
				"from":   a.status,
				"to":     newStatus,
				"reason": "health_check",
			})
			log.Printf("health: %s: %s → %s", a.id, a.status, newStatus)
		}

		// Auto-restart on health failure
		if !health.Healthy && health.AutoRestart {
			wsDir := filepath.Join(config.GetOpenClawDir(), "workspace-"+a.id)
			restartFile := filepath.Join(wsDir, "RESTART")
			// Only write if not already present
			if _, statErr := os.Stat(restartFile); os.IsNotExist(statErr) {
				os.MkdirAll(wsDir, 0755)
				os.WriteFile(restartFile, []byte("RESTART\n"), 0644)
				logActivity(a.id, "auto_restart_triggered", "", map[string]string{
					"reason": "background_health_check",
				})
				log.Printf("health: wrote RESTART signal for %s", a.id)
			}
		}
	}
}
