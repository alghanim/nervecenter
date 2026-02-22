package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/config"

	"github.com/gorilla/mux"
)

// OCAgent is the wire type exposed by the live-status API.
type OCAgent struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Emoji     string `json:"emoji"`
	Role      string `json:"role"`
	Team      string `json:"team"`
	TeamColor string `json:"teamColor"`
	IsLead    bool   `json:"isLead"`
	Parent    string `json:"parent,omitempty"`
}

func agentFromConfig(a config.Agent) OCAgent {
	return OCAgent{
		ID:        a.ID,
		Name:      a.Name,
		Emoji:     a.Emoji,
		Role:      a.Role,
		Team:      a.Team,
		TeamColor: a.TeamColor,
		IsLead:    a.IsLead,
		Parent:    a.Parent,
	}
}

type OpenClawHandler struct{}

// StartAgentStatusPoller runs in a goroutine and broadcasts agent status changes.
func StartAgentStatusPoller(hub interface{ Broadcast(string, interface{}) }) {
	prevStatuses := make(map[string]string)
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		cfgAgents := config.GetAgents()
		agents := make([]OCAgentStatus, 0, len(cfgAgents))
		changed := false
		for _, ca := range cfgAgents {
			s := getOCAgentStatus(agentFromConfig(ca))
			agents = append(agents, s)
			if prev, ok := prevStatuses[ca.Name]; !ok || prev != s.Status {
				changed = true
				prevStatuses[ca.Name] = s.Status
			}
		}
		if changed {
			hub.Broadcast("agent_status_update", agents)
		}
	}
}

// --- Response types ---

type OCAgentStatus struct {
	OCAgent
	Status        string    `json:"status"`
	LastActive    time.Time `json:"lastActive"`
	LastActiveStr string    `json:"lastActiveStr"`
	SessionCount  int       `json:"sessionCount"`
	TotalTokens   int64     `json:"totalTokens"`
	InputTokens   int64     `json:"inputTokens"`
	OutputTokens  int64     `json:"outputTokens"`
	CurrentModel  string    `json:"currentModel"`
	EstimatedCost float64   `json:"estimatedCost"`
	CurrentTask   string    `json:"currentTask,omitempty"`
}

type OCAgentDetail struct {
	OCAgentStatus
	RecentTranscript []OCTranscriptEntry `json:"recentTranscript"`
	ToolsUsed        []string            `json:"toolsUsed"`
	OutputPreview    string              `json:"outputPreview"`
	SessionDuration  string              `json:"sessionDuration"`
}

