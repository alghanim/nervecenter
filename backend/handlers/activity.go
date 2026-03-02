package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/alghanim/agentboard/backend/models"
)

type ActivityHandler struct{}

// GetActivity handles GET /api/activity
func (h *ActivityHandler) GetActivity(w http.ResponseWriter, r *http.Request) {
	query := `SELECT al.id, al.agent_id, al.action, al.task_id, al.details, al.created_at, COALESCE(a.display_name, al.agent_id) as display_name
	          FROM activity_log al LEFT JOIN agents a ON a.id = al.agent_id WHERE 1=1`
	args := []interface{}{}
	argCount := 1

	if agentID := r.URL.Query().Get("agent_id"); agentID != "" {
		query += fmt.Sprintf(" AND al.agent_id = $%d", argCount)
		args = append(args, agentID)
		argCount++
	}
	if action := r.URL.Query().Get("action"); action != "" {
		query += fmt.Sprintf(" AND al.action = $%d", argCount)
		args = append(args, action)
		argCount++
	}
	if taskID := r.URL.Query().Get("task_id"); taskID != "" {
		query += fmt.Sprintf(" AND al.task_id = $%d", argCount)
		args = append(args, taskID)
		argCount++
	}
	if startDate := r.URL.Query().Get("start_date"); startDate != "" {
		if t, err := time.Parse(time.RFC3339, startDate); err == nil {
			query += fmt.Sprintf(" AND al.created_at >= $%d", argCount)
			args = append(args, t)
			argCount++
		}
	}
	if endDate := r.URL.Query().Get("end_date"); endDate != "" {
		if t, err := time.Parse(time.RFC3339, endDate); err == nil {
			query += fmt.Sprintf(" AND al.created_at <= $%d", argCount)
			args = append(args, t)
			argCount++
		}
	}
	_ = argCount

	query += " ORDER BY al.created_at DESC LIMIT 200"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	activities := []models.ActivityLog{}
	for rows.Next() {
		var activity models.ActivityLog
		var agentID, taskID, details sql.NullString

		var displayName sql.NullString
		if err := rows.Scan(&activity.ID, &agentID, &activity.Action,
			&taskID, &details, &activity.CreatedAt, &displayName); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		activity.AgentID = models.NullStringToPtr(agentID)
		activity.TaskID = models.NullStringToPtr(taskID)
		activity.Details = models.NullStringToPtr(details)
		activity.DisplayName = models.NullStringToPtr(displayName)
		activities = append(activities, activity)
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "row iteration error: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, activities)
}
