package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/alghanim/agentboard/backend/websocket"
)

// StartAlertEvaluator runs alert rule evaluation every 60 seconds.
func StartAlertEvaluator(hub *websocket.Hub) {
	log.Println("[alerts] Alert evaluator started")
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	// Run immediately on start
	evaluateAlerts(hub)

	for range ticker.C {
		evaluateAlerts(hub)
	}
}

// evaluateAlerts checks all enabled alert rules.
func evaluateAlerts(hub *websocket.Hub) {
	rows, err := db.DB.Query(`
		SELECT id, name, agent_id, condition_type, threshold, notify_webhook_id
		FROM alert_rules
		WHERE enabled = true
	`)
	if err != nil {
		log.Printf("[alerts] Error loading rules: %v", err)
		return
	}
	defer rows.Close()

	type ruleRow struct {
		ID              string
		Name            string
		AgentID         sql.NullString
		ConditionType   string
		Threshold       int
		WebhookID       sql.NullString
	}

	var rules []ruleRow
	for rows.Next() {
		var r ruleRow
		if err := rows.Scan(&r.ID, &r.Name, &r.AgentID, &r.ConditionType, &r.Threshold, &r.WebhookID); err != nil {
			continue
		}
		rules = append(rules, r)
	}
	rows.Close()

	for _, rule := range rules {
		switch rule.ConditionType {
		case "no_heartbeat":
			evaluateNoHeartbeat(hub, rule.ID, rule.Name, rule.AgentID, rule.Threshold, rule.WebhookID)
		case "error_rate":
			evaluateErrorRate(hub, rule.ID, rule.Name, rule.AgentID, rule.Threshold, rule.WebhookID)
		case "task_stuck":
			evaluateTaskStuck(hub, rule.ID, rule.Name, rule.AgentID, rule.Threshold, rule.WebhookID)
		}
	}
}

// evaluateNoHeartbeat checks if an agent hasn't been active in N minutes.
func evaluateNoHeartbeat(hub *websocket.Hub, ruleID, ruleName string, agentID sql.NullString, thresholdMinutes int, webhookID sql.NullString) {
	cutoff := time.Now().Add(-time.Duration(thresholdMinutes) * time.Minute)

	var query string
	var args []interface{}

	if agentID.Valid && agentID.String != "" {
		query = `
			SELECT id, COALESCE(last_active, NOW() - INTERVAL '999 days')
			FROM agents
			WHERE id = $1 AND (last_active IS NULL OR last_active < $2)
			AND status != 'offline'
		`
		args = []interface{}{agentID.String, cutoff}
	} else {
		query = `
			SELECT id, COALESCE(last_active, NOW() - INTERVAL '999 days')
			FROM agents
			WHERE (last_active IS NULL OR last_active < $1)
			AND status != 'offline'
		`
		args = []interface{}{cutoff}
	}

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		log.Printf("[alerts] no_heartbeat query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var agID string
		var lastActive time.Time
		if err := rows.Scan(&agID, &lastActive); err != nil {
			continue
		}
		msg := fmt.Sprintf("Agent '%s' has not sent a heartbeat in %d minutes (last active: %s)",
			agID, thresholdMinutes, lastActive.Format(time.RFC3339))
		insertAlertAndNotify(hub, ruleID, ruleName, agID, msg, webhookID)
	}
}

// evaluateErrorRate checks if an agent has too many errors in the last hour.
func evaluateErrorRate(hub *websocket.Hub, ruleID, ruleName string, agentID sql.NullString, threshold int, webhookID sql.NullString) {
	cutoff := time.Now().Add(-time.Hour)

	var query string
	var args []interface{}

	if agentID.Valid && agentID.String != "" {
		query = `
			SELECT agent_id, COUNT(*) as err_count
			FROM activity_log
			WHERE agent_id = $1
			  AND created_at >= $2
			  AND (action ILIKE '%error%' OR action ILIKE '%fail%')
			GROUP BY agent_id
			HAVING COUNT(*) > $3
		`
		args = []interface{}{agentID.String, cutoff, threshold}
	} else {
		query = `
			SELECT agent_id, COUNT(*) as err_count
			FROM activity_log
			WHERE created_at >= $1
			  AND (action ILIKE '%error%' OR action ILIKE '%fail%')
			GROUP BY agent_id
			HAVING COUNT(*) > $2
		`
		args = []interface{}{cutoff, threshold}
	}

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		log.Printf("[alerts] error_rate query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var agID string
		var errCount int
		if err := rows.Scan(&agID, &errCount); err != nil {
			continue
		}
		msg := fmt.Sprintf("Agent '%s' has %d errors in the last hour (threshold: %d)",
			agID, errCount, threshold)
		insertAlertAndNotify(hub, ruleID, ruleName, agID, msg, webhookID)
		// Auto-create incident for error_rate alerts
		go func(agent string, message string) {
			_, err := autoCreateOrAppendIncident("", agent, message)
			if err != nil {
				log.Printf("[alerts] Failed to auto-create incident: %v", err)
			}
		}(agID, msg)
	}
}