type OCTranscriptEntry struct {
	Timestamp time.Time `json:"timestamp"`
	TimeStr   string    `json:"timeStr"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	ToolName  string    `json:"toolName,omitempty"`
	Type      string    `json:"type"`
	ExitCode  *int      `json:"exitCode,omitempty"`
	IsError   bool      `json:"isError,omitempty"`
}

type OCStreamEntry struct {
	Timestamp time.Time `json:"timestamp"`
	TimeStr   string    `json:"timeStr"`
	TimeAbs   string    `json:"timeAbs"`
	Agent     string    `json:"agent"`
	Emoji     string    `json:"emoji"`
	TeamColor string    `json:"teamColor"`
	Type      string    `json:"type"`
	Content   string    `json:"content"`
	ToolName  string    `json:"toolName,omitempty"`
	ExitCode  *int      `json:"exitCode,omitempty"`
	IsError   bool      `json:"isError,omitempty"`
}

type OCStats struct {
	TotalAgents   int           `json:"totalAgents"`
	ActiveAgents  int           `json:"activeAgents"`
	IdleAgents    int           `json:"idleAgents"`
	OfflineAgents int           `json:"offlineAgents"`
	TotalTokens   int64         `json:"totalTokens"`
	EstimatedCost float64       `json:"estimatedCost"`
	Teams         []OCTeamStats `json:"teams"`
}

type OCTeamStats struct {
	Name          string  `json:"name"`
	Color         string  `json:"color"`
	TotalAgents   int     `json:"totalAgents"`
	ActiveAgents  int     `json:"activeAgents"`
	TotalTokens   int64   `json:"totalTokens"`
	EstimatedCost float64 `json:"estimatedCost"`
}

// SoulFile holds content and modification time for a single file.
type SoulFile struct {
	Content  string `json:"content"`
	Modified string `json:"modified"`
}

// AgentSoulResponse is returned by GET /api/agents/{id}/soul.
type AgentSoulResponse struct {
	AgentID   string            `json:"agent_id"`
	Soul      *SoulFile         `json:"soul,omitempty"`
	Agents    *SoulFile         `json:"agents,omitempty"`
	Memory    *SoulFile         `json:"memory,omitempty"`
	Heartbeat *SoulFile         `json:"heartbeat,omitempty"`
	Tools     *SoulFile         `json:"tools,omitempty"`
	Errors    map[string]string `json:"errors,omitempty"`
}

// SkillInfo represents a single skill/tool available to an agent.
type SkillInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// --- Handlers ---

func (h *OpenClawHandler) GetAgents(w http.ResponseWriter, r *http.Request) {
	cfgAgents := config.GetAgents()
	statuses := make([]OCAgentStatus, 0, len(cfgAgents))
	for _, ca := range cfgAgents {
		statuses = append(statuses, getOCAgentStatus(agentFromConfig(ca)))
	}
	writeJSON(w, statuses)
}

func (h *OpenClawHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	ca := config.GetAgent(name)
	if ca == nil {
		ca = config.GetAgentByID(name)
	}
	if ca == nil {
		// Try legacy dir lookup
		for agentName, aliases := range config.GetLegacyDirs() {
			for _, alias := range aliases {
				if alias == name {
					ca = config.GetAgent(agentName)
				}
			}
		}
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	detail := getOCAgentDetail(agentFromConfig(*ca))
	writeJSON(w, detail)
}

func (h *OpenClawHandler) GetStream(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if l := r.URL.Query().Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	agentFilter := r.URL.Query().Get("agent_id")
	writeJSON(w, getOCStream(limit, agentFilter))
}

func (h *OpenClawHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, getOCStats())
}

// GetStructure returns the full agent hierarchy tree from config.
func (h *OpenClawHandler) GetStructure(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, config.GetHierarchy())
}

// GetAgentSoul handles GET /api/agents/{id}/soul
// Reads SOUL.md, AGENTS.md, MEMORY.md from {openclaw_dir}/workspace-{agent_id}/
func (h *OpenClawHandler) GetAgentSoul(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	// Resolve agent by ID or name
	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	openClawDir := config.GetOpenClawDir()
	agentID := ca.ID

	// Try workspace candidates
	candidates := []string{
		filepath.Join(openClawDir, "workspace-"+agentID),
		filepath.Join(openClawDir, "workspace-"+ca.Name),
	}
	// Also try legacy directory aliases as workspace names
	legacyDirs := config.GetLegacyDirs()
	if aliases, ok := legacyDirs[ca.Name]; ok {
		for _, alias := range aliases {
			candidates = append(candidates, filepath.Join(openClawDir, "workspace-"+alias))
		}
	}
	// Special case: if agent id is "thunder" or "main", also try workspace (no suffix).
	// Note: ca.Name may have different casing (e.g. "Thunder"), so we use agentID (always lowercase).
	if agentID == "main" || agentID == "thunder" || agentID == "titan" {
		candidates = append(candidates,
			filepath.Join(openClawDir, "workspace-"+agentID),
			filepath.Join(openClawDir, "workspace"),
		)
	}

	allowedBase := filepath.Clean(openClawDir)

	var workspaceDir string
	for _, c := range candidates {
		cleanCandidate := filepath.Clean(c)
		if !strings.HasPrefix(cleanCandidate, allowedBase) {
			// Reject any candidate that escapes the openclaw directory
			continue
		}
		if info, err := os.Stat(cleanCandidate); err == nil && info.IsDir() {
			workspaceDir = cleanCandidate
			break
		}
	}

	resp := AgentSoulResponse{
		AgentID: agentID,
		Errors:  make(map[string]string),
	}

	type fileTarget struct {
		name string
		dest **SoulFile
	}
	targets := []fileTarget{
		{"SOUL.md", &resp.Soul},
		{"AGENTS.md", &resp.Agents},
		{"MEMORY.md", &resp.Memory},
		{"HEARTBEAT.md", &resp.Heartbeat},
		{"TOOLS.md", &resp.Tools},
	}

	for _, ft := range targets {
		if workspaceDir == "" {
			resp.Errors[ft.name] = "workspace directory not found"
			continue
		}
		path := filepath.Join(workspaceDir, ft.name)
		info, err := os.Stat(path)
		if err != nil {
			resp.Errors[ft.name] = err.Error()
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			resp.Errors[ft.name] = err.Error()
			continue
		}
		*ft.dest = &SoulFile{
			Content:  string(data),
			Modified: info.ModTime().UTC().Format(time.RFC3339),
		}
	}

	if len(resp.Errors) == 0 {
		resp.Errors = nil
	}

	writeJSON(w, resp)
}

// UpdateAgentSoul handles PUT /api/agents/{id}/soul
// Accepts {file: "memory"|"soul"|"heartbeat"|"agents", content: "..."}
// and writes the content to the agent's workspace file.
func (h *OpenClawHandler) UpdateAgentSoul(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 2<<20) // 2 MB limit
	var req struct {
		File    string `json:"file"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate file name — only allow the 4 safe files
	allowedFiles := map[string]string{
		"memory":    "MEMORY.md",
		"soul":      "SOUL.md",
		"heartbeat": "HEARTBEAT.md",
		"agents":    "AGENTS.md",
	}
	filename, ok := allowedFiles[req.File]
	if !ok {
		http.Error(w, "Invalid file: must be one of memory, soul, heartbeat, agents", http.StatusBadRequest)
		return
	}

	openClawDir := config.GetOpenClawDir()
	agentID := ca.ID

	// Resolve workspace directory (same logic as GetAgentSoul)
	candidates := []string{
		filepath.Join(openClawDir, "workspace-"+agentID),
		filepath.Join(openClawDir, "workspace-"+ca.Name),
	}
	legacyDirs := config.GetLegacyDirs()
	if aliases, ok := legacyDirs[ca.Name]; ok {
		for _, alias := range aliases {
			candidates = append(candidates, filepath.Join(openClawDir, "workspace-"+alias))
		}
	}
	if agentID == "main" || agentID == "thunder" || agentID == "titan" {
		candidates = append(candidates, filepath.Join(openClawDir, "workspace"))
	}

	allowedBase := filepath.Clean(openClawDir)

	var workspaceDir string
	for _, c := range candidates {
		cleanCandidate := filepath.Clean(c)
		if !strings.HasPrefix(cleanCandidate, allowedBase) {
			continue
		}
		if info, err := os.Stat(cleanCandidate); err == nil && info.IsDir() {
			workspaceDir = cleanCandidate
			break
		}
	}
	if workspaceDir == "" {
		http.Error(w, "Workspace directory not found for agent", http.StatusNotFound)
		return
	}

	// Construct target path and verify it stays within workspace
	targetPath := filepath.Clean(filepath.Join(workspaceDir, filename))
	if !strings.HasPrefix(targetPath, filepath.Clean(workspaceDir)+string(os.PathSeparator)) &&
		targetPath != filepath.Clean(workspaceDir) {
		http.Error(w, "Path traversal detected", http.StatusForbidden)
		return
	}

	// Auto-create a snapshot before overwriting the file
	_, _ = CreateSnapshotForAgent(ca.ID, "auto-save-"+req.File)

	if err := os.WriteFile(targetPath, []byte(req.Content), 0644); err != nil {
		http.Error(w, "Failed to write file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{"message": "File saved successfully", "file": filename})
}

// GetAgentTimeline handles GET /api/agents/{id}/timeline?hours=24
// Returns a chronological list of key events from the agent's JSONL sessions.
func (h *OpenClawHandler) GetAgentTimeline(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	hoursParam := r.URL.Query().Get("hours")
	hours := 24
	if hoursParam != "" {
		var n int
		if _, err := fmt.Sscanf(hoursParam, "%d", &n); err == nil && n > 0 && n <= 168 {
			hours = n
		}
	}

	cutoff := time.Now().Add(-time.Duration(hours) * time.Hour)
	agent := agentFromConfig(*ca)

	openClawDir := config.GetOpenClawDir()
	var allJSONLFiles []string

	for _, dirName := range getSessionDirs(agent) {
		sessionsDir := filepath.Join(openClawDir, "agents", dirName, "sessions")
		entries, err := os.ReadDir(sessionsDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			// Only include files modified within the time window (rough filter)
			if info.ModTime().After(cutoff) {
				allJSONLFiles = append(allJSONLFiles, filepath.Join(sessionsDir, e.Name()))
			}
		}
	}

	type TimelineEvent struct {
		Timestamp string `json:"timestamp"`
		Type      string `json:"type"` // tool_call | response | error | task
		Title     string `json:"title"`
		Detail    string `json:"detail"`
	}

	var events []TimelineEvent
	seenTS := make(map[string]bool) // deduplicate by exact timestamp+type+title

	for _, jsonlPath := range allJSONLFiles {
		file, err := os.Open(jsonlPath)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)

		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}
			var entry map[string]interface{}
			if err := json.Unmarshal(line, &entry); err != nil {
				continue
			}

			entryType, _ := entry["type"].(string)
			if entryType != "message" {
				continue
			}

			ts := parseTS(entry)
			if ts.Before(cutoff) {
				continue
			}

			msg, ok := entry["message"].(map[string]interface{})
			if !ok {
				continue
			}
			role, _ := msg["role"].(string)

			tsStr := ts.UTC().Format(time.RFC3339)

			switch role {
			case "user":
				text := extractUserContent(msg)
				if text == "" {
					continue
				}
				// Filter out heartbeat messages (too noisy)
				if strings.Contains(text, "HEARTBEAT") || strings.Contains(text, "heartbeat") {
					continue
				}
				title := truncate(text, 80)
				key := tsStr + ":task:" + title
				if seenTS[key] {
					continue
				}
				seenTS[key] = true
				events = append(events, TimelineEvent{
					Timestamp: tsStr,
					Type:      "task",
					Title:     title,
					Detail:    text,
				})

			case "assistant":
				content, ok := msg["content"].([]interface{})
				if !ok {
					continue
				}
				for _, block := range content {
					bm, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					blockType, _ := bm["type"].(string)
					switch blockType {
					case "text":
						text, _ := bm["text"].(string)
						text = strings.TrimSpace(text)
						if text == "" || text == "HEARTBEAT_OK" {
							continue
						}
						title := truncate(text, 80)
						key := tsStr + ":response:" + title
						if seenTS[key] {
							continue
						}
						seenTS[key] = true
						events = append(events, TimelineEvent{
							Timestamp: tsStr,
							Type:      "response",
							Title:     title,
							Detail:    text,
						})
					case "tool_use", "toolCall":
						toolName, _ := bm["name"].(string)
						args := extractToolArgs(bm)
						cmd := formatCommand(toolName, args)
						key := tsStr + ":tool_call:" + cmd
						if seenTS[key] {
							continue
						}
						seenTS[key] = true
						argBytes, _ := json.Marshal(args)
						events = append(events, TimelineEvent{
							Timestamp: tsStr,
							Type:      "tool_call",
							Title:     cmd,
							Detail:    string(argBytes),
						})
					}
				}

			case "toolResult":
				toolName, _ := msg["toolName"].(string)
				isError, _ := msg["isError"].(bool)
				content := extractToolResultContent(msg)
				if !isError {
					continue // only record errors for tool results
				}
				title := toolName + ": " + truncate(content, 60)
				key := tsStr + ":error:" + title
				if seenTS[key] {
					continue
				}
				seenTS[key] = true
				events = append(events, TimelineEvent{
					Timestamp: tsStr,
					Type:      "error",
					Title:     title,
					Detail:    content,
				})
			}
		}
		file.Close()
	}

	// Sort by timestamp ascending
	sort.Slice(events, func(i, j int) bool {
		return events[i].Timestamp < events[j].Timestamp
	})

	if events == nil {
		events = []TimelineEvent{}
	}
	writeJSON(w, events)
}

