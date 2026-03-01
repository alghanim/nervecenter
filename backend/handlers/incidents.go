package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type Incident struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	Severity   string          `json:"severity"`
	Status     string          `json:"status"`
	TaskIDs    json.RawMessage `json:"task_ids"`
	AgentIDs   json.RawMessage `json:"agent_ids"`
	RootCause  string          `json:"root_cause"`
	Timeline   json.RawMessage `json:"timeline"`
	CreatedAt  string          `json:"created_at"`
	ResolvedAt *string         `json:"resolved_at"`
}

func GetIncidents(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	query := `SELECT id, title, severity, status, task_ids, agent_ids, root_cause, timeline, created_at, resolved_at FROM incidents`
	args := []interface{}{}
	if status != "" {
		query += ` WHERE status = $1`
		args = append(args, status)
	}
	query += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	incidents := []Incident{}
	for rows.Next() {
		var inc Incident
		if err := rows.Scan(&inc.ID, &inc.Title, &inc.Severity, &inc.Status, &inc.TaskIDs, &inc.AgentIDs, &inc.RootCause, &inc.Timeline, &inc.CreatedAt, &inc.ResolvedAt); err != nil {
			continue
		}
		incidents = append(incidents, inc)
	}
	respondJSON(w, 200, incidents)
}

func GetIncident(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var inc Incident
	err := db.DB.QueryRow(
		`SELECT id, title, severity, status, task_ids, agent_ids, root_cause, timeline, created_at, resolved_at FROM incidents WHERE id = $1`, id,
	).Scan(&inc.ID, &inc.Title, &inc.Severity, &inc.Status, &inc.TaskIDs, &inc.AgentIDs, &inc.RootCause, &inc.Timeline, &inc.CreatedAt, &inc.ResolvedAt)
	if err != nil {
		respondError(w, 404, "incident not found")
		return
	}
	respondJSON(w, 200, inc)
}

func CreateIncident(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title    string          `json:"title"`
		Severity string          `json:"severity"`
		TaskIDs  json.RawMessage `json:"task_ids"`
		AgentIDs json.RawMessage `json:"agent_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Title == "" {
		respondError(w, 400, "title required")
		return
	}
	if req.Severity == "" {
		req.Severity = "medium"
	}
	if req.TaskIDs == nil {
		req.TaskIDs = json.RawMessage(`[]`)
	}
	if req.AgentIDs == nil {
		req.AgentIDs = json.RawMessage(`[]`)
	}
	var id string
	err := db.DB.QueryRow(
		`INSERT INTO incidents (title, severity, task_ids, agent_ids) VALUES ($1, $2, $3, $4) RETURNING id`,
		req.Title, req.Severity, req.TaskIDs, req.AgentIDs,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]string{"id": id})
}

func UpdateIncident(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req struct {
		Title     *string          `json:"title"`
		Severity  *string          `json:"severity"`
		Status    *string          `json:"status"`
		TaskIDs   *json.RawMessage `json:"task_ids"`
		AgentIDs  *json.RawMessage `json:"agent_ids"`
		RootCause *string          `json:"root_cause"`
		Timeline  *json.RawMessage `json:"timeline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	sets := []string{}
	args := []interface{}{}
	n := 1
	addField := func(col string, val interface{}) {
		sets = append(sets, fmt.Sprintf("%s = $%d", col, n))
		args = append(args, val)
		n++
	}
	if req.Title != nil { addField("title", *req.Title) }
	if req.Severity != nil { addField("severity", *req.Severity) }
	if req.Status != nil {
		addField("status", *req.Status)
		if *req.Status == "resolved" || *req.Status == "closed" {
			addField("resolved_at", time.Now())
		}
	}
	if req.TaskIDs != nil { addField("task_ids", *req.TaskIDs) }
	if req.AgentIDs != nil { addField("agent_ids", *req.AgentIDs) }
	if req.RootCause != nil { addField("root_cause", *req.RootCause) }
	if req.Timeline != nil { addField("timeline", *req.Timeline) }

	if len(sets) == 0 {
		respondError(w, 400, "no fields to update")
		return
	}
	args = append(args, id)
	query := fmt.Sprintf("UPDATE incidents SET %s WHERE id = $%d", strings.Join(sets, ", "), n)
	_, err := db.DB.Exec(query, args...)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 200, map[string]string{"status": "updated"})
}



// AutoCreateIncident handles POST /api/incidents/auto-create
func AutoCreateIncident(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TaskID       string `json:"task_id"`
		AgentID      string `json:"agent_id"`
		ErrorSummary string `json:"error_summary"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.AgentID == "" {
		respondError(w, 400, "agent_id required")
		return
	}
	if req.ErrorSummary == "" {
		req.ErrorSummary = "Auto-detected errors"
	}

	id, err := autoCreateOrAppendIncident(req.TaskID, req.AgentID, req.ErrorSummary)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]string{"id": id})
}

// autoCreateOrAppendIncident checks for existing open incident for the agent.
func autoCreateOrAppendIncident(taskID, agentID, errorSummary string) (string, error) {
	agentJSON := `["` + agentID + `"]`

	var existingID string
	var timeline json.RawMessage
	err := db.DB.QueryRow(
		`SELECT id, timeline FROM incidents WHERE status IN ('open','investigating') AND agent_ids @> $1::jsonb ORDER BY created_at DESC LIMIT 1`,
		agentJSON,
	).Scan(&existingID, &timeline)

	if err == nil && existingID != "" {
		var entries []map[string]interface{}
		json.Unmarshal(timeline, &entries)
		entries = append(entries, map[string]interface{}{
			"time":    time.Now().Format(time.RFC3339),
			"event":   "error_detected",
			"details": errorSummary,
			"task_id": taskID,
		})
		newTimeline, _ := json.Marshal(entries)
		db.DB.Exec(`UPDATE incidents SET timeline = $1 WHERE id = $2`, newTimeline, existingID)
		return existingID, nil
	}

	taskIDs := json.RawMessage(`[]`)
	if taskID != "" {
		t, _ := json.Marshal([]string{taskID})
		taskIDs = t
	}
	agentIDs, _ := json.Marshal([]string{agentID})
	initialTimeline, _ := json.Marshal([]map[string]interface{}{
		{"time": time.Now().Format(time.RFC3339), "event": "incident_created", "details": errorSummary},
	})

	title := fmt.Sprintf("Auto: %s errors - %s", agentID, errorSummary)
	if len(title) > 255 {
		title = title[:255]
	}

	var id string
	err = db.DB.QueryRow(
		`INSERT INTO incidents (title, severity, task_ids, agent_ids, timeline) VALUES ($1, 'high', $2, $3, $4) RETURNING id`,
		title, taskIDs, agentIDs, initialTimeline,
	).Scan(&id)
	return id, err
}
