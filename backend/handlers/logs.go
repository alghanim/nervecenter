package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/config"
)

// LogsHandler serves /api/logs, /api/logs/search, /api/logs/files
type LogsHandler struct{}

// SessionEntry is the standard log-viewer entry derived from session JSONL files.
type SessionEntry struct {
	AgentID        string    `json:"agent_id"`
	SessionID      string    `json:"session_id"`
	Timestamp      time.Time `json:"timestamp"`
	Role           string    `json:"role"`
	ContentPreview string    `json:"content_preview"`
	Level          string    `json:"level"`
}

// LogEntry represents a parsed log line (legacy / raw log files)
type LogEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	Level      string    `json:"level"`
	AgentID    string    `json:"agent_id"`
	Message    string    `json:"message"`
	SourceFile string    `json:"source_file"`
	Raw        string    `json:"raw"`
}

// LogFileInfo describes a log file
type LogFileInfo struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	SizeBytes int64     `json:"size_bytes"`
	FirstSeen time.Time `json:"first_seen"`
	LastSeen  time.Time `json:"last_seen"`
	LineCount int       `json:"line_count"`
}

// GetLogs handles GET /api/logs?agent=&search=&level=&limit=100
// Scans ~/.openclaw/agents/*/sessions/*.jsonl session files.
func (h *LogsHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// Accept both "agent" (new) and "agent_id" (legacy)
	agentFilter := q.Get("agent")
	if agentFilter == "" {
		agentFilter = q.Get("agent_id")
	}
	if strings.ToLower(agentFilter) == "all" {
		agentFilter = ""
	}

	searchTerm := q.Get("search")
	if searchTerm == "" {
		searchTerm = q.Get("q")
	}

	levelFilter := strings.ToLower(q.Get("level"))
	if levelFilter == "all" {
		levelFilter = ""
	}

	limit := 100
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 2000 {
		limit = l
	}

	entries := scanSessionLogs(agentFilter, searchTerm, levelFilter, limit)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   len(entries),
		"limit":   limit,
	})
}

// SearchLogs handles GET /api/logs/search (legacy endpoint kept for compat)
func (h *LogsHandler) SearchLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	searchTerm := q.Get("q")
	if searchTerm == "" {
		searchTerm = q.Get("search")
	}
	agentFilter := q.Get("agent_id")
	if agentFilter == "" {
		agentFilter = q.Get("agent")
	}
	levelFilter := strings.ToLower(q.Get("level"))
	if levelFilter == "all" {
		levelFilter = ""
	}
	limit := 200
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 1000 {
		limit = l
	}

	entries := scanSessionLogs(agentFilter, searchTerm, levelFilter, limit)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   len(entries),
		"query":   searchTerm,
	})
}

// GetLogFiles handles GET /api/logs/files — returns agent list with session counts
func (h *LogsHandler) GetLogFiles(w http.ResponseWriter, r *http.Request) {
	agentsDir := filepath.Join(config.GetOpenClawDir(), "agents")
	agentDirs, err := os.ReadDir(agentsDir)
	if err != nil {
		respondJSON(w, http.StatusOK, []LogFileInfo{})
		return
	}

	result := []LogFileInfo{}
	for _, d := range agentDirs {
		if !d.IsDir() {
			continue
		}
		sessDir := filepath.Join(agentsDir, d.Name(), "sessions")
		sessions, err := os.ReadDir(sessDir)
		if err != nil {
			continue
		}

		var totalSize int64
		var totalLines int
		var earliest, latest time.Time

		for _, s := range sessions {
			if !strings.HasSuffix(s.Name(), ".jsonl") {
				continue
			}
			info, err := s.Info()
			if err != nil {
				continue
			}
			totalSize += info.Size()

			fh, err := os.Open(filepath.Join(sessDir, s.Name()))
			if err != nil {
				continue
			}
			scanner := bufio.NewScanner(fh)
			scanner.Buffer(make([]byte, 512*1024), 512*1024)
			for scanner.Scan() {
				totalLines++
				line := scanner.Text()
				var raw map[string]interface{}
				if err := json.Unmarshal([]byte(line), &raw); err == nil {
					if tsStr, ok := raw["timestamp"].(string); ok {
						if t, err := time.Parse(time.RFC3339, tsStr); err == nil {
							if earliest.IsZero() || t.Before(earliest) {
								earliest = t
							}
							if t.After(latest) {
								latest = t
							}
						} else if t, err := time.Parse(time.RFC3339Nano, tsStr); err == nil {
							if earliest.IsZero() || t.Before(earliest) {
								earliest = t
							}
							if t.After(latest) {
								latest = t
							}
						}
					}
				}
			}
			fh.Close()
		}

		if earliest.IsZero() {
			earliest = time.Now()
		}
		if latest.IsZero() {
			latest = time.Now()
		}

		result = append(result, LogFileInfo{
			Name:      d.Name(),
			Path:      sessDir,
			SizeBytes: totalSize,
			FirstSeen: earliest,
			LastSeen:  latest,
			LineCount: totalLines,
		})
	}

	respondJSON(w, http.StatusOK, result)
}

// --- Session file scanner ---