// GetAgentSkills handles GET /api/agents/{id}/skills
// Returns list of skills from global ~/.openclaw/skills/ directory.
func (h *OpenClawHandler) GetAgentSkills(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	ca := config.GetAgentByID(id)
	if ca == nil {
		ca = config.GetAgent(id)
	}
	if ca == nil {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	openClawDir := config.GetOpenClawDir()
	var skills []SkillInfo

	// Read from global skills directory
	globalSkillsDir := filepath.Join(openClawDir, "skills")
	entries, err := os.ReadDir(globalSkillsDir)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			skillMDPath := filepath.Join(globalSkillsDir, e.Name(), "SKILL.md")
			data, readErr := os.ReadFile(skillMDPath)
			description := ""
			if readErr == nil {
				lines := strings.Split(string(data), "\n")
				// Use first non-empty, non-heading line as description
				for _, line := range lines {
					trimmed := strings.TrimSpace(line)
					if trimmed == "" || strings.HasPrefix(trimmed, "#") {
						continue
					}
					description = trimmed
					break
				}
				// Fall back to the heading title
				if description == "" && len(lines) > 0 {
					description = strings.TrimPrefix(strings.TrimSpace(lines[0]), "# ")
				}
			}
			skills = append(skills, SkillInfo{
				Name:        e.Name(),
				Description: description,
			})
		}
	}

	// Also check agent-specific workspace skills dir
	agentID := ca.ID
	workspaceSkillsDir := filepath.Join(openClawDir, "workspace-"+agentID, "skills")
	agentEntries, err := os.ReadDir(workspaceSkillsDir)
	if err == nil {
		for _, e := range agentEntries {
			if !e.IsDir() {
				continue
			}
			skillMDPath := filepath.Join(workspaceSkillsDir, e.Name(), "SKILL.md")
			data, readErr := os.ReadFile(skillMDPath)
			description := ""
			if readErr == nil {
				lines := strings.Split(string(data), "\n")
				for _, line := range lines {
					trimmed := strings.TrimSpace(line)
					if trimmed == "" || strings.HasPrefix(trimmed, "#") {
						continue
					}
					description = trimmed
					break
				}
				if description == "" && len(lines) > 0 {
					description = strings.TrimPrefix(strings.TrimSpace(lines[0]), "# ")
				}
			}
			skills = append(skills, SkillInfo{
				Name:        e.Name(),
				Description: description,
			})
		}
	}

	if skills == nil {
		skills = []SkillInfo{}
	}
	writeJSON(w, skills)
}

