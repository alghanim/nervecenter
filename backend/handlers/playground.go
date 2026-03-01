package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

// SendAgentMessage forwards a message to an agent via webhook or OpenClaw API
func SendAgentMessage(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]
	var req struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Message == "" {
		respondError(w, 400, "message required")
		return
	}

	// Try OpenClaw API first
	openclawBase := os.Getenv("OPENCLAW_API_URL")
	if openclawBase == "" {
		openclawBase = "http://localhost:4444"
	}

	// Send via OpenClaw session API
	payload := map[string]interface{}{
		"message":  req.Message,
		"agent_id": agentID,
	}
	body, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(openclawBase+"/api/sessions/"+agentID+"/message", "application/json", bytes.NewReader(body))
	if err != nil {
		// Fallback: check if agent has a webhook configured
		var webhookURL string
		db.DB.QueryRow(`SELECT url FROM webhooks WHERE name = $1 AND active = true LIMIT 1`, agentID).Scan(&webhookURL)
		if webhookURL != "" {
			resp, err = client.Post(webhookURL, "application/json", bytes.NewReader(body))
			if err != nil {
				respondError(w, 502, "failed to reach agent: "+err.Error())
				return
			}
		} else {
			respondError(w, 502, "agent unreachable and no webhook configured")
			return
		}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// Log the interaction
	logActivity(agentID, "playground_message", "", map[string]string{
		"message": req.Message,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}
