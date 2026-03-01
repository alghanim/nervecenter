package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type TraceHandler struct{}

type AgentTrace struct {
	ID         string          `json:"id"`
	TaskID     *string         `json:"task_id,omitempty"`
	AgentID    *string         `json:"agent_id,omitempty"`
	TraceType  string          `json:"trace_type"`
	Content    json.RawMessage `json:"content"`
	CreatedAt  time.Time       `json:"created_at"`
	DurationMs int             `json:"duration_ms"`
}

var validTraceTypes = map[string]bool{
	"tool_call":       true,
	"llm_invoke":      true,
	"sub_agent_spawn": true,
	"file_change":     true,
	"error":           true,
}

// GetTaskTraces handles GET /api/tasks/{id}/traces
func (h *TraceHandler) GetTaskTraces(w http.ResponseWriter, r *http.Request) {
	taskID := mux.Vars(r)["id"]
	query := `SELECT id, task_id, agent_id, trace_type, content, created_at, duration_ms FROM agent_traces WHERE task_id = $1`
	args := []interface{}{taskID}
	n := 2

	if traceType := r.URL.Query().Get("type"); traceType != "" {
		query += fmt.Sprintf(" AND trace_type = $%d", n)
		args = append(args, traceType)
		n++
	}
	query += " ORDER BY created_at ASC"

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	query += fmt.Sprintf(" LIMIT $%d", n)
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	traces := []AgentTrace{}
	for rows.Next() {
		var t AgentTrace
		if err := rows.Scan(&t.ID, &t.TaskID, &t.AgentID, &t.TraceType, &t.Content, &t.CreatedAt, &t.DurationMs); err != nil {
			respondError(w, 500, err.Error())
			return
		}
		traces = append(traces, t)
	}
	respondJSON(w, 200, traces)
}

// IngestTrace handles POST /api/traces
func (h *TraceHandler) IngestTrace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TaskID     string          `json:"task_id"`
		AgentID    string          `json:"agent_id"`
		TraceType  string          `json:"trace_type"`
		Content    json.RawMessage `json:"content"`
		DurationMs int             `json:"duration_ms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if !validTraceTypes[req.TraceType] {
		respondError(w, 400, "invalid trace_type")
		return
	}
	if req.Content == nil {
		req.Content = json.RawMessage(`{}`)
	}

	var id string
	err := db.DB.QueryRow(
		`INSERT INTO agent_traces (task_id, agent_id, trace_type, content, duration_ms)
		 VALUES (NULLIF($1,'')::uuid, NULLIF($2,''), $3, $4, $5) RETURNING id`,
		req.TaskID, req.AgentID, req.TraceType, req.Content, req.DurationMs,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}

	// Auto-notify on error traces
	if req.TraceType == "error" && req.AgentID != "" {
		go CreateNotificationInternal(req.AgentID, "trace_error", "Agent error trace",
			fmt.Sprintf("Error trace recorded for agent %s on task %s", req.AgentID, req.TaskID))
	}

	respondJSON(w, 201, map[string]string{"id": id})
}

// BatchIngestTraces handles POST /api/traces/batch
func (h *TraceHandler) BatchIngestTraces(w http.ResponseWriter, r *http.Request) {
	var traces []struct {
		TaskID     string          `json:"task_id"`
		AgentID    string          `json:"agent_id"`
		TraceType  string          `json:"trace_type"`
		Content    json.RawMessage `json:"content"`
		DurationMs int             `json:"duration_ms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&traces); err != nil {
		respondError(w, 400, "invalid JSON array")
		return
	}

	ids := []string{}
	for _, t := range traces {
		if !validTraceTypes[t.TraceType] {
			continue
		}
		if t.Content == nil {
			t.Content = json.RawMessage(`{}`)
		}
		var id string
		err := db.DB.QueryRow(
			`INSERT INTO agent_traces (task_id, agent_id, trace_type, content, duration_ms)
			 VALUES (NULLIF($1,'')::uuid, NULLIF($2,''), $3, $4, $5) RETURNING id`,
			t.TaskID, t.AgentID, t.TraceType, t.Content, t.DurationMs,
		).Scan(&id)
		if err == nil {
			ids = append(ids, id)
			if t.TraceType == "error" && t.AgentID != "" {
				go CreateNotificationInternal(t.AgentID, "trace_error", "Agent error trace",
					fmt.Sprintf("Error trace recorded for agent %s", t.AgentID))
			}
		}
	}
	respondJSON(w, 201, map[string]interface{}{"inserted": len(ids), "ids": ids})
}

// GetAgentTraces handles GET /api/agents/{id}/traces
func (h *TraceHandler) GetAgentTraces(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}

	rows, err := db.DB.Query(
		`SELECT id, task_id, agent_id, trace_type, content, created_at, duration_ms
		 FROM agent_traces WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
		agentID, limit,
	)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	traces := []AgentTrace{}
	for rows.Next() {
		var t AgentTrace
		if err := rows.Scan(&t.ID, &t.TaskID, &t.AgentID, &t.TraceType, &t.Content, &t.CreatedAt, &t.DurationMs); err != nil {
			respondError(w, 500, err.Error())
			return
		}
		traces = append(traces, t)
	}
	respondJSON(w, 200, traces)
}

// DeleteTrace handles DELETE /api/traces/{id}
func (h *TraceHandler) DeleteTrace(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := db.DB.Exec(`DELETE FROM agent_traces WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "trace not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "trace deleted"})
}
