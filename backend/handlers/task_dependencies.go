package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
	"github.com/lib/pq"
)

// GetTaskDependencies returns the depends_on array for a task
func GetTaskDependencies(w http.ResponseWriter, r *http.Request) {
	taskID := mux.Vars(r)["id"]
	var deps []string
	err := db.DB.QueryRow(`SELECT COALESCE(depends_on, '{}') FROM tasks WHERE id = $1`, taskID).Scan(pq.Array(&deps))
	if err != nil {
		respondError(w, 404, "task not found")
		return
	}
	respondJSON(w, 200, map[string]interface{}{"task_id": taskID, "depends_on": deps})
}

// UpdateTaskDependencies sets the depends_on array for a task
func UpdateTaskDependencies(w http.ResponseWriter, r *http.Request) {
	taskID := mux.Vars(r)["id"]
	var req struct {
		DependsOn []string `json:"depends_on"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	_, err := db.DB.Exec(`UPDATE tasks SET depends_on = $1 WHERE id = $2`, pq.Array(req.DependsOn), taskID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 200, map[string]interface{}{"task_id": taskID, "depends_on": req.DependsOn})
}

// TaskDAGNode represents a node in the task DAG
type TaskDAGNode struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Status   string `json:"status"`
	Assignee string `json:"assignee"`
	Priority string `json:"priority"`
	Blocked  bool   `json:"blocked"`
}

// TaskDAGEdge represents a dependency edge
type TaskDAGEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// GetTaskDAG returns the full task dependency graph for D3
func GetTaskDAG(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`SELECT id, title, status, COALESCE(assignee,''), COALESCE(priority,'medium'), COALESCE(depends_on, '{}') FROM tasks WHERE status != 'done' ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	nodes := []TaskDAGNode{}
	edges := []TaskDAGEdge{}
	doneSet := map[string]bool{}

	// First pass: collect all tasks
	type taskRow struct {
		id, title, status, assignee, priority string
		deps                                  []string
	}
	var tasks []taskRow
	for rows.Next() {
		var t taskRow
		var deps []string
		if err := rows.Scan(&t.id, &t.title, &t.status, &t.assignee, &t.priority, pq.Array(&deps)); err != nil {
			continue
		}
		t.deps = deps
		tasks = append(tasks, t)
	}

	// Check which dependencies are incomplete (blocking)
	statusMap := map[string]string{}
	for _, t := range tasks {
		statusMap[t.id] = t.status
	}

	for _, t := range tasks {
		blocked := false
		for _, depID := range t.deps {
			edges = append(edges, TaskDAGEdge{From: depID, To: t.id})
			if s, ok := statusMap[depID]; ok && s != "done" {
				blocked = true
			} else if !ok {
				// Check DB for done status
				var st string
				if db.DB.QueryRow(`SELECT status FROM tasks WHERE id = $1`, depID).Scan(&st) == nil {
					if st != "done" {
						blocked = true
					}
					doneSet[depID] = st == "done"
				}
			}
		}
		nodes = append(nodes, TaskDAGNode{
			ID:       t.id,
			Title:    t.title,
			Status:   t.status,
			Assignee: t.assignee,
			Priority: t.priority,
			Blocked:  blocked,
		})
	}

	_ = doneSet
	respondJSON(w, 200, map[string]interface{}{
		"nodes": nodes,
		"edges": edges,
	})
}
