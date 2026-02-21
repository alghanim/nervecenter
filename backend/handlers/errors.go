package handlers

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/db"
)

// ErrorsHandler serves /api/errors and /api/errors/summary
type ErrorsHandler struct{}

// ErrorEntry represents a single error event
type ErrorEntry struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agent_id"`
	ErrorType string    `json:"error_type"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	Source    string    `json:"source"` // "db" | "log"
}

// ErrorSummary represents aggregated error data
type ErrorSummary struct {
	TotalErrors24h   int               `json:"total_errors_24h"`
	MostErroringAgent string           `json:"most_erroring_agent"`
	ByAgent          []AgentErrorCount `json:"by_agent"`
	ByType           []TypeErrorCount  `json:"by_type"`
	TrendHourly      []HourlyCount     `json:"trend_hourly"`
}

type AgentErrorCount struct {
	AgentID string `json:"agent_id"`
	Count   int    `json:"count"`
}

type TypeErrorCount struct {
	ErrorType string `json:"error_type"`
	Count     int    `json:"count"`
}

type HourlyCount struct {
	Hour  string `json:"hour"`
	Count int    `json:"count"`
}

// GetErrors handles GET /api/errors
func (h *ErrorsHandler) GetErrors(w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agent_id")
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	limitStr := r.URL.Query().Get("limit")

	limit := 50
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

	entries := []ErrorEntry{}

	// --- DB source ---
	dbEntries, err := queryDBErrors(agentID, from, to, limit, fromSet, toSet)
	if err == nil {
		entries = append(entries, dbEntries...)
	}

	// --- Log file source ---
	logEntries := parseLogErrors(agentID, from, to, fromSet, toSet, limit)
	entries = append(entries, logEntries...)

	// Sort by timestamp descending (simple insertion-based merge)
	entries = sortErrorEntries(entries)
	if len(entries) > limit {
		entries = entries[:limit]
	}

	respondJSON(w, http.StatusOK, entries)
}

// GetErrorsSummary handles GET /api/errors/summary
func (h *ErrorsHandler) GetErrorsSummary(w http.ResponseWriter, r *http.Request) {
	since := time.Now().Add(-24 * time.Hour)

	// Count from DB
	dbRows, _ := db.DB.Query(`
		SELECT agent_id, action, COUNT(*) as cnt
		FROM activity_log
		WHERE created_at >= $1
		  AND (
		    action ILIKE '%error%'
		    OR action ILIKE '%fail%'
		    OR action ILIKE '%retry%'
		  )
		GROUP BY agent_id, action
		ORDER BY cnt DESC
	`, since)

	byAgentMap := map[string]int{}
	byTypeMap := map[string]int{}
	total := 0

	if dbRows != nil {
		defer dbRows.Close()
		for dbRows.Next() {
			var agentID sql.NullString
			var action string
			var cnt int
			if err := dbRows.Scan(&agentID, &action, &cnt); err == nil {
				aid := "system"
				if agentID.Valid {
					aid = agentID.String
				}
				byAgentMap[aid] += cnt
				byTypeMap[classifyAction(action)] += cnt
				total += cnt
			}
		}
	}

	// Also count from log files
	logErrors := parseLogErrors("", time.Time{}, time.Time{}, false, false, 2000)
	for _, e := range logErrors {
		if e.Timestamp.After(since) {
			byAgentMap[e.AgentID]++
			byTypeMap[e.ErrorType]++
			total++
		}
	}

	// Find most erroring agent
	mostAgent := ""
	mostCount := 0
	for a, c := range byAgentMap {
		if c > mostCount {
			mostCount = c
			mostAgent = a
		}
	}

	// Build slices
	byAgent := []AgentErrorCount{}
	for a, c := range byAgentMap {
		byAgent = append(byAgent, AgentErrorCount{AgentID: a, Count: c})
	}
	byType := []TypeErrorCount{}
	for t, c := range byTypeMap {
		byType = append(byType, TypeErrorCount{ErrorType: t, Count: c})
	}

	// Hourly trend (last 24 hours)
	trendHourly := buildHourlyTrend(logErrors, since)

	summary := ErrorSummary{
		TotalErrors24h:    total,
		MostErroringAgent: mostAgent,
		ByAgent:           byAgent,
		ByType:            byType,
		TrendHourly:       trendHourly,
	}

	respondJSON(w, http.StatusOK, summary)
}

// --- Helpers ---

func queryDBErrors(agentID string, from, to time.Time, limit int, fromSet, toSet bool) ([]ErrorEntry, error) {
	query := `
		SELECT id::text, COALESCE(agent_id,'system'), action, COALESCE(details::text,''), created_at
		FROM activity_log
		WHERE (
		    action ILIKE '%error%'
		    OR action ILIKE '%fail%'
		    OR action ILIKE '%retry%'
		)`
	args := []interface{}{}
	argN := 1

	if agentID != "" {
		query += fmt.Sprintf(" AND agent_id = $%d", argN)
		args = append(args, agentID)
		argN++
	}
	if fromSet {
		query += fmt.Sprintf(" AND created_at >= $%d", argN)
		args = append(args, from)
		argN++
	}
	if toSet {
		query += fmt.Sprintf(" AND created_at <= $%d", argN)
		args = append(args, to)
		argN++
	}
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", argN)
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []ErrorEntry{}
	for rows.Next() {
		var e ErrorEntry
		if err := rows.Scan(&e.ID, &e.AgentID, &e.Action, &e.Details, &e.Timestamp); err == nil {
			e.ErrorType = classifyAction(e.Action)
			e.Message = e.Details
			e.Source = "db"
			if e.Message == "" {
				e.Message = e.Action
			}
			entries = append(entries, e)
		}
	}
	return entries, nil
}

func parseLogErrors(agentID string, from, to time.Time, fromSet, toSet bool, limit int) []ErrorEntry {
	logsDir := filepath.Join(os.Getenv("HOME"), ".openclaw", "logs")
	files, err := os.ReadDir(logsDir)
	if err != nil {
		return nil
	}

	entries := []ErrorEntry{}
	idx := 0

	for _, f := range files {
		if f.IsDir() {
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

			entry, ok := extractLogError(line, f.Name(), idx)
			if !ok {
				continue
			}

			// Time filters
			if fromSet && entry.Timestamp.Before(from) {
				continue
			}
			if toSet && entry.Timestamp.After(to) {
				continue
			}
			// Agent filter
			if agentID != "" && entry.AgentID != agentID {
				continue
			}

			entries = append(entries, entry)
			idx++
			if len(entries) >= limit {
				break
			}
		}
		fh.Close()
		if len(entries) >= limit {
			break
		}
	}

	return entries
}

func extractLogError(line, filename string, idx int) (ErrorEntry, bool) {
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		// Plain text — check for error keywords
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "error") && !strings.Contains(lower, "fail") && !strings.Contains(lower, "retry") {
			return ErrorEntry{}, false
		}
		return ErrorEntry{
			ID:        fmt.Sprintf("log-%s-%d", filename, idx),
			AgentID:   "system",
			ErrorType: "log_error",
			Message:   truncateStr(line, 500),
			Timestamp: time.Now(), // best effort
			Action:    "log_entry",
			Details:   line,
			Source:    "log",
		}, true
	}

	// Check for error indicators in JSONL
	isError := false
	lower := strings.ToLower(line)
	if strings.Contains(lower, "error") || strings.Contains(lower, "fail") ||
		strings.Contains(lower, "retry") || strings.Contains(lower, "exception") {
		isError = true
	}

	// Check level field
	if level, ok := raw["level"].(string); ok {
		if strings.EqualFold(level, "error") || strings.EqualFold(level, "fatal") || strings.EqualFold(level, "warn") {
			isError = true
		}
	}

	if !isError {
		return ErrorEntry{}, false
	}

	// Parse timestamp
	ts := time.Now()
	for _, key := range []string{"timestamp", "ts", "time", "created_at"} {
		if v, ok := raw[key].(string); ok {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				ts = t
				break
			}
			if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
				ts = t
				break
			}
		}
	}

	// Parse agent ID
	agentID := "system"
	for _, key := range []string{"agent_id", "agentId", "agent", "sessionKey"} {
		if v, ok := raw[key].(string); ok && v != "" {
			agentID = v
			break
		}
	}

	// Parse message
	msg := ""
	for _, key := range []string{"message", "msg", "content", "event", "action"} {
		if v, ok := raw[key].(string); ok && v != "" {
			msg = v
			break
		}
	}
	if msg == "" {
		msg = truncateStr(line, 200)
	}

	errorType := "unknown"
	if level, ok := raw["level"].(string); ok {
		errorType = strings.ToLower(level)
	} else if strings.Contains(strings.ToLower(msg), "timeout") {
		errorType = "timeout"
	} else if strings.Contains(strings.ToLower(msg), "fail") {
		errorType = "failure"
	} else if strings.Contains(strings.ToLower(msg), "error") {
		errorType = "error"
	}

	return ErrorEntry{
		ID:        fmt.Sprintf("log-%s-%d", filename, idx),
		AgentID:   agentID,
		ErrorType: errorType,
		Message:   truncateStr(msg, 500),
		Timestamp: ts,
		Action:    filename,
		Details:   truncateStr(line, 1000),
		Source:    "log",
	}, true
}

func classifyAction(action string) string {
	lower := strings.ToLower(action)
	if strings.Contains(lower, "retry") {
		return "retry"
	}
	if strings.Contains(lower, "fail") {
		return "failure"
	}
	if strings.Contains(lower, "error") {
		return "error"
	}
	return "other"
}

func buildHourlyTrend(logErrors []ErrorEntry, since time.Time) []HourlyCount {
	hourMap := map[string]int{}
	now := time.Now()
	for i := 0; i < 24; i++ {
		h := now.Add(-time.Duration(23-i) * time.Hour).Truncate(time.Hour)
		hourMap[h.Format("15:00")] = 0
	}
	for _, e := range logErrors {
		if e.Timestamp.After(since) {
			key := e.Timestamp.Truncate(time.Hour).Format("15:00")
			hourMap[key]++
		}
	}

	trend := []HourlyCount{}
	for i := 0; i < 24; i++ {
		h := now.Add(-time.Duration(23-i) * time.Hour).Truncate(time.Hour)
		key := h.Format("15:00")
		trend = append(trend, HourlyCount{Hour: key, Count: hourMap[key]})
	}
	return trend
}

func sortErrorEntries(entries []ErrorEntry) []ErrorEntry {
	// Simple insertion sort descending by timestamp
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0 && entries[j].Timestamp.After(entries[j-1].Timestamp); j-- {
			entries[j], entries[j-1] = entries[j-1], entries[j]
		}
	}
	return entries
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