// --- Core logic ---

func getSessionDirs(agent OCAgent) []string {
	dirs := []string{agent.ID}
	if agent.ID != agent.Name {
		dirs = append(dirs, agent.Name)
	}
	legacyDirs := config.GetLegacyDirs()
	if aliases, ok := legacyDirs[agent.Name]; ok {
		dirs = append(dirs, aliases...)
	}
	return dirs
}

func getOCAgentStatus(agent OCAgent) OCAgentStatus {
	openClawDir := config.GetOpenClawDir()
	status := OCAgentStatus{
		OCAgent:      agent,
		Status:       "offline",
		CurrentModel: "N/A",
	}

	var latestSession time.Time
	var totalInput, totalOutput int64

	for _, dirName := range getSessionDirs(agent) {
		sessionsPath := filepath.Join(openClawDir, "agents", dirName, "sessions", "sessions.json")
		data, err := os.ReadFile(sessionsPath)
		if err != nil {
			continue
		}

		var sessionsMap map[string]map[string]interface{}
		if err := json.Unmarshal(data, &sessionsMap); err != nil {
			continue
		}

		for _, session := range sessionsMap {
			status.SessionCount++

			if updatedAt, ok := session["updatedAt"].(float64); ok {
				sessionTime := time.Unix(0, int64(updatedAt)*int64(time.Millisecond))
				if sessionTime.After(latestSession) {
					latestSession = sessionTime
					if model, ok := session["model"].(string); ok && model != "" {
						status.CurrentModel = model
					} else if model, ok := session["modelOverride"].(string); ok && model != "" {
						status.CurrentModel = model
					}
				}
			}

			if v, ok := session["inputTokens"].(float64); ok {
				totalInput += int64(v)
			} else if usage, ok := session["usage"].(map[string]interface{}); ok {
				if v, ok := usage["inputTokens"].(float64); ok {
					totalInput += int64(v)
				}
			}
			if v, ok := session["outputTokens"].(float64); ok {
				totalOutput += int64(v)
			} else if usage, ok := session["usage"].(map[string]interface{}); ok {
				if v, ok := usage["outputTokens"].(float64); ok {
					totalOutput += int64(v)
				}
			}
		}
	}

	status.InputTokens = totalInput
	status.OutputTokens = totalOutput
	status.TotalTokens = totalInput + totalOutput

	if !latestSession.IsZero() {
		status.LastActive = latestSession
		status.LastActiveStr = formatRelTime(latestSession)
		since := time.Since(latestSession)
		switch {
		case since < 5*time.Minute:
			status.Status = "active"
		case since < 30*time.Minute:
			status.Status = "idle"
		default:
			status.Status = "offline"
		}
	} else {
		status.LastActiveStr = "Never"
	}

	// Fallback: if no model found in session JSONL, try openclaw.json defaultModel
	if status.CurrentModel == "N/A" {
		if ocJSON, err := os.ReadFile(filepath.Join(openClawDir, "openclaw.json")); err == nil {
			var ocConf map[string]interface{}
			if json.Unmarshal(ocJSON, &ocConf) == nil {
				if dm, ok := ocConf["defaultModel"].(string); ok && dm != "" {
					status.CurrentModel = dm
				}
			}
		}
	}

	status.EstimatedCost = calcCost(status.CurrentModel, totalInput, totalOutput)
	status.CurrentTask = getLatestTask(agent.Name)

	return status
}

