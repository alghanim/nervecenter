package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// LogsHandler serves /api/logs, /api/logs/search, /api/logs/files
type LogsHandler struct{}

// LogEntry represents a parsed log line
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

// GetLogs handles GET /api/logs
func (h *LogsHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	agentID := q.Get("agent_id")
	level := q.Get("level")
	fromStr := q.Get("from")
	toStr := q.Get("to")
	limitStr := q.Get("limit")
	offsetStr := q.Get("offset")
	fileFilter := q.Get("file")

	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
		limit = l
	}
	offset := 0
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	var from, to time.Time
	var fromSet, toSet bool
	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t
			fromSet = true
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t
			toSet = true
		}
	}

	entries := readAllLogs(agentID, level, from, to, fromSet, toSet, fileFilter, limit+offset)

	// Apply offset + limit
	total := len(entries)
	if offset >= total {
		entries = []LogEntry{}
	} else {
		entries = entries[offset:]
		if len(entries) > limit {
			entries = entries[:limit]
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   total,
		"offset":  offset,
		"limit":   limit,
	})
}

// SearchLogs handles GET /api/logs/search
func (h *LogsHandler) SearchLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	searchTerm := q.Get("q")
	agentID := q.Get("agent_id")
	level := q.Get("level")
	fromStr := q.Get("from")
	toStr := q.Get("to")
	limitStr := q.Get("limit")

	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
		limit = l
	}

	var from, to time.Time
	var fromSet, toSet bool
	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t
			fromSet = true
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t
			toSet = true
		}
	}

	allEntries := readAllLogs(agentID, level, from, to, fromSet, toSet, "", 10000)

	// Full-text filter
	filtered := []LogEntry{}
	lowerTerm := strings.ToLower(searchTerm)
	for _, e := range allEntries {
		if searchTerm == "" {
			filtered = append(filtered, e)
		} else if strings.Contains(strings.ToLower(e.Message), lowerTerm) ||
			strings.Contains(strings.ToLower(e.Raw), lowerTerm) ||
			strings.Contains(strings.ToLower(e.AgentID), lowerTerm) {
			filtered = append(filtered, e)
		}
		if len(filtered) >= limit {
			break
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"entries": filtered,
		"total":   len(filtered),
		"query":   searchTerm,
	})
}

// GetLogFiles handles GET /api/logs/files
func (h *LogsHandler) GetLogFiles(w http.ResponseWriter, r *http.Request) {
	logsDir := filepath.Join(os.Getenv("HOME"), ".openclaw", "logs")
	files, err := os.ReadDir(logsDir)
	if err != nil {
		respondJSON(w, http.StatusOK, []LogFileInfo{})
		return
	}

	result := []LogFileInfo{}
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		path := filepath.Join(logsDir, f.Name())
		info, err := f.Info()
		if err != nil {
			continue
		}

		lfi := LogFileInfo{
			Name:      f.Name(),
			Path:      path,
			SizeBytes: info.Size(),
			FirstSeen: info.ModTime(),
			LastSeen:  info.ModTime(),
		}

		// Quick scan to count lines and find time range
		fh, err := os.Open(path)
		if err == nil {
			scanner := bufio.NewScanner(fh)
			scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
			count := 0
			var firstTs, lastTs time.Time
			for scanner.Scan() {
				count++
				line := scanner.Text()
				if ts := extractTimestampFromLine(line); !ts.IsZero() {
					if firstTs.IsZero() {
						firstTs = ts
					}
					lastTs = ts
				}
			}
			fh.Close()
			lfi.LineCount = count
			if !firstTs.IsZero() {
				lfi.FirstSeen = firstTs
			}
			if !lastTs.IsZero() {
				lfi.LastSeen = lastTs
			}
		}

		result = append(result, lfi)
	}

	respondJSON(w, http.StatusOK, result)
}

// --- Helpers ---

