package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"time"
)

// GatewayHealthHandler pings the OpenClaw gateway periodically and exposes status.
type GatewayHealthHandler struct {
	mu           sync.RWMutex
	status       string
	responseTime int64
	firstUp      *time.Time
	lastChecked  time.Time
	history      []GatewayHealthPoint
	targetURL    string
}

// GatewayHealthPoint is a single check result.
type GatewayHealthPoint struct {
	Time         time.Time `json:"time"`
	ResponseTime int64     `json:"responseTimeMs"`
	Status       string    `json:"status"`
}

// StartGatewayHealthPoller begins periodic pinging in a goroutine.
func (h *GatewayHealthHandler) StartGatewayHealthPoller() {
	h.targetURL = os.Getenv("GATEWAY_URL")
	if h.targetURL == "" {
		h.targetURL = "http://127.0.0.1:18789/"
	}
	h.check()
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		for range ticker.C {
			h.check()
		}
	}()
}

func (h *GatewayHealthHandler) check() {
	client := &http.Client{Timeout: 5 * time.Second}
	start := time.Now()
	resp, err := client.Get(h.targetURL)
	elapsed := time.Since(start).Milliseconds()
	now := time.Now().UTC()

	h.mu.Lock()
	defer h.mu.Unlock()

	h.lastChecked = now

	if err != nil || resp == nil || resp.StatusCode >= 500 {
		h.status = "down"
		h.responseTime = elapsed
	} else {
		h.status = "up"
		h.responseTime = elapsed
		if h.firstUp == nil {
			t := now
			h.firstUp = &t
		}
	}
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}

	h.history = append(h.history, GatewayHealthPoint{
		Time:         now,
		ResponseTime: elapsed,
		Status:       h.status,
	})
	if len(h.history) > 60 {
		h.history = h.history[len(h.history)-60:]
	}
}

// GetGatewayHealth handles GET /api/gateway/health
func (h *GatewayHealthHandler) GetGatewayHealth(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var uptimeSeconds int64
	if h.firstUp != nil {
		uptimeSeconds = int64(time.Since(*h.firstUp).Seconds())
	}

	result := map[string]interface{}{
		"status":         h.status,
		"responseTimeMs": h.responseTime,
		"uptimeSeconds":  uptimeSeconds,
		"lastChecked":    h.lastChecked,
		"history":        h.history,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