func getOCAgentDetail(agent OCAgent) OCAgentDetail {
	status := getOCAgentStatus(agent)
	detail := OCAgentDetail{
		OCAgentStatus: status,
		ToolsUsed:     []string{},
	}

	latestJSONL, latestTime := findLatestJSONLForAgent(agent)
	if latestJSONL == "" {
		return detail
	}
	_ = latestTime

	entries := readLastJSONLEntries(latestJSONL, 100*1024)
	toolsMap := make(map[string]bool)
	var lastAssistant string
	var sessionStart, sessionEnd time.Time

	for _, entry := range entries {
		ts := parseTS(entry)
		if sessionStart.IsZero() {
			sessionStart = ts
		}
		sessionEnd = ts

		msg, ok := entry["message"].(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)

		if role == "assistant" {
			if content, ok := msg["content"].([]interface{}); ok {
				for _, block := range content {
					bm, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					if bm["type"] == "text" {
						if t, ok := bm["text"].(string); ok {
							lastAssistant = t
						}
					}
					if bm["type"] == "tool_use" || bm["type"] == "toolCall" {
						if n, ok := bm["name"].(string); ok {
							toolsMap[n] = true
						}
					}
				}
			}
		}

		tes := parseTranscriptEntry(entry, agent)
		detail.RecentTranscript = append(detail.RecentTranscript, tes...)
	}

	if len(detail.RecentTranscript) > 50 {
		detail.RecentTranscript = detail.RecentTranscript[len(detail.RecentTranscript)-50:]
	}

	detail.OutputPreview = truncate(lastAssistant, 500)
	for t := range toolsMap {
		detail.ToolsUsed = append(detail.ToolsUsed, t)
	}
	sort.Strings(detail.ToolsUsed)

	if !sessionStart.IsZero() && !sessionEnd.IsZero() {
		detail.SessionDuration = fmtDuration(sessionEnd.Sub(sessionStart))
	}

	return detail
}