// scanSessionLogs reads ~/.openclaw/agents/*/sessions/*.jsonl and returns matching entries.
func scanSessionLogs(agentFilter, searchTerm, levelFilter string, limit int) []SessionEntry {
	agentsDir := filepath.Join(config.GetOpenClawDir(), "agents")
	agentDirs, err := os.ReadDir(agentsDir)
	if err != nil {
		return nil
	}

	lowerSearch := strings.ToLower(searchTerm)
	entries := []SessionEntry{}

	for _, d := range agentDirs {
		if !d.IsDir() {
			continue
		}
		agentID := d.Name()

		// Agent filter
		if agentFilter != "" && !strings.EqualFold(agentID, agentFilter) {
			continue
		}

		sessDir := filepath.Join(agentsDir, agentID, "sessions")
		sessions, err := os.ReadDir(sessDir)
		if err != nil {
			continue
		}

		for _, s := range sessions {
			if !strings.HasSuffix(s.Name(), ".jsonl") {
				continue
			}
			sessionID := strings.TrimSuffix(s.Name(), ".jsonl")
			path := filepath.Join(sessDir, s.Name())

			fh, err := os.Open(path)
			if err != nil {
				continue
			}

			scanner := bufio.NewScanner(fh)
			scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" {
					continue
				}

				var raw map[string]interface{}
				if err := json.Unmarshal([]byte(line), &raw); err != nil {
					continue
				}

				// Only process "message" type entries
				recType, _ := raw["type"].(string)
				if recType != "message" {
					continue
				}

				// Extract the inner message object
				msgObj, ok := raw["message"].(map[string]interface{})
				if !ok {
					continue
				}

				role, _ := msgObj["role"].(string)
				if role == "" {
					continue
				}

				// Extract content preview
				contentPreview := extractContentPreview(msgObj["content"], 200)

				// Determine level
				level := roleToLevel(role, msgObj["content"])

				// Level filter
				if levelFilter != "" && level != levelFilter {
					continue
				}

				// Search filter
				if lowerSearch != "" {
					if !strings.Contains(strings.ToLower(contentPreview), lowerSearch) &&
						!strings.Contains(strings.ToLower(agentID), lowerSearch) {
						continue
					}
				}

				// Parse timestamp
				var ts time.Time
				if tsStr, ok := raw["timestamp"].(string); ok {
					if t, err := time.Parse(time.RFC3339, tsStr); err == nil {
						ts = t
					} else if t, err := time.Parse(time.RFC3339Nano, tsStr); err == nil {
						ts = t
					}
				}
				if ts.IsZero() {
					ts = time.Now()
				}

				entries = append(entries, SessionEntry{
					AgentID:        agentID,
					SessionID:      sessionID,
					Timestamp:      ts,
					Role:           role,
					ContentPreview: contentPreview,
					Level:          level,
				})
			}
			fh.Close()
		}
	}

	// Sort descending by timestamp
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Timestamp.After(entries[j].Timestamp)
	})

	// Apply limit
	if len(entries) > limit {
		entries = entries[:limit]
	}

	return entries
}

// extractContentPreview extracts up to maxLen chars from message content.
// Content can be a string or an array of content blocks.
func extractContentPreview(content interface{}, maxLen int) string {
	if content == nil {
		return ""
	}

	var parts []string

	switch v := content.(type) {
	case string:
		parts = append(parts, v)
	case []interface{}:
		for _, block := range v {
			blockMap, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			blockType, _ := blockMap["type"].(string)
			switch blockType {
			case "text":
				if text, ok := blockMap["text"].(string); ok {
					parts = append(parts, text)
				}
			case "tool_use":
				name, _ := blockMap["name"].(string)
				if name != "" {
					parts = append(parts, fmt.Sprintf("[tool: %s]", name))
				} else {
					parts = append(parts, "[tool call]")
				}
			case "tool_result":
				parts = append(parts, "[tool result]")
			case "thinking":
				if text, ok := blockMap["thinking"].(string); ok && len(text) > 0 {
					preview := text
					if len(preview) > 60 {
						preview = preview[:60] + "…"
					}
					parts = append(parts, fmt.Sprintf("[thinking: %s]", preview))
				}
			}
		}
	}

	result := strings.Join(parts, " ")
	result = strings.TrimSpace(result)

	if len(result) > maxLen {
		// Try to cut at a word boundary
		cut := result[:maxLen]
		if idx := strings.LastIndexAny(cut, " \t\n"); idx > maxLen-30 {
			cut = cut[:idx]
		}
		result = cut + "…"
	}

	return result
}

// roleToLevel derives a display level from role and content.
func roleToLevel(role string, content interface{}) string {
	switch role {
	case "user":
		return "info"
	case "assistant":
		// Check if content contains tool_use blocks → "tool"
		if arr, ok := content.([]interface{}); ok {
			for _, block := range arr {
				bm, ok := block.(map[string]interface{})
				if !ok {
					continue
				}
				if t, ok := bm["type"].(string); ok && t == "tool_use" {
					return "tool"
				}
			}
		}
		return "info"
	default:
		return "info"
	}
}

// --- Legacy helpers (kept for SearchLogs / GetLogFiles fallback) ---

func extractTimestampFromLine(line string) time.Time {
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return time.Time{}
	}
	for _, key := range []string{"timestamp", "ts", "time", "created_at"} {
		if v, ok := raw[key].(string); ok {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				return t
			}
			if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