// evaluateTaskStuck checks if tasks have been in progress for too long.
func evaluateTaskStuck(hub *websocket.Hub, ruleID, ruleName string, agentID sql.NullString, thresholdMinutes int, webhookID sql.NullString) {
	cutoff := time.Now().Add(-time.Duration(thresholdMinutes) * time.Minute)

	var query string
	var args []interface{}

	if agentID.Valid && agentID.String != "" {
		query = `
			SELECT id, title, assignee, updated_at
			FROM tasks
			WHERE status = 'progress'
			  AND assignee = $1
			  AND updated_at < $2
		`
		args = []interface{}{agentID.String, cutoff}
	} else {
		query = `
			SELECT id, title, assignee, updated_at
			FROM tasks
			WHERE status = 'progress'
			  AND updated_at < $1
		`
		args = []interface{}{cutoff}
	}

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		log.Printf("[alerts] task_stuck query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var taskID, title string
		var assignee sql.NullString
		var updatedAt time.Time
		if err := rows.Scan(&taskID, &title, &assignee, &updatedAt); err != nil {
			continue
		}
		agID := ""
		if assignee.Valid {
			agID = assignee.String
		}
		elapsed := int(time.Since(updatedAt).Minutes())
		msg := fmt.Sprintf("Task '%s' (assignee: %s) has been in-progress for %d minutes (threshold: %d)",
			title, agID, elapsed, thresholdMinutes)
		insertAlertAndNotify(hub, ruleID, ruleName, agID, msg, webhookID)
	}
}

// insertAlertAndNotify inserts into alert_history, deduplicates, and sends webhook.
func insertAlertAndNotify(hub *websocket.Hub, ruleID, ruleName, agentID, message string, webhookID sql.NullString) {
	// Dedup: don't create the same alert twice within 5 minutes
	var existingCount int
	db.DB.QueryRow(`
		SELECT COUNT(*) FROM alert_history
		WHERE rule_id = $1 AND agent_id = $2 AND triggered_at > NOW() - INTERVAL '5 minutes'
	`, ruleID, agentID).Scan(&existingCount)

	if existingCount > 0 {
		return
	}

	var histID string
	err := db.DB.QueryRow(`
		INSERT INTO alert_history (rule_id, agent_id, message)
		VALUES ($1, NULLIF($2,''), $3)
		RETURNING id
	`, ruleID, agentID, message).Scan(&histID)
	if err != nil {
		log.Printf("[alerts] Failed to insert alert history: %v", err)
		return
	}

	log.Printf("[alerts] 🔔 Alert triggered: %s — %s", ruleName, message)

	// Create in-app notification for the alert
	go CreateNotificationInternal(agentID, "alert", "Alert: "+ruleName, message)

	// Broadcast via WebSocket
	if hub != nil {
		payload := map[string]interface{}{
			"id":       histID,
			"rule_id":  ruleID,
			"rule":     ruleName,
			"agent_id": agentID,
			"message":  message,
			"time":     time.Now(),
		}
		hub.Broadcast("alert_triggered", payload)
	}

	// Call webhook if configured
	if webhookID.Valid {
		go callWebhook(webhookID.String, ruleName, agentID, message)
	}
}

// callWebhook makes a POST request to the configured webhook URL.
func callWebhook(webhookURL, ruleName, agentID, message string) {
	payload := map[string]interface{}{
		"rule":     ruleName,
		"agent_id": agentID,
		"message":  message,
		"time":     time.Now().Format(time.RFC3339),
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[alerts] Webhook call failed: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[alerts] Webhook called: %s → %d", webhookURL, resp.StatusCode)
}
