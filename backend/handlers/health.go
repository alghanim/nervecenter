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

// getLatestSessionMtime returns the modification time of the most recently
// modified .jsonl session file for the given agent, or nil if none found.
// It checks {openclawDir}/agents/{agentID}/sessions/ and for thunder/main/titan
// also falls back to {openclawDir}/agents/main/sessions/ (same logic as soul files).
func getLatestSessionMtime(agentID string) *time.Time {
	openClawDir := config.GetOpenClawDir()

	// Candidate session directories to check
	sessionDirs := []string{
		filepath.Join(openClawDir, "agents", agentID, "sessions"),
	}
	// Special case: thunder and titan are aliases for the main agent's sessions
	if agentID == "thunder" || agentID == "main" || agentID == "titan" {
		mainSessions := filepath.Join(openClawDir, "agents", "main", "sessions")
		// Avoid duplicate if agentID is already "main"
		if agentID != "main" {
			sessionDirs = append(sessionDirs, mainSessions)
		}
	}

	var latest *time.Time
	for _, dir := range sessionDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if len(name) < 6 || name[len(name)-6:] != ".jsonl" {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			mt := info.ModTime()
			if latest == nil || mt.After(*latest) {
				t := mt
				latest = &t
			}
		}
	}
	return latest
}

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

	row := db.DB.QueryRow(`SELECT status, COALESCE(auto_restart, false) FROM agents WHERE id = $1`, id)
	err := row.Scan(&status, &autoRestart)
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

	// Get last activity from activity_log (the real "last seen")
	var lastActivity *time.Time
	actRow := db.DB.QueryRow(`SELECT MAX(created_at) FROM activity_log WHERE agent_id = $1`, id)
	actRow.Scan(&lastActivity)

	// Also check OpenClaw session JSONL file mtimes — agents like thunder may have
	// zero activity_log entries even when actively running (e.g. all actions logged
	// as "system"). Use whichever timestamp is more recent.
	if sessionMtime := getLatestSessionMtime(id); sessionMtime != nil {
		if lastActivity == nil || sessionMtime.After(*lastActivity) {
			lastActivity = sessionMtime
		}
	}

	checks := []HealthCheck{}
	now := time.Now()

	// Check 1: Recent Activity (replaces heartbeat)
	activityPassed := true
	activityMsg := ""
	if lastActivity == nil {
		// No activity at all — neutral state, not failure
		activityPassed = true
		activityMsg = "No activity recorded"
	} else {
		age := now.Sub(*lastActivity)
		switch {
		case age < 15*time.Minute:
			activityPassed = true
			activityMsg = fmt.Sprintf("Active %d minutes ago", int(age.Minutes()))
			if age < time.Minute {
				activityMsg = fmt.Sprintf("Active %d seconds ago", int(age.Seconds()))
			}
		case age < 24*time.Hour:
			activityPassed = true
			if age < time.Hour {
				activityMsg = fmt.Sprintf("Last active %d minutes ago", int(age.Minutes()))
			} else {
				activityMsg = fmt.Sprintf("Last active %d hours ago", int(age.Hours()))
			}
		default:
			activityPassed = false
			days := int(age.Hours() / 24)
			activityMsg = fmt.Sprintf("Last active %d days ago", days)
		}
	}
	checks = append(checks, HealthCheck{Name: "recent_activity", Passed: activityPassed, Message: activityMsg})

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
	// Build workspace candidates — same special-case as soul file resolution
	wsCandidates := []string{filepath.Join(openClawDir, "workspace-"+id)}
	if id == "thunder" || id == "main" || id == "titan" {
		wsCandidates = append(wsCandidates, filepath.Join(openClawDir, "workspace"))
	}
	var resolvedWsDir string
	for _, c := range wsCandidates {
		if _, statErr := os.Stat(c); statErr == nil {
			resolvedWsDir = c
			break
		}
	}
	if resolvedWsDir != "" {
		workspacePassed = true
		workspaceMsg = fmt.Sprintf("Workspace found: %s", resolvedWsDir)
	} else {
		workspaceMsg = fmt.Sprintf("Workspace directory not found: %s", wsCandidates[0])
	}
	checks = append(checks, HealthCheck{Name: "workspace", Passed: workspacePassed, Message: workspaceMsg})

	// Check 4: No KILL signal file present
	killPassed := true
	killMsg := "No kill signal present"
	if resolvedWsDir != "" {
		killFile := filepath.Join(resolvedWsDir, "KILL")
		if _, statErr := os.Stat(killFile); statErr == nil {
			killPassed = false
			killMsg = "KILL signal file is present"
		}
	}
	checks = append(checks, HealthCheck{Name: "kill_signal", Passed: killPassed, Message: killMsg})

	// Determine overall health: healthy unless killed/paused or inactive >24h
	healthy := activityPassed && statusOK

	// Use the agent's DB status directly for consistency with header badge
	// Only override if there's a real problem
	displayStatus := status

	// Thunder is the orchestrator — always online
	if id == "thunder" {
		displayStatus = "online"
		if status != "online" {
			db.DB.Exec(`UPDATE agents SET status = 'online' WHERE id = $1`, id)
		}
		healthy = true
	} else if status == "offline" && lastActivity != nil && now.Sub(*lastActivity) < 24*time.Hour {
		// Agent has recent activity but status says offline — show as idle instead
		displayStatus = "idle"
		db.DB.Exec(`UPDATE agents SET status = 'idle' WHERE id = $1 AND status = 'offline'`, id)
	}

	return AgentHealth{
		AgentID:     id,
		Status:      displayStatus,
		LastSeen:    lastActivity,
		Healthy:     healthy,
		Checks:      checks,
		AutoRestart: autoRestart,
	}
}

// determineStatusFromHealth returns the new status to set (or "" if no change needed)
func determineStatusFromHealth(health AgentHealth) string {
	// Thunder is the orchestrator — never downgrade
	if health.AgentID == "thunder" {
		return ""
	}

	// Only auto-downgrade agents that are "online" or "degraded" or "idle"
	if health.Status != "online" && health.Status != "degraded" && health.Status != "idle" {
		return ""
	}

	if health.LastSeen == nil {
		// No activity ever — set to idle (not offline)
		if health.Status != "idle" {
			return "idle"
		}
		return ""
	}

	age := time.Since(*health.LastSeen)
	if age > 24*time.Hour {
		return "offline"
	}
	// Within 24h — keep current status, don't downgrade
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
