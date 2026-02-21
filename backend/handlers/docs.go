package handlers

import (
	"net/http"
)

// APIEndpoint describes a single REST endpoint in the API docs.
type APIEndpoint struct {
	Method          string      `json:"method"`
	Path            string      `json:"path"`
	Category        string      `json:"category"`
	Description     string      `json:"description"`
	Params          []APIParam  `json:"params,omitempty"`
	ExampleResponse interface{} `json:"example_response,omitempty"`
}

// APIParam describes a query/path/body parameter.
type APIParam struct {
	Name        string `json:"name"`
	In          string `json:"in"` // path | query | body
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

// GetAPIDocs handles GET /api/docs — returns JSON schema of all endpoints.
func GetAPIDocs(w http.ResponseWriter, r *http.Request) {
	endpoints := []APIEndpoint{
		// ── Auth ──────────────────────────────────────────────────────────────
		{
			Method:      "POST",
			Path:        "/api/auth/login",
			Category:    "Auth",
			Description: "Authenticate with a password and receive a bearer token.",
			Params: []APIParam{
				{Name: "password", In: "body", Type: "string", Required: true, Description: "Dashboard password"},
			},
			ExampleResponse: map[string]interface{}{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."},
		},
		{
			Method:          "POST",
			Path:            "/api/auth/logout",
			Category:        "Auth",
			Description:     "Invalidate the current bearer token.",
			ExampleResponse: map[string]interface{}{"message": "Logged out"},
		},
		{
			Method:          "GET",
			Path:            "/api/auth/me",
			Category:        "Auth",
			Description:     "Return the currently authenticated user info.",
			ExampleResponse: map[string]interface{}{"authenticated": true},
		},

		// ── Agents ────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/openclaw/agents",
			Category:    "Agents",
			Description: "List all agents with live status, token usage and cost.",
			ExampleResponse: []map[string]interface{}{
				{"id": "anvil", "name": "anvil", "status": "active", "currentModel": "claude-sonnet-4-5", "totalTokens": 142000, "estimatedCost": 0.42},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/openclaw/agents/{name}",
			Category:    "Agents",
			Description: "Get detailed information for a single agent including recent transcript.",
			Params: []APIParam{
				{Name: "name", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: map[string]interface{}{"id": "anvil", "status": "active", "toolsUsed": []string{"exec", "Read", "Write"}},
		},
		{
			Method:      "GET",
			Path:        "/api/agents",
			Category:    "Agents",
			Description: "List all agents from the database (persisted records).",
			ExampleResponse: []map[string]interface{}{
				{"id": "anvil", "name": "anvil", "team": "Engineering"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}",
			Category:    "Agents",
			Description: "Get a single agent record from the database.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent UUID or name"},
			},
		},
		{
			Method:      "PUT",
			Path:        "/api/agents/{id}/status",
			Category:    "Agents",
			Description: "Update an agent's status.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID"},
				{Name: "status", In: "body", Type: "string", Required: true, Description: "New status value"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/agents/{id}/pause",
			Category:    "Agents",
			Description: "Send a pause signal to an agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: map[string]interface{}{"message": "Agent paused"},
		},
		{
			Method:      "POST",
			Path:        "/api/agents/{id}/resume",
			Category:    "Agents",
			Description: "Resume a paused agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: map[string]interface{}{"message": "Agent resumed"},
		},
		{
			Method:      "POST",
			Path:        "/api/agents/{id}/kill",
			Category:    "Agents",
			Description: "Terminate an agent process.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: map[string]interface{}{"message": "Agent killed"},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/soul",
			Category:    "Agents",
			Description: "Read an agent's workspace files: SOUL.md, MEMORY.md, HEARTBEAT.md, AGENTS.md, TOOLS.md.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: map[string]interface{}{
				"agent_id": "anvil",
				"soul":     map[string]interface{}{"content": "# Anvil\n...", "modified": "2024-01-15T10:30:00Z"},
				"memory":   map[string]interface{}{"content": "...", "modified": "2024-01-15T09:00:00Z"},
			},
		},
		{
			Method:      "PUT",
			Path:        "/api/agents/{id}/soul",
			Category:    "Agents",
			Description: "Update one of an agent's workspace files. Auto-creates a snapshot before saving.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
				{Name: "file", In: "body", Type: "string", Required: true, Description: "One of: soul, memory, heartbeat, agents"},
				{Name: "content", In: "body", Type: "string", Required: true, Description: "New file content"},
			},
			ExampleResponse: map[string]interface{}{"message": "File saved successfully", "file": "MEMORY.md"},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/activity",
			Category:    "Agents",
			Description: "Get recent activity entries for a specific agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/metrics",
			Category:    "Agents",
			Description: "Get performance metrics for a specific agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/timeline",
			Category:    "Agents",
			Description: "Get a chronological timeline of key events from the agent's session files.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
				{Name: "hours", In: "query", Type: "integer", Required: false, Description: "Lookback window in hours (default: 24, max: 168)"},
			},
			ExampleResponse: []map[string]interface{}{
				{"timestamp": "2024-01-15T10:00:00Z", "type": "task", "title": "Build the API docs page", "detail": "..."},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/skills",
			Category:    "Agents",
			Description: "List skills available to an agent (from global and workspace skill directories).",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: []map[string]interface{}{
				{"name": "git", "description": "Git operations skill"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/commits",
			Category:    "Agents",
			Description: "Get recent git commits authored by this agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max number of commits to return (default: 10)"},
			},
			ExampleResponse: []map[string]interface{}{
				{"hash": "abc1234", "message": "feat: add API docs", "date": "2024-01-15T10:00:00Z", "repo": "agentboard"},
			},
		},

		// ── Snapshots ─────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/agents/{id}/snapshots",
			Category:    "Snapshots",
			Description: "List configuration snapshots for this agent (soul, memory, heartbeat files).",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
			},
			ExampleResponse: []map[string]interface{}{
				{"id": "20240115-103045", "created_at": "2024-01-15T10:30:45Z", "files": []string{"SOUL.md", "MEMORY.md"}, "size_bytes": 4096},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/agents/{id}/snapshots",
			Category:    "Snapshots",
			Description: "Create a new snapshot of the agent's current workspace files.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
				{Name: "label", In: "body", Type: "string", Required: false, Description: "Optional human-readable label for the snapshot"},
			},
			ExampleResponse: map[string]interface{}{"id": "20240115-103045", "created_at": "2024-01-15T10:30:45Z", "files": []string{"SOUL.md", "MEMORY.md", "HEARTBEAT.md"}},
		},
		{
			Method:      "POST",
			Path:        "/api/agents/{id}/snapshots/{snapshot_id}/restore",
			Category:    "Snapshots",
			Description: "Restore an agent's workspace files from a snapshot. Auto-creates a pre-restore snapshot first.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Agent ID or name"},
				{Name: "snapshot_id", In: "path", Type: "string", Required: true, Description: "Snapshot timestamp ID"},
			},
			ExampleResponse: map[string]interface{}{"message": "Snapshot restored", "restored_files": []string{"SOUL.md", "MEMORY.md"}},
		},

		// ── Tasks ─────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/tasks",
			Category:    "Tasks",
			Description: "List all tasks with optional filters.",
			Params: []APIParam{
				{Name: "status", In: "query", Type: "string", Required: false, Description: "Filter by status: todo | in-progress | done | blocked"},
				{Name: "assignee", In: "query", Type: "string", Required: false, Description: "Filter by assignee agent ID"},
				{Name: "team", In: "query", Type: "string", Required: false, Description: "Filter by team name"},
				{Name: "priority", In: "query", Type: "string", Required: false, Description: "Filter by priority: low | medium | high | critical"},
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max results (default: 100)"},
			},
			ExampleResponse: []map[string]interface{}{
				{"id": "uuid", "title": "Build API docs", "status": "in-progress", "assignee": "anvil", "priority": "medium"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/tasks",
			Category:    "Tasks",
			Description: "Create a new task.",
			Params: []APIParam{
				{Name: "title", In: "body", Type: "string", Required: true, Description: "Task title"},
				{Name: "description", In: "body", Type: "string", Required: false, Description: "Detailed description"},
				{Name: "assignee", In: "body", Type: "string", Required: false, Description: "Agent ID to assign to"},
				{Name: "team", In: "body", Type: "string", Required: false, Description: "Team name"},
				{Name: "priority", In: "body", Type: "string", Required: false, Description: "low | medium | high | critical"},
				{Name: "status", In: "body", Type: "string", Required: false, Description: "Initial status (default: todo)"},
			},
			ExampleResponse: map[string]interface{}{"id": "uuid", "title": "Build API docs", "status": "todo"},
		},
		{
			Method:      "GET",
			Path:        "/api/tasks/{id}",
			Category:    "Tasks",
			Description: "Get a single task by ID.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
			},
		},
		{
			Method:      "PUT",
			Path:        "/api/tasks/{id}",
			Category:    "Tasks",
			Description: "Update a task's fields.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
				{Name: "title", In: "body", Type: "string", Required: false, Description: "New title"},
				{Name: "description", In: "body", Type: "string", Required: false, Description: "New description"},
				{Name: "status", In: "body", Type: "string", Required: false, Description: "New status"},
				{Name: "priority", In: "body", Type: "string", Required: false, Description: "New priority"},
			},
		},
		{
			Method:      "DELETE",
			Path:        "/api/tasks/{id}",
			Category:    "Tasks",
			Description: "Delete a task permanently.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/tasks/{id}/transition",
			Category:    "Tasks",
			Description: "Transition a task to a new status.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
				{Name: "status", In: "body", Type: "string", Required: true, Description: "Target status: todo | in-progress | done | blocked"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/tasks/{id}/assign",
			Category:    "Tasks",
			Description: "Assign a task to an agent.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
				{Name: "assignee", In: "body", Type: "string", Required: true, Description: "Agent ID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/tasks/{id}/history",
			Category:    "Tasks",
			Description: "Get the status transition history for a task.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/tasks/mine",
			Category:    "Tasks",
			Description: "Get tasks assigned to a specific agent.",
			Params: []APIParam{
				{Name: "agent_id", In: "query", Type: "string", Required: true, Description: "Agent ID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/tasks/stuck",
			Category:    "Tasks",
			Description: "Get tasks that have been in-progress for too long.",
		},

		// ── Comments ──────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/tasks/{task_id}/comments",
			Category:    "Tasks",
			Description: "List all comments on a task.",
			Params: []APIParam{
				{Name: "task_id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/tasks/{task_id}/comments",
			Category:    "Tasks",
			Description: "Add a comment to a task.",
			Params: []APIParam{
				{Name: "task_id", In: "path", Type: "string", Required: true, Description: "Task UUID"},
				{Name: "text", In: "body", Type: "string", Required: true, Description: "Comment text"},
				{Name: "author", In: "body", Type: "string", Required: false, Description: "Author agent ID"},
			},
			ExampleResponse: map[string]interface{}{"id": "uuid", "text": "Done. Committed as abc1234.", "author": "anvil"},
		},
		{
			Method:      "DELETE",
			Path:        "/api/comments/{id}",
			Category:    "Tasks",
			Description: "Delete a comment by ID.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Comment UUID"},
			},
		},

		// ── Alerts ────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/alerts/rules",
			Category:    "Alerts",
			Description: "List all alert rules.",
			ExampleResponse: []map[string]interface{}{
				{"id": "uuid", "name": "High cost alert", "condition": "cost > 5", "enabled": true},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/alerts/rules",
			Category:    "Alerts",
			Description: "Create a new alert rule.",
			Params: []APIParam{
				{Name: "name", In: "body", Type: "string", Required: true, Description: "Rule name"},
				{Name: "condition", In: "body", Type: "string", Required: true, Description: "Rule condition expression"},
				{Name: "severity", In: "body", Type: "string", Required: false, Description: "info | warning | critical"},
			},
		},
		{
			Method:      "PUT",
			Path:        "/api/alerts/rules/{id}",
			Category:    "Alerts",
			Description: "Update an existing alert rule.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Rule UUID"},
			},
		},
		{
			Method:      "DELETE",
			Path:        "/api/alerts/rules/{id}",
			Category:    "Alerts",
			Description: "Delete an alert rule.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Rule UUID"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/alerts/history",
			Category:    "Alerts",
			Description: "Get alert trigger history.",
			Params: []APIParam{
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max results"},
				{Name: "acknowledged", In: "query", Type: "boolean", Required: false, Description: "Filter by acknowledged status"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/alerts/history/{id}/acknowledge",
			Category:    "Alerts",
			Description: "Acknowledge a triggered alert.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Alert history entry UUID"},
			},
		},
		{
			Method:          "GET",
			Path:            "/api/alerts/unacknowledged-count",
			Category:        "Alerts",
			Description:     "Get count of unacknowledged alerts (used for badge).",
			ExampleResponse: map[string]interface{}{"count": 3},
		},

		// ── Webhooks ──────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/webhooks",
			Category:    "Webhooks",
			Description: "List all configured webhooks.",
			ExampleResponse: []map[string]interface{}{
				{"id": "uuid", "url": "https://hooks.slack.com/...", "events": []string{"task.done", "agent.error"}, "enabled": true},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/webhooks",
			Category:    "Webhooks",
			Description: "Register a new webhook.",
			Params: []APIParam{
				{Name: "url", In: "body", Type: "string", Required: true, Description: "Webhook destination URL"},
				{Name: "events", In: "body", Type: "array", Required: true, Description: "Event types to subscribe to"},
				{Name: "secret", In: "body", Type: "string", Required: false, Description: "HMAC signing secret"},
			},
		},
		{
			Method:      "PUT",
			Path:        "/api/webhooks/{id}",
			Category:    "Webhooks",
			Description: "Update a webhook.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Webhook UUID"},
			},
		},
		{
			Method:      "DELETE",
			Path:        "/api/webhooks/{id}",
			Category:    "Webhooks",
			Description: "Delete a webhook.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Webhook UUID"},
			},
		},
		{
			Method:      "POST",
			Path:        "/api/webhooks/{id}/test",
			Category:    "Webhooks",
			Description: "Send a test payload to a webhook.",
			Params: []APIParam{
				{Name: "id", In: "path", Type: "string", Required: true, Description: "Webhook UUID"},
			},
		},

		// ── Logs ──────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/logs",
			Category:    "Logs",
			Description: "Stream or query live agent log lines.",
			Params: []APIParam{
				{Name: "agent", In: "query", Type: "string", Required: false, Description: "Filter by agent name"},
				{Name: "level", In: "query", Type: "string", Required: false, Description: "Filter by log level"},
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max lines (default: 100)"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/logs/search",
			Category:    "Logs",
			Description: "Full-text search across all agent log files.",
			Params: []APIParam{
				{Name: "q", In: "query", Type: "string", Required: true, Description: "Search query string"},
				{Name: "agent", In: "query", Type: "string", Required: false, Description: "Restrict search to specific agent"},
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max results"},
			},
		},
		{
			Method:          "GET",
			Path:            "/api/logs/files",
			Category:        "Logs",
			Description:     "List all available log files.",
			ExampleResponse: []string{"anvil.log", "forge.log", "main.log"},
		},

		// ── Reports ───────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/report",
			Category:    "Reports",
			Description: "Generate a full performance report in JSON format.",
			Params: []APIParam{
				{Name: "period", In: "query", Type: "string", Required: false, Description: "Reporting period: day | week | month"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/report/html",
			Category:    "Reports",
			Description: "Generate a performance report as a styled HTML document.",
		},
		{
			Method:      "GET",
			Path:        "/api/report/markdown",
			Category:    "Reports",
			Description: "Generate a performance report in Markdown format.",
		},

		// ── Graph ─────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/graph/dependencies",
			Category:    "Graph",
			Description: "Get the agent dependency and collaboration graph.",
			ExampleResponse: map[string]interface{}{
				"nodes": []map[string]interface{}{{"id": "main", "label": "Main"}, {"id": "anvil", "label": "Anvil"}},
				"edges": []map[string]interface{}{{"from": "main", "to": "anvil"}},
			},
		},

		// ── Docs / Documents ──────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/documents",
			Category:    "Docs",
			Description: "List all agent-generated documents and spec files.",
			Params: []APIParam{
				{Name: "agent", In: "query", Type: "string", Required: false, Description: "Filter by agent workspace"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/documents/content",
			Category:    "Docs",
			Description: "Read the content of a specific document.",
			Params: []APIParam{
				{Name: "path", In: "query", Type: "string", Required: true, Description: "Relative path to document"},
			},
		},

		// ── Analytics ─────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/analytics/overview",
			Category:    "Analytics",
			Description: "Get high-level analytics overview.",
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/agents",
			Category:    "Analytics",
			Description: "Per-agent analytics breakdown.",
			Params: []APIParam{
				{Name: "period", In: "query", Type: "string", Required: false, Description: "day | week | month"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/throughput",
			Category:    "Analytics",
			Description: "Task throughput over time.",
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/tokens",
			Category:    "Analytics",
			Description: "Token usage summary across all agents.",
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/tokens/timeline",
			Category:    "Analytics",
			Description: "Token usage over time.",
			Params: []APIParam{
				{Name: "days", In: "query", Type: "integer", Required: false, Description: "Lookback days (default: 7)"},
				{Name: "agent", In: "query", Type: "string", Required: false, Description: "Filter by agent"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/cost/summary",
			Category:    "Analytics",
			Description: "Cost summary across all agents and models.",
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/performance",
			Category:    "Analytics",
			Description: "Performance metrics for all agents.",
		},
		{
			Method:      "GET",
			Path:        "/api/analytics/export/csv",
			Category:    "Analytics",
			Description: "Export analytics data as a CSV file download.",
		},

		// ── Misc ──────────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/dashboard/stats",
			Category:    "Dashboard",
			Description: "Get dashboard overview statistics.",
		},
		{
			Method:      "GET",
			Path:        "/api/dashboard/teams",
			Category:    "Dashboard",
			Description: "Get per-team statistics for the dashboard.",
		},
		{
			Method:      "GET",
			Path:        "/api/structure",
			Category:    "Dashboard",
			Description: "Get the agent hierarchy/org-chart structure from config.",
		},
		{
			Method:      "GET",
			Path:        "/api/search",
			Category:    "Dashboard",
			Description: "Global full-text search across tasks, agents, documents, and logs.",
			Params: []APIParam{
				{Name: "q", In: "query", Type: "string", Required: true, Description: "Search query"},
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max results (default: 20)"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/audit",
			Category:    "Dashboard",
			Description: "Get the audit log of all write operations.",
			Params: []APIParam{
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max entries"},
				{Name: "agent", In: "query", Type: "string", Required: false, Description: "Filter by agent"},
			},
		},
		{
			Method:      "GET",
			Path:        "/api/errors",
			Category:    "Dashboard",
			Description: "Get recent errors and failures.",
		},
		{
			Method:      "GET",
			Path:        "/api/errors/summary",
			Category:    "Dashboard",
			Description: "Get error summary statistics.",
		},
		{
			Method:          "GET",
			Path:            "/api/branding",
			Category:        "Dashboard",
			Description:     "Get branding configuration (team name, logo, accent color, theme).",
			ExampleResponse: map[string]interface{}{"team_name": "My Team", "accent_color": "#6366f1", "theme": "dark"},
		},
		{
			Method:          "GET",
			Path:            "/api/openclaw/stats",
			Category:        "Dashboard",
			Description:     "Get live stats across all agents.",
			ExampleResponse: map[string]interface{}{"totalAgents": 20, "activeAgents": 5, "totalTokens": 1200000},
		},
		{
			Method:      "GET",
			Path:        "/api/openclaw/stream",
			Category:    "Dashboard",
			Description: "Get the latest activity stream entries across all agents.",
			Params: []APIParam{
				{Name: "limit", In: "query", Type: "integer", Required: false, Description: "Max entries (default: 30, max: 200)"},
				{Name: "agent_id", In: "query", Type: "string", Required: false, Description: "Filter by agent ID"},
			},
		},
		{
			Method:          "GET",
			Path:            "/health",
			Category:        "Dashboard",
			Description:     "Health check endpoint (no auth required).",
			ExampleResponse: "OK",
		},
		{
			Method:      "GET",
			Path:        "/ws/stream",
			Category:    "Dashboard",
			Description: "WebSocket connection for live agent updates. Upgrade from HTTP to ws://.",
		},

		// ── API Docs ──────────────────────────────────────────────────────────
		{
			Method:      "GET",
			Path:        "/api/docs",
			Category:    "Docs",
			Description: "This endpoint. Returns the full JSON schema of all available API endpoints.",
		},
	}

	writeJSON(w, endpoints)
}
