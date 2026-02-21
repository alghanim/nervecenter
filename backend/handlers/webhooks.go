package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
	"github.com/lib/pq"
)

type WebhookHandler struct{}

type Webhook struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Events    []string  `json:"events"`
	Secret    string    `json:"secret,omitempty"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListWebhooks handles GET /api/webhooks
func (h *WebhookHandler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(
		`SELECT id, COALESCE(name,''), url, events, COALESCE(secret,''), active, created_at, updated_at
		 FROM webhooks ORDER BY created_at DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	webhooks := []Webhook{}
	for rows.Next() {
		var wh Webhook
		if err := rows.Scan(&wh.ID, &wh.Name, &wh.URL, pq.Array(&wh.Events),
			&wh.Secret, &wh.Active, &wh.CreatedAt, &wh.UpdatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		webhooks = append(webhooks, wh)
	}
	respondJSON(w, http.StatusOK, webhooks)
}

// CreateWebhook handles POST /api/webhooks
func (h *WebhookHandler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var data struct {
		Name   string   `json:"name"`
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret string   `json:"secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if data.URL == "" {
		respondError(w, http.StatusBadRequest, "url is required")
		return
	}
	if len(data.Events) == 0 {
		respondError(w, http.StatusBadRequest, "at least one event is required")
		return
	}

	var wh Webhook
	err := db.DB.QueryRow(
		`INSERT INTO webhooks (name, url, events, secret)
		 VALUES ($1, $2, $3, NULLIF($4,''))
		 RETURNING id, COALESCE(name,''), url, events, COALESCE(secret,''), active, created_at, updated_at`,
		data.Name, data.URL, pq.Array(data.Events), data.Secret,
	).Scan(&wh.ID, &wh.Name, &wh.URL, pq.Array(&wh.Events),
		&wh.Secret, &wh.Active, &wh.CreatedAt, &wh.UpdatedAt)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go LogAudit("user", "webhook_created", "webhook", wh.ID, map[string]interface{}{"name": wh.Name, "url": wh.URL})
	respondJSON(w, http.StatusCreated, wh)
}

// UpdateWebhook handles PUT /api/webhooks/:id
func (h *WebhookHandler) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var data struct {
		Name   string   `json:"name"`
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret string   `json:"secret"`
		Active *bool    `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	var wh Webhook
	err := db.DB.QueryRow(
		`UPDATE webhooks
		 SET name    = COALESCE(NULLIF($1,''), name),
		     url     = COALESCE(NULLIF($2,''), url),
		     events  = CASE WHEN array_length($3::text[], 1) > 0 THEN $3::text[] ELSE events END,
		     secret  = CASE WHEN $4 <> '' THEN $4 ELSE secret END,
		     active  = COALESCE($5, active),
		     updated_at = NOW()
		 WHERE id = $6
		 RETURNING id, COALESCE(name,''), url, events, COALESCE(secret,''), active, created_at, updated_at`,
		data.Name, data.URL, pq.Array(data.Events), data.Secret, data.Active, id,
	).Scan(&wh.ID, &wh.Name, &wh.URL, pq.Array(&wh.Events),
		&wh.Secret, &wh.Active, &wh.CreatedAt, &wh.UpdatedAt)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Webhook not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, wh)
}

// DeleteWebhook handles DELETE /api/webhooks/:id
func (h *WebhookHandler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	res, err := db.DB.Exec(`DELETE FROM webhooks WHERE id = $1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		respondError(w, http.StatusNotFound, "Webhook not found")
		return
	}
	go LogAudit("user", "webhook_deleted", "webhook", id, nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Webhook deleted"})
}

// TestWebhook handles POST /api/webhooks/:id/test
func (h *WebhookHandler) TestWebhook(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var wh Webhook
	var secret sql.NullString
	err := db.DB.QueryRow(
		`SELECT id, COALESCE(name,''), url, events, secret, active FROM webhooks WHERE id = $1`, id,
	).Scan(&wh.ID, &wh.Name, &wh.URL, pq.Array(&wh.Events), &secret, &wh.Active)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Webhook not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if secret.Valid {
		wh.Secret = secret.String
	}

	go TriggerWebhooksToURL(wh.URL, wh.Secret, "test", map[string]interface{}{
		"event":      "test",
		"webhook_id": wh.ID,
		"message":    "This is a test webhook from AgentBoard",
	})

	respondJSON(w, http.StatusOK, map[string]string{"message": "Test webhook dispatched"})
}
