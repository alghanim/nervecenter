package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

type APIKeyHandler struct{}

type APIKey struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Role      string     `json:"role"`
	CreatedAt time.Time  `json:"created_at"`
	LastUsed  *time.Time `json:"last_used"`
	ExpiresAt *time.Time `json:"expires_at"`
}

// ListKeys handles GET /api/keys
func (h *APIKeyHandler) ListKeys(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`SELECT id, name, role, created_at, last_used, expires_at FROM api_keys ORDER BY created_at DESC`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	keys := []APIKey{}
	for rows.Next() {
		var k APIKey
		var lastUsed, expiresAt sql.NullTime
		if err := rows.Scan(&k.ID, &k.Name, &k.Role, &k.CreatedAt, &lastUsed, &expiresAt); err != nil {
			respondError(w, 500, err.Error())
			return
		}
		if lastUsed.Valid {
			k.LastUsed = &lastUsed.Time
		}
		if expiresAt.Valid {
			k.ExpiresAt = &expiresAt.Time
		}
		keys = append(keys, k)
	}
	respondJSON(w, 200, keys)
}

// CreateKey handles POST /api/keys
func (h *APIKeyHandler) CreateKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name          string `json:"name"`
		Role          string `json:"role"`
		ExpiresInDays *int   `json:"expires_in_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Name == "" {
		respondError(w, 400, "name is required")
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}
	if req.Role != "admin" && req.Role != "member" && req.Role != "viewer" {
		respondError(w, 400, "role must be admin, member, or viewer")
		return
	}

	rawKey := make([]byte, 32)
	if _, err := rand.Read(rawKey); err != nil {
		respondError(w, 500, "failed to generate key")
		return
	}
	plaintext := "nb_" + hex.EncodeToString(rawKey)

	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, 500, "failed to hash key")
		return
	}

	var expiresAt *time.Time
	if req.ExpiresInDays != nil && *req.ExpiresInDays > 0 {
		t := time.Now().Add(time.Duration(*req.ExpiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	var id string
	var createdAt time.Time
	err = db.DB.QueryRow(
		`INSERT INTO api_keys (key_hash, name, role, expires_at) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
		string(hash), req.Name, req.Role, expiresAt,
	).Scan(&id, &createdAt)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}

	respondJSON(w, 201, map[string]interface{}{
		"id":         id,
		"key":        plaintext,
		"name":       req.Name,
		"role":       req.Role,
		"created_at": createdAt,
		"expires_at": expiresAt,
	})
}

// DeleteKey handles DELETE /api/keys/{id}
func (h *APIKeyHandler) DeleteKey(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := db.DB.Exec(`DELETE FROM api_keys WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		respondError(w, 404, "API key not found")
		return
	}
	respondJSON(w, 200, map[string]string{"message": "API key revoked"})
}
