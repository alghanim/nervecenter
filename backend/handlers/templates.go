package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type TemplateHandler struct{}

type TaskTemplate struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Description     *string         `json:"description,omitempty"`
	DefaultAssignee *string         `json:"default_assignee,omitempty"`
	DefaultPriority string          `json:"default_priority"`
	Checklist       json.RawMessage `json:"checklist"`
	WorkflowRules   json.RawMessage `json:"workflow_rules"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

func scanTemplate(scanner interface{ Scan(...interface{}) error }) (TaskTemplate, error) {
	var t TaskTemplate
	var desc, assignee sql.NullString
	err := scanner.Scan(&t.ID, &t.Name, &desc, &assignee, &t.DefaultPriority,
		&t.Checklist, &t.WorkflowRules, &t.CreatedAt, &t.UpdatedAt)
	if desc.Valid {
		t.Description = &desc.String
	}
	if assignee.Valid {
		t.DefaultAssignee = &assignee.String
	}
	return t, err
}

const templateCols = `id, name, description, default_assignee, default_priority, checklist, workflow_rules, created_at, updated_at`

// ListTemplates handles GET /api/templates
func (h *TemplateHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`SELECT ` + templateCols + ` FROM task_templates ORDER BY created_at DESC`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	templates := []TaskTemplate{}
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			respondError(w, 500, err.Error())
			return
		}
		templates = append(templates, t)
	}
	respondJSON(w, 200, templates)
}

// GetTemplate handles GET /api/templates/{id}
func (h *TemplateHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	row := db.DB.QueryRow(`SELECT `+templateCols+` FROM task_templates WHERE id = $1`, id)
	t, err := scanTemplate(row)
	if err == sql.ErrNoRows {
		respondError(w, 404, "template not found")
		return
	}
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 200, t)
}

// CreateTemplate handles POST /api/templates
func (h *TemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name            string          `json:"name"`
		Description     *string         `json:"description"`
		DefaultAssignee *string         `json:"default_assignee"`
		DefaultPriority string          `json:"default_priority"`
		Checklist       json.RawMessage `json:"checklist"`
		WorkflowRules   json.RawMessage `json:"workflow_rules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Name == "" {
		respondError(w, 400, "name is required")
		return
	}
	if req.DefaultPriority == "" {
		req.DefaultPriority = "medium"
	}
	if req.Checklist == nil {
		req.Checklist = json.RawMessage(`[]`)
	}
	if req.WorkflowRules == nil {
		req.WorkflowRules = json.RawMessage(`[]`)
	}

	var id string
	var createdAt time.Time
	err := db.DB.QueryRow(
		`INSERT INTO task_templates (name, description, default_assignee, default_priority, checklist, workflow_rules)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		req.Name, req.Description, req.DefaultAssignee, req.DefaultPriority, req.Checklist, req.WorkflowRules,
	).Scan(&id, &createdAt)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]interface{}{"id": id, "name": req.Name, "created_at": createdAt})
}

// UpdateTemplate handles PUT /api/templates/{id}
func (h *TemplateHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req struct {
		Name            string          `json:"name"`
		Description     *string         `json:"description"`
		DefaultAssignee *string         `json:"default_assignee"`
		DefaultPriority string          `json:"default_priority"`
		Checklist       json.RawMessage `json:"checklist"`
		WorkflowRules   json.RawMessage `json:"workflow_rules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}

	result, err := db.DB.Exec(
		`UPDATE task_templates SET name=$1, description=$2, default_assignee=$3, default_priority=$4,
		 checklist=$5, workflow_rules=$6, updated_at=NOW() WHERE id=$7`,
		req.Name, req.Description, req.DefaultAssignee, req.DefaultPriority, req.Checklist, req.WorkflowRules, id,
	)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "template not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "template updated"})
}

// DeleteTemplate handles DELETE /api/templates/{id}
func (h *TemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := db.DB.Exec(`DELETE FROM task_templates WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "template not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "template deleted"})
}

// InstantiateTemplate handles POST /api/templates/{id}/instantiate
func (h *TemplateHandler) InstantiateTemplate(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	// Get template
	row := db.DB.QueryRow(`SELECT `+templateCols+` FROM task_templates WHERE id = $1`, id)
	tmpl, err := scanTemplate(row)
	if err == sql.ErrNoRows {
		respondError(w, 404, "template not found")
		return
	}
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}

	// Allow overrides from request body
	var overrides struct {
		Title    string  `json:"title"`
		Assignee *string `json:"assignee"`
		Priority *string `json:"priority"`
	}
	json.NewDecoder(r.Body).Decode(&overrides)

	title := overrides.Title
	if title == "" {
		title = tmpl.Name
	}
	assignee := tmpl.DefaultAssignee
	if overrides.Assignee != nil {
		assignee = overrides.Assignee
	}
	priority := tmpl.DefaultPriority
	if overrides.Priority != nil {
		priority = *overrides.Priority
	}

	var taskID string
	err = db.DB.QueryRow(
		`INSERT INTO tasks (title, description, status, priority, assignee) VALUES ($1, $2, 'todo', $3, $4) RETURNING id`,
		title, tmpl.Description, priority, assignee,
	).Scan(&taskID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}

	respondJSON(w, 201, map[string]string{"task_id": taskID, "template_id": id})
}