func getOCStream(limit int, agentFilter string) []OCStreamEntry {
	all := make([]OCStreamEntry, 0)

	for _, ca := range config.GetAgents() {
		// Filter by agent_id or name if requested
		if agentFilter != "" && ca.ID != agentFilter && ca.Name != agentFilter &&
			!strings.EqualFold(ca.ID, agentFilter) && !strings.EqualFold(ca.Name, agentFilter) {
			continue
		}
		agent := agentFromConfig(ca)
		latestJSONL, _ := findLatestJSONLForAgent(agent)
		if latestJSONL == "" {
			continue
		}
		entries := readLastJSONLEntries(latestJSONL, 20*1024)
		for _, entry := range entries {
			all = append(all, parseJSONLToStream(entry, agent)...)
		}
	}

	// Filter out stale entries older than 48 hours
	cutoff := time.Now().Add(-48 * time.Hour)
	filtered := make([]OCStreamEntry, 0, len(all))
	for _, e := range all {
		if e.Timestamp.After(cutoff) {
			filtered = append(filtered, e)
		}
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Timestamp.After(filtered[j].Timestamp)
	})

	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	return filtered
}

func getOCStats() OCStats {
	cfgAgents := config.GetAgents()
	stats := OCStats{TotalAgents: len(cfgAgents)}

	teamMap := make(map[string]*OCTeamStats)

	for _, ca := range cfgAgents {
		agent := agentFromConfig(ca)
		s := getOCAgentStatus(agent)
		switch s.Status {
		case "active":
			stats.ActiveAgents++
		case "idle":
			stats.IdleAgents++
		default:
			stats.OfflineAgents++
		}
		stats.TotalTokens += s.TotalTokens
		stats.EstimatedCost += s.EstimatedCost

		if _, ok := teamMap[ca.Team]; !ok {
			teamMap[ca.Team] = &OCTeamStats{Name: ca.Team, Color: ca.TeamColor}
		}
		ts := teamMap[ca.Team]
		ts.TotalAgents++
		if s.Status == "active" {
			ts.ActiveAgents++
		}
		ts.TotalTokens += s.TotalTokens
		ts.EstimatedCost += s.EstimatedCost
	}

	for _, ts := range teamMap {
		stats.Teams = append(stats.Teams, *ts)
	}
	sort.Slice(stats.Teams, func(i, j int) bool {
		return stats.Teams[i].Name < stats.Teams[j].Name
	})
	return stats
}

// --- Helpers ---

func getLatestTask(agentName string) string {
	ca := config.GetAgent(agentName)
	if ca == nil {
		return ""
	}
	latestJSONL, _ := findLatestJSONLForAgent(agentFromConfig(*ca))
	if latestJSONL == "" {
		return ""
	}

	entries := readLastJSONLEntries(latestJSONL, 30*1024)
	var lastUser string
	for _, entry := range entries {
		msg, ok := entry["message"].(map[string]interface{})
		if !ok {
			continue
		}
		if role, _ := msg["role"].(string); role == "user" {
			if c, ok := msg["content"].(string); ok {
				lastUser = c
			}
		}
	}
	return truncate(lastUser, 200)
}

