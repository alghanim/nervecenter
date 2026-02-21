package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

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
		// Generate a random 32-byte secret
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
		// Allow pre-hashed bcrypt via AGENTBOARD_PASSWORD_HASH
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
	// Pre-warm on startup so the first request isn't slow
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

	// Issue JWT
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
	// JWT is stateless; client drops the token. Return success.
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

// ─── Auth middleware ──────────────────────────────────────────────────────────

// RequireAuth wraps write endpoints (POST/PUT/DELETE).
// GET requests are always passed through.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Let GETs through; only protect writes
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
		next.ServeHTTP(w, r)
	})
}