func readAllLogs(agentID, level string, from, to time.Time, fromSet, toSet bool, fileFilter string, maxEntries int) []LogEntry {
	logsDir := filepath.Join(os.Getenv("HOME"), ".openclaw", "logs")
	files, err := os.ReadDir(logsDir)
	if err != nil {
		return nil
	}

	entries := []LogEntry{}

	for _, f := range files {
		if f.IsDir() {
			continue
		}
		if fileFilter != "" && f.Name() != fileFilter {
			continue
		}

		path := filepath.Join(logsDir, f.Name())
		fh, err := os.Open(path)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(fh)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		lineNum := 0
		for scanner.Scan() {
			lineNum++
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			entry := parseLogLine(line, f.Name(), lineNum)

			// Filters
			if agentID != "" && !strings.EqualFold(entry.AgentID, agentID) {
				continue
			}
			if level != "" && !strings.EqualFold(entry.Level, level) {
				continue
			}
			if fromSet && entry.Timestamp.Before(from) {
				continue
			}
			if toSet && entry.Timestamp.After(to) {
				continue
			}

			entries = append(entries, entry)
			if len(entries) >= maxEntries {
				break
			}
		}
		fh.Close()
		if len(entries) >= maxEntries {
			break
		}
	}

	// Sort descending by timestamp
	sortLogEntries(entries)
	return entries
}

func parseLogLine(line, filename string, lineNum int) LogEntry {
	entry := LogEntry{
		Timestamp:  time.Now(),
		Level:      "info",
		AgentID:    "system",
		SourceFile: filename,
		Raw:        truncateStr(line, 1000),
	}

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		// Plain text log
		entry.Message = truncateStr(line, 500)
		lower := strings.ToLower(line)
		if strings.Contains(lower, "error") || strings.Contains(lower, "fatal") {
			entry.Level = "error"
		} else if strings.Contains(lower, "warn") {
			entry.Level = "warn"
		} else if strings.Contains(lower, "debug") {
			entry.Level = "debug"
		}
		return entry
	}

	// Parse timestamp
	for _, key := range []string{"timestamp", "ts", "time", "created_at"} {
		if v, ok := raw[key].(string); ok {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				entry.Timestamp = t
				break
			}
			if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
				entry.Timestamp = t
				break
			}
		}
	}

	// Parse level
	if v, ok := raw["level"].(string); ok {
		entry.Level = strings.ToLower(v)
	} else {
		// Heuristic from content
		lower := strings.ToLower(line)
		if strings.Contains(lower, "error") || strings.Contains(lower, "fatal") {
			entry.Level = "error"
		} else if strings.Contains(lower, "warn") {
			entry.Level = "warn"
		} else if strings.Contains(lower, "debug") {
			entry.Level = "debug"
		}
	}

	// Parse agent ID
	for _, key := range []string{"agent_id", "agentId", "agent", "sessionKey", "senderId"} {
		if v, ok := raw[key].(string); ok && v != "" {
			entry.AgentID = v
			break
		}
	}

	// Parse message
	for _, key := range []string{"message", "msg", "content", "event", "action"} {
		if v, ok := raw[key].(string); ok && v != "" {
			entry.Message = truncateStr(v, 500)
			break
		}
	}
	if entry.Message == "" {
		// Use source + event as message
		parts := []string{}
		for _, key := range []string{"source", "event", "action", "type"} {
			if v, ok := raw[key].(string); ok && v != "" {
				parts = append(parts, fmt.Sprintf("%s=%s", key, v))
			}
		}
		if len(parts) > 0 {
			entry.Message = strings.Join(parts, " ")
		} else {
			entry.Message = truncateStr(line, 200)
		}
	}

	return entry
}

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

func sortLogEntries(entries []LogEntry) {
	// Simple insertion sort descending by timestamp
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0 && entries[j].Timestamp.After(entries[j-1].Timestamp); j-- {
			entries[j], entries[j-1] = entries[j-1], entries[j]
		}
	}
}
