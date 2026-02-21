package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

// AlertRule represents an alert rule.
type AlertRule struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	AgentID         *string    `json:"agent_id"`
	ConditionType   string     `json:"condition_type"`
	Threshold       int        `json:"threshold"`
	Enabled         bool       `json:"enabled"`
	NotifyWebhookID *string    `json:"notify_webhook_id"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// AlertHistory represents a triggered alert.
type AlertHistory struct {
	ID           string    `json:"id"`
	RuleID       string    `json:"rule_id"`
	RuleName     string    `json:"rule_name"`
	AgentID      *string   `json:"agent_id"`
	TriggeredAt  time.Time `json:"triggered_at"`
	Message      string    `json:"message"`
	Acknowledged bool      `json:"acknowledged"`
}

// GetAlertRules handles GET /api/alerts/rules
func GetAlertRules(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT id, name, agent_id, condition_type, threshold, enabled, notify_webhook_id, created_at, updated_at
		FROM alert_rules
		ORDER BY created_at DESC
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	rules := []AlertRule{}
	for rows.Next() {
		var rule AlertRule
		var agentID sql.NullString
		var webhookID sql.NullString
		err := rows.Scan(&rule.ID, &rule.Name, &agentID, &rule.ConditionType,
			&rule.Threshold, &rule.Enabled, &webhookID, &rule.CreatedAt, &rule.UpdatedAt)
		if err != nil {
			continue
		}
		if agentID.Valid {
			rule.AgentID = &agentID.String
		}
		if webhookID.Valid {
			rule.NotifyWebhookID = &webhookID.String
		}
		rules = append(rules, rule)
	}
	respondJSON(w, http.StatusOK, rules)
}

// CreateAlertRule handles POST /api/alerts/rules
func CreateAlertRule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name            string  `json:"name"`
		AgentID         *string `json:"agent_id"`
		ConditionType   string  `json:"condition_type"`
		Threshold       int     `json:"threshold"`
		Enabled         *bool   `json:"enabled"`
		NotifyWebhookID *string `json:"notify_webhook_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Name == "" || req.ConditionType == "" {
		respondError(w, http.StatusBadRequest, "name and condition_type required")
		return
	}
	if req.Threshold == 0 {
		req.Threshold = 30
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var rule AlertRule
	var agentID sql.NullString
	var webhookID sql.NullString
	if req.AgentID != nil {
		agentID = sql.NullString{String: *req.AgentID, Valid: true}
	}
	if req.NotifyWebhookID != nil {
		webhookID = sql.NullString{String: *req.NotifyWebhookID, Valid: true}
	}

	err := db.DB.QueryRow(`
		INSERT INTO alert_rules (name, agent_id, condition_type, threshold, enabled, notify_webhook_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, agent_id, condition_type, threshold, enabled, notify_webhook_id, created_at, updated_at
	`, req.Name, agentID, req.ConditionType, req.Threshold, enabled, webhookID).
		Scan(&rule.ID, &rule.Name, &agentID, &rule.ConditionType,
			&rule.Threshold, &rule.Enabled, &webhookID, &rule.CreatedAt, &rule.UpdatedAt)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if agentID.Valid {
		rule.AgentID = &agentID.String
	}
	if webhookID.Valid {
		rule.NotifyWebhookID = &webhookID.String
	}
	go LogAudit("user", "alert_rule_created", "alert_rule", rule.ID, map[string]interface{}{"name": rule.Name, "condition_type": rule.ConditionType})
	respondJSON(w, http.StatusCreated, rule)
}

// UpdateAlertRule handles PUT /api/alerts/rules/{id}
func UpdateAlertRule(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req struct {
		Name            *string `json:"name"`
		AgentID         *string `json:"agent_id"`
		ConditionType   *string `json:"condition_type"`
		Threshold       *int    `json:"threshold"`
		Enabled         *bool   `json:"enabled"`
		NotifyWebhookID *string `json:"notify_webhook_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Fetch existing
	var rule AlertRule
	var agentID sql.NullString
	var webhookID sql.NullString
	err := db.DB.QueryRow(`
		SELECT id, name, agent_id, condition_type, threshold, enabled, notify_webhook_id, created_at, updated_at
		FROM alert_rules WHERE id = $1
	`, id).Scan(&rule.ID, &rule.Name, &agentID, &rule.ConditionType,
		&rule.Threshold, &rule.Enabled, &webhookID, &rule.CreatedAt, &rule.UpdatedAt)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "rule not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Apply updates
	if req.Name != nil {
		rule.Name = *req.Name
	}
	if req.AgentID != nil {
		agentID = sql.NullString{String: *req.AgentID, Valid: true}
	}
	if req.ConditionType != nil {
		rule.ConditionType = *req.ConditionType
	}
	if req.Threshold != nil {
		rule.Threshold = *req.Threshold
	}
	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}
	if req.NotifyWebhookID != nil {
		webhookID = sql.NullString{String: *req.NotifyWebhookID, Valid: true}
	}

	_, err = db.DB.Exec(`
		UPDATE alert_rules SET name=$1, agent_id=$2, condition_type=$3, threshold=$4, enabled=$5, notify_webhook_id=$6
		WHERE id=$7
	`, rule.Name, agentID, rule.ConditionType, rule.Threshold, rule.Enabled, webhookID, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	rule.UpdatedAt = time.Now()
	if agentID.Valid {
		rule.AgentID = &agentID.String
	}
	if webhookID.Valid {
		rule.NotifyWebhookID = &webhookID.String
	}
	respondJSON(w, http.StatusOK, rule)
}

// DeleteAlertRule handles DELETE /api/alerts/rules/{id}
func DeleteAlertRule(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	res, err := db.DB.Exec(`DELETE FROM alert_rules WHERE id = $1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		respondError(w, http.StatusNotFound, "rule not found")
		return
	}
	go LogAudit("user", "alert_rule_deleted", "alert_rule", id, nil)
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GetAlertHistory handles GET /api/alerts/history
func GetAlertHistory(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT ah.id, ah.rule_id, COALESCE(ar.name,''), ah.agent_id, ah.triggered_at, COALESCE(ah.message,''), ah.acknowledged
		FROM alert_history ah
		LEFT JOIN alert_rules ar ON ar.id = ah.rule_id
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if ack := r.URL.Query().Get("acknowledged"); ack == "false" {
		query += " AND ah.acknowledged = false"
	}

	query += " ORDER BY ah.triggered_at DESC LIMIT 200"
	_ = argCount

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	history := []AlertHistory{}
	for rows.Next() {
		var h AlertHistory
		var agentID sql.NullString
		err := rows.Scan(&h.ID, &h.RuleID, &h.RuleName, &agentID, &h.TriggeredAt, &h.Message, &h.Acknowledged)
		if err != nil {
			continue
		}
		if agentID.Valid {
			h.AgentID = &agentID.String
		}
		history = append(history, h)
	}
	respondJSON(w, http.StatusOK, history)
}

// AcknowledgeAlert handles POST /api/alerts/history/{id}/acknowledge
func AcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	res, err := db.DB.Exec(`UPDATE alert_history SET acknowledged = true WHERE id = $1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		respondError(w, http.StatusNotFound, "alert not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
}

// GetAlertUnacknowledgedCount returns the count of unacknowledged alerts.
func GetAlertUnacknowledgedCount(w http.ResponseWriter, r *http.Request) {
	var count int
	err := db.DB.QueryRow(`SELECT COUNT(*) FROM alert_history WHERE acknowledged = false`).Scan(&count)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"count": count})
}
