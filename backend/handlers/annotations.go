package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/alghanim/agentboard/backend/models"

	"github.com/gorilla/mux"
)

type AnnotationHandler struct{}

// GetAnnotations handles GET /api/agents/:id/annotations
func (h *AnnotationHandler) GetAnnotations(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]

	rows, err := db.DB.Query(
		`SELECT id, agent_id, author, content, created_at
		 FROM annotations WHERE agent_id = $1 ORDER BY created_at ASC`, agentID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	annotations := []models.Annotation{}
	for rows.Next() {
		var a models.Annotation
		if err := rows.Scan(&a.ID, &a.AgentID, &a.Author, &a.Content, &a.CreatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		annotations = append(annotations, a)
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "row iteration error: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, annotations)
}

// CreateAnnotation handles POST /api/agents/:id/annotations
func (h *AnnotationHandler) CreateAnnotation(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]

	var ann models.Annotation
	if err := json.NewDecoder(r.Body).Decode(&ann); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	ann.AgentID = agentID
	if ann.Author == "" {
		ann.Author = "ali"
	}
	if ann.Content == "" {
		respondError(w, http.StatusBadRequest, "content is required")
		return
	}

	err := db.DB.QueryRow(
		`INSERT INTO annotations (agent_id, author, content) VALUES ($1, $2, $3)
		 RETURNING id, created_at`,
		ann.AgentID, ann.Author, ann.Content,
	).Scan(&ann.ID, &ann.CreatedAt)

	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, ann)
}

// DeleteAnnotation handles DELETE /api/agents/:id/annotations/:ann_id
func (h *AnnotationHandler) DeleteAnnotation(w http.ResponseWriter, r *http.Request) {
	annID := mux.Vars(r)["ann_id"]

	result, err := db.DB.Exec(`DELETE FROM annotations WHERE id = $1`, annID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		respondError(w, http.StatusNotFound, "Annotation not found")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Annotation deleted"})
}