func findLatestJSONLForAgent(agent OCAgent) (string, time.Time) {
	openClawDir := config.GetOpenClawDir()
	var bestPath string
	var bestTime time.Time
	for _, dirName := range getSessionDirs(agent) {
		sessionsDir := filepath.Join(openClawDir, "agents", dirName, "sessions")
		p, t := findLatestJSONL(sessionsDir)
		if t.After(bestTime) {
			bestPath = p
			bestTime = t
		}
	}
	return bestPath, bestTime
}

func findLatestJSONL(dir string) (string, time.Time) {
	var best string
	var bestTime time.Time

	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", time.Time{}
	}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().After(bestTime) {
			bestTime = info.ModTime()
			best = filepath.Join(dir, e.Name())
		}
	}
	return best, bestTime
}

func readLastJSONLEntries(path string, maxBytes int) []map[string]interface{} {
	var entries []map[string]interface{}
	file, err := os.Open(path)
	if err != nil {
		return entries
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return entries
	}

	offset := int64(0)
	if info.Size() > int64(maxBytes) {
		offset = info.Size() - int64(maxBytes)
	}
	file.Seek(offset, 0)

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)

	if offset > 0 {
		scanner.Scan() // skip partial first line
	}

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var entry map[string]interface{}
		if err := json.Unmarshal(line, &entry); err != nil {
			continue
		}
		entries = append(entries, entry)
	}
	return entries
}

func parseJSONLToStream(entry map[string]interface{}, agent OCAgent) []OCStreamEntry {
	var results []OCStreamEntry

	entryType, _ := entry["type"].(string)
	if entryType != "message" {
		return nil
	}

	msg, ok := entry["message"].(map[string]interface{})
	if !ok {
		return nil
	}

	ts := parseTS(entry)
	base := OCStreamEntry{
		Timestamp: ts,
		TimeStr:   formatRelTime(ts),
		TimeAbs:   ts.Local().Format("15:04:05"),
		Agent:     agent.Name,
		Emoji:     agent.Emoji,
		TeamColor: agent.TeamColor,
	}

	role, _ := msg["role"].(string)

	switch role {
	case "user":
		text := extractUserContent(msg)
		if text != "" {
			e := base
			e.Type = "prompt"
			e.Content = truncate(text, 500)
			results = append(results, e)
		}

	case "assistant":
		content, ok := msg["content"].([]interface{})
		if !ok {
			return nil
		}
		for _, block := range content {
			bm, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			blockType, _ := bm["type"].(string)
			switch blockType {
			case "text":
				text, _ := bm["text"].(string)
				if strings.TrimSpace(text) != "" {
					e := base
					e.Type = "response"
					e.Content = truncate(text, 500)
					results = append(results, e)
				}
			case "toolCall", "tool_use":
				toolName, _ := bm["name"].(string)
				args := extractToolArgs(bm)
				e := base
				e.Type = "command"
				e.ToolName = toolName
				e.Content = formatCommand(toolName, args)
				results = append(results, e)
			}
		}

	case "toolResult", "tool":
		toolName, _ := msg["toolName"].(string)
		content := extractToolResultContent(msg)
		e := base
		e.Type = "result"
		e.ToolName = toolName
		e.Content = truncate(content, 500)
		if details, ok := msg["details"].(map[string]interface{}); ok {
			if ec, ok := details["exitCode"].(float64); ok {
				code := int(ec)
				e.ExitCode = &code
			}
		}
		if isErr, ok := msg["isError"].(bool); ok {
			e.IsError = isErr
		}
		results = append(results, e)
	}

	return results
}

func parseTranscriptEntry(entry map[string]interface{}, agent OCAgent) []OCTranscriptEntry {
	streamEntries := parseJSONLToStream(entry, agent)
	var results []OCTranscriptEntry
	for _, se := range streamEntries {
		results = append(results, OCTranscriptEntry{
			Timestamp: se.Timestamp,
			TimeStr:   se.TimeStr,
			Role:      se.Agent,
			Content:   se.Content,
			ToolName:  se.ToolName,
			Type:      se.Type,
			ExitCode:  se.ExitCode,
			IsError:   se.IsError,
		})
	}
	return results
}

