package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// ─── Context keys ─────────────────────────────────────────────────────────────

type contextKey string

const roleContextKey contextKey = "user_role"

// GetRoleFromContext extracts the role stored by auth middleware.
func GetRoleFromContext(r *http.Request) string {
	if role, ok := r.Context().Value(roleContextKey).(string); ok {
		return role
	}
	return ""
}

// ─── JWT secret (generated once on startup) ───────────────────────────────────

var (
	jwtSecret     []byte
	jwtSecretOnce sync.Once
)

func getJWTSecret() []byte {
	jwtSecretOnce.Do(func() {
		if s := os.Getenv("JWT_SECRET"); s != "" {
			jwtSecret = []byte(s)
			return
		}
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			log.Fatalf("auth: failed to generate JWT secret: %v", err)
		}
		jwtSecret = []byte(hex.EncodeToString(b))
		log.Printf("⚠️  JWT_SECRET not set — generated ephemeral secret (tokens will invalidate on restart)")
	})
	return jwtSecret
}

// ─── Password hash ────────────────────────────────────────────────────────────

var (
	passwordHash     string
	passwordHashOnce sync.Once
)

func getPasswordHash() string {
	passwordHashOnce.Do(func() {
		if h := os.Getenv("AGENTBOARD_PASSWORD_HASH"); h != "" {
			passwordHash = h
			return
		}
		password := os.Getenv("AGENTBOARD_PASSWORD")
		if password == "" {
			password = "admin"
			log.Printf("⚠️  AGENTBOARD_PASSWORD not set — using default password 'admin'. Set it in your .env!")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("auth: failed to hash password: %v", err)
		}
		passwordHash = string(hash)
	})
	return passwordHash
}

// ─── AuthHandler ──────────────────────────────────────────────────────────────

type AuthHandler struct{}

func init() {
	go func() {
		getJWTSecret()
		getPasswordHash()
	}()
}

// POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(getPasswordHash()), []byte(body.Password)); err != nil {
		http.Error(w, `{"error":"invalid password"}`, http.StatusUnauthorized)
		return
	}
	claims := jwt.MapClaims{
		"sub": "admin",
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(getJWTSecret())
	if err != nil {
		http.Error(w, `{"error":"token generation failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": signed})
}

// POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, ok := validateToken(r)
	json.NewEncoder(w).Encode(map[string]bool{"authenticated": ok})
}

// ─── Token validation helper ─────────────────────────────────────────────────

func validateToken(r *http.Request) (*jwt.Token, bool) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return nil, false
	}
	tokenStr := strings.TrimPrefix(auth, "Bearer ")
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return getJWTSecret(), nil
	})
	if err != nil || !token.Valid {
		return nil, false
	}
	return token, true
}

// ─── API Key validation ──────────────────────────────────────────────────────

// validateAPIKey checks the X-API-Key header against stored keys.
// Returns the role if valid, empty string if not.
func validateAPIKey(apiKey string) (string, bool) {
	rows, err := db.DB.Query(`SELECT id, key_hash, role, expires_at FROM api_keys`)
	if err != nil {
		return "", false
	}
	defer rows.Close()

	for rows.Next() {
		var id, keyHash, role string
		var expiresAt sql.NullTime
		if err := rows.Scan(&id, &keyHash, &role, &expiresAt); err != nil {
			continue
		}
		// Check expiry
		if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
			continue
		}
		if err := bcrypt.CompareHashAndPassword([]byte(keyHash), []byte(apiKey)); err == nil {
			// Update last_used
			go db.DB.Exec(`UPDATE api_keys SET last_used = NOW() WHERE id = $1`, id)
			return role, true
		}
	}
	return "", false
}

// ─── Role hierarchy ──────────────────────────────────────────────────────────

var roleLevel = map[string]int{
	"viewer": 0,
	"member": 1,
	"admin":  2,
}

// RequireRole returns middleware that enforces a minimum role level.
func RequireRole(minRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetRoleFromContext(r)
			if role == "" {
				respondError(w, http.StatusForbidden, "no role in context")
				return
			}
			if roleLevel[role] < roleLevel[minRole] {
				respondError(w, http.StatusForbidden, fmt.Sprintf("requires %s role or higher", minRole))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

// RequireAuth wraps write endpoints (POST/PUT/DELETE).
// GET requests are always passed through.
// Auth endpoints themselves (/api/auth/*) are always allowed.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always allow auth endpoints
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			next.ServeHTTP(w, r)
			return
		}

		// Check for API key first
		if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
			if role, ok := validateAPIKey(apiKey); ok {
				ctx := context.WithValue(r.Context(), roleContextKey, role)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			// API key provided but invalid
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid API key"})
			return
		}

		// Let GETs and OPTIONS through; only protect writes with JWT
		if r.Method == http.MethodGet || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		_, ok := validateToken(r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}
		// JWT users get admin role
		ctx := context.WithValue(r.Context(), roleContextKey, "admin")
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
