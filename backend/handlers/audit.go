package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/alghanim/agentboard/backend/db"
)

// AuditLog represents a single audit log entry.
type AuditLog struct {
	ID         string      `json:"id"`
	Timestamp  string      `json:"timestamp"`
	User       string      `json:"user"`
	Action     string      `json:"action"`
	EntityType string      `json:"entity_type"`
	EntityID   string      `json:"entity_id"`
	Details    interface{} `json:"details"`
}

// LogAudit inserts an audit entry. Call fire-and-forget — errors are logged, not returned.
func LogAudit(user, action, entityType, entityID string, details map[string]interface{}) {
	var detailsStr sql.NullString
	if details != nil {
		b, err := json.Marshal(details)
		if err == nil {
			detailsStr = sql.NullString{String: string(b), Valid: true}
		}
	}

	_, err := db.DB.Exec(`
		INSERT INTO audit_logs ("user", action, entity_type, entity_id, details)
		VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5::jsonb)`,
		user, action, entityType, entityID, detailsStr,
	)
	if err != nil {
		log.Printf("audit: insert failed: %v", err)
	}
}

// GetAuditLog handles GET /api/audit?limit=100&entity_type=&action=
func GetAuditLog(w http.ResponseWriter, r *http.Request) {
	limit := 100
	entityType := r.URL.Query().Get("entity_type")
	actionFilter := r.URL.Query().Get("action")

	if l := r.URL.Query().Get("limit"); l != "" {
		var v int
		if _, err := fmt.Sscanf(l, "%d", &v); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}

	query := `SELECT id, timestamp, COALESCE("user",'user'), action,
	                 COALESCE(entity_type,''), COALESCE(entity_id,''), details
	          FROM audit_logs WHERE 1=1`
	args := []interface{}{}
	argCount := 1

	if entityType != "" {
		query += fmt.Sprintf(" AND entity_type = $%d", argCount)
		args = append(args, entityType)
		argCount++
	}
	if actionFilter != "" {
		query += fmt.Sprintf(" AND action = $%d", argCount)
		args = append(args, actionFilter)
		argCount++
	}

	query += fmt.Sprintf(" ORDER BY timestamp DESC LIMIT $%d", argCount)
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	logs := []AuditLog{}
	for rows.Next() {
		var entry AuditLog
		var detailsRaw []byte
		if err := rows.Scan(&entry.ID, &entry.Timestamp, &entry.User, &entry.Action,
			&entry.EntityType, &entry.EntityID, &detailsRaw); err != nil {
			continue
		}
		if detailsRaw != nil {
			var d interface{}
			if err := json.Unmarshal(detailsRaw, &d); err == nil {
				entry.Details = d
			}
		}
		logs = append(logs, entry)
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, logs)
}
