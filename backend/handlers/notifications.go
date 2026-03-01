package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type NotificationHandler struct{}

type Notification struct {
	ID        string    `json:"id"`
	AgentID   *string   `json:"agent_id,omitempty"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Message   *string   `json:"message,omitempty"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

// ListNotifications handles GET /api/notifications
func (h *NotificationHandler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, agent_id, type, title, message, read, created_at FROM notifications WHERE 1=1`
	args := []interface{}{}
	n := 1

	if readFilter := r.URL.Query().Get("read"); readFilter != "" {
		query += fmt.Sprintf(" AND read = $%d", n)
		args = append(args, readFilter == "true")
		n++
	}
	if agentID := r.URL.Query().Get("agent_id"); agentID != "" {
		query += fmt.Sprintf(" AND agent_id = $%d", n)
		args = append(args, agentID)
		n++
	}

	query += " ORDER BY read ASC, created_at DESC"

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
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

	notifications := []Notification{}
	for rows.Next() {
		var notif Notification
		var agentID, message sql.NullString
		if err := rows.Scan(&notif.ID, &agentID, &notif.Type, &notif.Title, &message, &notif.Read, &notif.CreatedAt); err != nil {
			respondError(w, 500, err.Error())
			return
		}
		if agentID.Valid {
			notif.AgentID = &agentID.String
		}
		if message.Valid {
			notif.Message = &message.String
		}
		notifications = append(notifications, notif)
	}
	respondJSON(w, 200, notifications)
}

// CreateNotification handles POST /api/notifications
func (h *NotificationHandler) CreateNotification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID string `json:"agent_id"`
		Type    string `json:"type"`
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Title == "" {
		respondError(w, 400, "title is required")
		return
	}
	if req.Type == "" {
		req.Type = "info"
	}

	var id string
	err := db.DB.QueryRow(
		`INSERT INTO notifications (agent_id, type, title, message) VALUES (NULLIF($1,''), $2, $3, $4) RETURNING id`,
		req.AgentID, req.Type, req.Title, req.Message,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}

	// Fire webhook
	go TriggerWebhooks("notification.created", map[string]interface{}{
		"id": id, "agent_id": req.AgentID, "type": req.Type, "title": req.Title,
	})

	respondJSON(w, 201, map[string]string{"id": id})
}

// MarkRead handles PUT /api/notifications/{id}/read
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := db.DB.Exec(`UPDATE notifications SET read = true WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "notification not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "marked as read"})
}

// MarkAllRead handles POST /api/notifications/read-all
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID string `json:"agent_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.AgentID != "" {
		db.DB.Exec(`UPDATE notifications SET read = true WHERE agent_id = $1 AND read = false`, req.AgentID)
	} else {
		db.DB.Exec(`UPDATE notifications SET read = true WHERE read = false`)
	}
	respondJSON(w, 200, map[string]string{"message": "all marked as read"})
}

// UnreadCount handles GET /api/notifications/unread-count
func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	var count int
	agentID := r.URL.Query().Get("agent_id")
	if agentID != "" {
		db.DB.QueryRow(`SELECT COUNT(*) FROM notifications WHERE read = false AND agent_id = $1`, agentID).Scan(&count)
	} else {
		db.DB.QueryRow(`SELECT COUNT(*) FROM notifications WHERE read = false`).Scan(&count)
	}
	respondJSON(w, 200, map[string]int{"count": count})
}

// DeleteNotification handles DELETE /api/notifications/{id}
func (h *NotificationHandler) DeleteNotification(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := db.DB.Exec(`DELETE FROM notifications WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "notification not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "notification deleted"})
}

// CreateNotificationInternal creates a notification from within the backend (not via HTTP).
func CreateNotificationInternal(agentID, notifType, title, message string) {
	var id string
	err := db.DB.QueryRow(
		`INSERT INTO notifications (agent_id, type, title, message) VALUES (NULLIF($1,''), $2, $3, $4) RETURNING id`,
		agentID, notifType, title, message,
	).Scan(&id)
	if err != nil {
		log.Printf("[notifications] Failed to create notification: %v", err)
		return
	}
	go TriggerWebhooks("notification.created", map[string]interface{}{
		"id": id, "agent_id": agentID, "type": notifType, "title": title,
	})
}
