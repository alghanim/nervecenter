package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// GatewayHealthHandler pings the OpenClaw gateway periodically and exposes status.
type GatewayHealthHandler struct {
	mu           sync.RWMutex
	healthStatus string
	readyStatus  string
	responseTime int64
	firstUp      *time.Time
	lastChecked  time.Time
	history      []GatewayHealthPoint
	baseURL      string
}

// GatewayHealthPoint is a single check result.
type GatewayHealthPoint struct {
	Time         time.Time `json:"time"`
	ResponseTime int64     `json:"responseTimeMs"`
	Status       string    `json:"status"`
}

// StartGatewayHealthPoller begins periodic pinging in a goroutine.
func (h *GatewayHealthHandler) StartGatewayHealthPoller() {
	h.baseURL = os.Getenv("GATEWAY_URL")
	if h.baseURL == "" {
		h.baseURL = "http://127.0.0.1:18789"
	}
	h.baseURL = strings.TrimRight(h.baseURL, "/")
	h.check()
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		for range ticker.C {
			h.check()
		}
	}()
}

// pingEndpoint hits a URL and returns status ("up"/"down") and elapsed ms.
func pingEndpoint(client *http.Client, url string) (string, int64) {
	start := time.Now()
	resp, err := client.Get(url)
	elapsed := time.Since(start).Milliseconds()
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
	if err != nil || resp == nil || resp.StatusCode >= 500 {
		return "down", elapsed
	}
	return "up", elapsed
}

func (h *GatewayHealthHandler) check() {
	client := &http.Client{Timeout: 5 * time.Second}

	hStatus, hElapsed := pingEndpoint(client, h.baseURL+"/health")
	rStatus, _ := pingEndpoint(client, h.baseURL+"/ready")

	now := time.Now().UTC()

	h.mu.Lock()
	defer h.mu.Unlock()

	h.lastChecked = now
	h.healthStatus = hStatus
	h.readyStatus = rStatus
	h.responseTime = hElapsed

	if hStatus == "up" && h.firstUp == nil {
		t := now
		h.firstUp = &t
	}

	h.history = append(h.history, GatewayHealthPoint{
		Time:         now,
		ResponseTime: hElapsed,
		Status:       hStatus,
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
		"healthStatus":   h.healthStatus,
		"readyStatus":    h.readyStatus,
		"responseTimeMs": h.responseTime,
		"uptimeSeconds":  uptimeSeconds,
		"lastChecked":    h.lastChecked,
		"history":        h.history,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