func extractUserContent(msg map[string]interface{}) string {
	if s, ok := msg["content"].(string); ok {
		return s
	}
	if arr, ok := msg["content"].([]interface{}); ok {
		var parts []string
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				if m["type"] == "text" {
					if t, ok := m["text"].(string); ok {
						parts = append(parts, t)
					}
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func extractToolArgs(bm map[string]interface{}) map[string]interface{} {
	if args, ok := bm["arguments"].(map[string]interface{}); ok {
		return args
	}
	if args, ok := bm["input"].(map[string]interface{}); ok {
		return args
	}
	if argsStr, ok := bm["arguments"].(string); ok {
		var args map[string]interface{}
		if json.Unmarshal([]byte(argsStr), &args) == nil {
			return args
		}
	}
	return nil
}

func extractToolResultContent(msg map[string]interface{}) string {
	if details, ok := msg["details"].(map[string]interface{}); ok {
		if agg, ok := details["aggregated"].(string); ok && agg != "" {
			return agg
		}
	}
	if content, ok := msg["content"].([]interface{}); ok {
		var parts []string
		for _, item := range content {
			if m, ok := item.(map[string]interface{}); ok {
				if t, ok := m["text"].(string); ok {
					parts = append(parts, t)
				}
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "\n")
		}
	}
	if s, ok := msg["content"].(string); ok {
		return s
	}
	return ""
}

func formatCommand(toolName string, args map[string]interface{}) string {
	if args == nil {
		return toolName
	}
	switch toolName {
	case "exec":
		cmd, _ := args["command"].(string)
		return fmt.Sprintf("exec: %s", cmd)
	case "Read", "read":
		path, _ := args["file_path"].(string)
		if path == "" {
			path, _ = args["path"].(string)
		}
		return fmt.Sprintf("read: %s", path)
	case "Write", "write":
		path, _ := args["file_path"].(string)
		if path == "" {
			path, _ = args["path"].(string)
		}
		return fmt.Sprintf("write: %s", path)
	case "Edit", "edit":
		path, _ := args["file_path"].(string)
		if path == "" {
			path, _ = args["path"].(string)
		}
		return fmt.Sprintf("edit: %s", path)
	case "web_search":
		q, _ := args["query"].(string)
		return fmt.Sprintf("search: %s", q)
	case "web_fetch":
		url, _ := args["url"].(string)
		return fmt.Sprintf("fetch: %s", url)
	case "browser":
		action, _ := args["action"].(string)
		return fmt.Sprintf("browser: %s", action)
	case "message":
		action, _ := args["action"].(string)
		target, _ := args["target"].(string)
		if target != "" {
			return fmt.Sprintf("message: %s → %s", action, target)
		}
		return fmt.Sprintf("message: %s", action)
	default:
		for _, v := range args {
			if s, ok := v.(string); ok && len(s) < 100 {
				return fmt.Sprintf("%s: %s", toolName, s)
			}
		}
		return toolName
	}
}

func parseTS(entry map[string]interface{}) time.Time {
	// Try float64 (milliseconds since epoch)
	if ts, ok := entry["timestamp"].(float64); ok {
		return time.Unix(0, int64(ts)*int64(time.Millisecond))
	}
	// Try ISO 8601 string
	if ts, ok := entry["timestamp"].(string); ok {
		if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
			return t
		}
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			return t
		}
		if t, err := time.Parse("2006-01-02T15:04:05.000Z", ts); err == nil {
			return t
		}
	}
	return time.Now()
}

func formatRelTime(t time.Time) string {
	diff := time.Since(t)
	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		m := int(diff.Minutes())
		if m == 1 {
			return "1 min ago"
		}
		return fmt.Sprintf("%d mins ago", m)
	case diff < 24*time.Hour:
		h := int(diff.Hours())
		if h == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", h)
	default:
		d := int(diff.Hours() / 24)
		if d == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", d)
	}
}

func fmtDuration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%dh %dm", int(d.Hours()), int(d.Minutes())%60)
	}
}

func calcCost(model string, input, output int64) float64 {
	var ic, oc float64
	switch {
	case strings.Contains(model, "opus"):
		ic, oc = 15.0, 75.0
	case strings.Contains(model, "sonnet"):
		ic, oc = 3.0, 15.0
	case strings.Contains(model, "haiku"):
		ic, oc = 0.25, 1.25
	default:
		ic, oc = 3.0, 15.0
	}
	return (float64(input)/1e6)*ic + (float64(output)/1e6)*oc
}

func truncate(s string, max int) string {
	if len(s) > max {
		return s[:max-3] + "..."
	}
	return s
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
