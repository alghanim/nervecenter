package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/alghanim/agentboard/backend/db"
)

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(data)
}

func respondError(w http.ResponseWriter, code int, message string) {
	respondJSON(w, code, map[string]string{"error": message})
}

func getAgentFromContext(r *http.Request) string {
	if agent := r.Header.Get("X-Agent-ID"); agent != "" {
		return agent
	}
	return "system"
}

func logActivity(agentID, action, taskID string, details map[string]string) {
	var detailsJSON []byte
	if details != nil {
		detailsJSON, _ = json.Marshal(details)
	}
	db.DB.Exec(
		`INSERT INTO activity_log (agent_id, action, task_id, details) VALUES ($1, $2, NULLIF($3,'')::uuid, $4)`,
		agentID, action, taskID, detailsJSON,
	)

	// Fire agent_error webhook for error/fail actions
	lower := strings.ToLower(action)
	if strings.Contains(lower, "error") || strings.Contains(lower, "fail") {
		payload := map[string]interface{}{
			"agent_id": agentID,
			"action":   action,
			"task_id":  taskID,
		}
		for k, v := range details {
			payload[k] = v
		}
		go TriggerWebhooks("agent_error", payload)
	}
}

func calculateSuccessRate(completed, failed int) float64 {
	total := completed + failed
	if total == 0 {
		return 0.0
	}
	return float64(completed) / float64(total) * 100.0
}
