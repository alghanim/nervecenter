package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
)

// TriggerWebhooksToURL fires a webhook payload to a specific URL (used for test).
func TriggerWebhooksToURL(url, secret, event string, payload map[string]interface{}) {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["event"] = event
	payload["timestamp"] = time.Now().UTC().Format(time.RFC3339)

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("TriggerWebhooksToURL marshal error: %v", err)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		log.Printf("TriggerWebhooksToURL [%s] request error: %v", url, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AgentBoard-Event", event)
	req.Header.Set("User-Agent", "AgentBoard-Webhook/1.0")

	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		req.Header.Set("X-Webhook-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("TriggerWebhooksToURL [%s] delivery error: %v", url, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("TriggerWebhooksToURL [%s] event=%s status=%d", url, event, resp.StatusCode)
}

// TriggerWebhooks fires all active webhooks matching the given event.
// Runs asynchronously (fire-and-forget); call with go TriggerWebhooks(...) or directly.
func TriggerWebhooks(event string, payload map[string]interface{}) {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["event"] = event
	payload["timestamp"] = time.Now().UTC().Format(time.RFC3339)

	rows, err := db.DB.Query(
		`SELECT id, url, secret FROM webhooks WHERE active = true AND $1 = ANY(events)`, event)
	if err != nil {
		log.Printf("TriggerWebhooks query error: %v", err)
		return
	}
	defer rows.Close()

	type wh struct {
		id     string
		url    string
		secret string
	}

	var targets []wh
	for rows.Next() {
		var w wh
		var secret *string
		if err := rows.Scan(&w.id, &w.url, &secret); err != nil {
			continue
		}
		if secret != nil {
			w.secret = *secret
		}
		targets = append(targets, w)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("TriggerWebhooks marshal error: %v", err)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}

	for _, target := range targets {
		go func(w wh) {
			req, err := http.NewRequest("POST", w.url, bytes.NewReader(body))
			if err != nil {
				log.Printf("TriggerWebhooks [%s] request error: %v", w.url, err)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-AgentBoard-Event", event)
			req.Header.Set("User-Agent", "AgentBoard-Webhook/1.0")

			if w.secret != "" {
				mac := hmac.New(sha256.New, []byte(w.secret))
				mac.Write(body)
				req.Header.Set("X-Webhook-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
			}

			resp, err := client.Do(req)
			if err != nil {
				log.Printf("TriggerWebhooks [%s] delivery error: %v", w.url, err)
				return
			}
			defer resp.Body.Close()
			log.Printf("TriggerWebhooks [%s] event=%s status=%d", w.url, event, resp.StatusCode)
		}(target)
	}
}
