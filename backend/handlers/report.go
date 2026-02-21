package handlers

import (
	"fmt"
	"html/template"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/alghanim/agentboard/backend/db"
)

type ReportHandler struct{}

type AgentReportRow struct {
	ID              string  `json:"id"`
	DisplayName     string  `json:"display_name"`
	Team            string  `json:"team"`
	Status          string  `json:"status"`
	TasksCompleted  int     `json:"tasks_completed"`
	TasksInProgress int     `json:"tasks_in_progress"`
	TasksTodo       int     `json:"tasks_todo"`
	AvgHours        float64 `json:"avg_completion_hours"`
}

type TaskReportRow struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Status    string  `json:"status"`
	Priority  string  `json:"priority"`
	Assignee  string  `json:"assignee"`
	Team      string  `json:"team"`
	CreatedAt string  `json:"created_at"`
	DoneAt    *string `json:"done_at,omitempty"`
}

type CostRow struct {
	AgentID   string  `json:"agent_id"`
	TotalCost float64 `json:"total_cost"`
	Tokens    int64   `json:"tokens"`
}

type ReportData struct {
	GeneratedAt     string           `json:"generated_at"`
	Period          string           `json:"period"`
	TotalAgents     int              `json:"total_agents"`
	OnlineAgents    int              `json:"online_agents"`
	TotalTasks      int              `json:"total_tasks"`
	CompletedTasks  int              `json:"completed_tasks"`
	InProgressTasks int              `json:"in_progress_tasks"`
	BlockedTasks    int              `json:"blocked_tasks"`
	CompletionRate  float64          `json:"completion_rate"`
	CostThisWeek    float64          `json:"cost_this_week"`
	CostAllTime     float64          `json:"cost_all_time"`
	TokensAllTime   int64            `json:"tokens_all_time"`
	Agents          []AgentReportRow `json:"agents"`
	RecentDone      []TaskReportRow  `json:"recent_done"`
	InProgress      []TaskReportRow  `json:"in_progress"`
	Blocked         []TaskReportRow  `json:"blocked"`
	TopCosts        []CostRow        `json:"top_costs"`
}

func (h *ReportHandler) buildReport(period string) (*ReportData, error) {
	r := &ReportData{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Period:      period,
	}

	db.DB.QueryRow(`SELECT COUNT(*) FROM agents`).Scan(&r.TotalAgents)
	db.DB.QueryRow(`SELECT COUNT(*) FROM agents WHERE status = 'online'`).Scan(&r.OnlineAgents)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&r.TotalTasks)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status = 'done'`).Scan(&r.CompletedTasks)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status = 'progress'`).Scan(&r.InProgressTasks)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status = 'blocked'`).Scan(&r.BlockedTasks)

	if r.TotalTasks > 0 {
		r.CompletionRate = float64(r.CompletedTasks) / float64(r.TotalTasks) * 100.0
	}

	// Cost data from JSONL session files
	allMsgs := parseAllTokenData()
	now := time.Now()
	weekStart := now.AddDate(0, 0, -int(now.Weekday()))
	weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, now.Location())
	for _, msg := range allMsgs {
		r.CostAllTime += msg.CostTotal
		r.TokensAllTime += msg.TotalTokens
		if !msg.Timestamp.Before(weekStart) {
			r.CostThisWeek += msg.CostTotal
		}
	}

	// Top cost agents from JSONL
	agentCostMap := make(map[string]*CostRow)
	for _, msg := range allMsgs {
		c, ok := agentCostMap[msg.AgentID]
		if !ok {
			c = &CostRow{AgentID: msg.AgentID}
			agentCostMap[msg.AgentID] = c
		}
		c.TotalCost += msg.CostTotal
		c.Tokens += msg.TotalTokens
	}
	for _, c := range agentCostMap {
		r.TopCosts = append(r.TopCosts, *c)
	}
	sort.Slice(r.TopCosts, func(i, j int) bool { return r.TopCosts[i].TotalCost > r.TopCosts[j].TotalCost })
	if len(r.TopCosts) > 10 {
		r.TopCosts = r.TopCosts[:10]
	}

	// Per-agent stats
	agentRows, err := db.DB.Query(`
		SELECT a.id, a.display_name, COALESCE(a.team,''), a.status,
			COUNT(CASE WHEN t.status='done' THEN 1 END),
			COUNT(CASE WHEN t.status='progress' THEN 1 END),
			COUNT(CASE WHEN t.status IN ('todo','next','backlog') THEN 1 END),
			COALESCE(AVG(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END), 0)
		FROM agents a LEFT JOIN tasks t ON t.assignee = a.id
		GROUP BY a.id, a.display_name, a.team, a.status
		HAVING COUNT(t.id) > 0
		ORDER BY COUNT(CASE WHEN t.status='done' THEN 1 END) DESC`)
	if err == nil {
		defer agentRows.Close()
		for agentRows.Next() {
			var ar AgentReportRow
			agentRows.Scan(&ar.ID, &ar.DisplayName, &ar.Team, &ar.Status,
				&ar.TasksCompleted, &ar.TasksInProgress, &ar.TasksTodo, &ar.AvgHours)
			r.Agents = append(r.Agents, ar)
		}
	}

	// Recent done tasks
	doneRows, err := db.DB.Query(`
		SELECT id, COALESCE(title,''), status, COALESCE(priority,''), COALESCE(assignee,''), COALESCE(team,''),
			created_at::text, completed_at::text
		FROM tasks WHERE status='done' ORDER BY completed_at DESC NULLS LAST LIMIT 20`)
	if err == nil {
		defer doneRows.Close()
		for doneRows.Next() {
			var t TaskReportRow
			doneRows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.Assignee, &t.Team, &t.CreatedAt, &t.DoneAt)
			r.RecentDone = append(r.RecentDone, t)
		}
	}

	// In-progress tasks
	ipRows, err := db.DB.Query(`
		SELECT id, COALESCE(title,''), status, COALESCE(priority,''), COALESCE(assignee,''), COALESCE(team,''),
			created_at::text
		FROM tasks WHERE status='progress' ORDER BY updated_at DESC`)
	if err == nil {
		defer ipRows.Close()
		for ipRows.Next() {
			var t TaskReportRow
			ipRows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.Assignee, &t.Team, &t.CreatedAt)
			r.InProgress = append(r.InProgress, t)
		}
	}

	// Blocked tasks
	bRows, err := db.DB.Query(`
		SELECT id, COALESCE(title,''), status, COALESCE(priority,''), COALESCE(assignee,''), COALESCE(team,''),
			created_at::text
		FROM tasks WHERE status='blocked' ORDER BY updated_at DESC`)
	if err == nil {
		defer bRows.Close()
		for bRows.Next() {
			var t TaskReportRow
			bRows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.Assignee, &t.Team, &t.CreatedAt)
			r.Blocked = append(r.Blocked, t)
		}
	}

	return r, nil
}

// GetReport handles GET /api/report — JSON format
func (h *ReportHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "weekly"
	}
	report, err := h.buildReport(period)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, report)
}

// GetReportHTML handles GET /api/report/html — rendered HTML report
func (h *ReportHandler) GetReportHTML(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "weekly"
	}
	report, err := h.buildReport(period)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := reportTemplate.Execute(w, report); err != nil {
		http.Error(w, err.Error(), 500)
	}
}

// GetReportMarkdown handles GET /api/report/markdown
func (h *ReportHandler) GetReportMarkdown(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "weekly"
	}
	report, err := h.buildReport(period)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# AgentBoard %s Report\n", strings.Title(report.Period)))
	sb.WriteString(fmt.Sprintf("*Generated: %s*\n\n", report.GeneratedAt))

	sb.WriteString("## Summary\n")
	sb.WriteString(fmt.Sprintf("| Metric | Value |\n|---|---|\n"))
	sb.WriteString(fmt.Sprintf("| Total Agents | %d |\n", report.TotalAgents))
	sb.WriteString(fmt.Sprintf("| Online | %d |\n", report.OnlineAgents))
	sb.WriteString(fmt.Sprintf("| Total Tasks | %d |\n", report.TotalTasks))
	sb.WriteString(fmt.Sprintf("| Completed | %d |\n", report.CompletedTasks))
	sb.WriteString(fmt.Sprintf("| In Progress | %d |\n", report.InProgressTasks))
	sb.WriteString(fmt.Sprintf("| Blocked | %d |\n", report.BlockedTasks))
	sb.WriteString(fmt.Sprintf("| Completion Rate | %.1f%% |\n", report.CompletionRate))
	sb.WriteString(fmt.Sprintf("| Cost (Week) | $%.2f |\n", report.CostThisWeek))
	sb.WriteString(fmt.Sprintf("| Cost (All Time) | $%.2f |\n", report.CostAllTime))
	sb.WriteString(fmt.Sprintf("| Tokens (All Time) | %d |\n\n", report.TokensAllTime))

	if len(report.Agents) > 0 {
		sb.WriteString("## Agent Activity\n")
		sb.WriteString("| Agent | Team | Done | In Progress | Todo | Avg Hours |\n|---|---|---|---|---|---|\n")
		for _, a := range report.Agents {
			sb.WriteString(fmt.Sprintf("| %s | %s | %d | %d | %d | %.1f |\n",
				a.DisplayName, a.Team, a.TasksCompleted, a.TasksInProgress, a.TasksTodo, a.AvgHours))
		}
		sb.WriteString("\n")
	}

	if len(report.TopCosts) > 0 {
		sb.WriteString("## Top Costs by Agent\n")
		sb.WriteString("| Agent | Cost | Tokens |\n|---|---|---|\n")
		for _, c := range report.TopCosts {
			sb.WriteString(fmt.Sprintf("| %s | $%.2f | %d |\n", c.AgentID, c.TotalCost, c.Tokens))
		}
		sb.WriteString("\n")
	}

	if len(report.Blocked) > 0 {
		sb.WriteString("## ⚠️ Blocked Tasks\n")
		for _, t := range report.Blocked {
			sb.WriteString(fmt.Sprintf("- **%s** (assigned: %s, priority: %s)\n", t.Title, t.Assignee, t.Priority))
		}
		sb.WriteString("\n")
	}

	if len(report.InProgress) > 0 {
		sb.WriteString("## 🔄 In Progress\n")
		for _, t := range report.InProgress {
			sb.WriteString(fmt.Sprintf("- **%s** → %s (%s)\n", t.Title, t.Assignee, t.Priority))
		}
		sb.WriteString("\n")
	}

	w.Write([]byte(sb.String()))
}

var reportTemplate = template.Must(template.New("report").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentBoard {{.Period}} Report</title>
<style>
  :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --green: #4ade80; --red: #f87171; --yellow: #fbbf24; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1000px; margin: 0 auto; }
  h1 { color: var(--accent); margin-bottom: .25rem; font-size: 1.75rem; }
  .subtitle { color: var(--muted); margin-bottom: 2rem; font-size: .875rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: .75rem; padding: 1.25rem; }
  .stat-card .label { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
  .stat-card .value { font-size: 1.75rem; font-weight: 700; margin-top: .25rem; }
  .cost { color: var(--green); }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 .75rem; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: .75rem; overflow: hidden; margin-bottom: 1.5rem; }
  th { background: var(--border); text-align: left; padding: .75rem 1rem; font-size: .75rem; text-transform: uppercase; color: var(--muted); }
  td { padding: .6rem 1rem; border-top: 1px solid var(--border); font-size: .875rem; }
  tr:hover td { background: rgba(56,189,248,.05); }
  .badge { display: inline-block; padding: .15rem .5rem; border-radius: 9999px; font-size: .7rem; font-weight: 600; }
  .badge-high { background: rgba(248,113,113,.2); color: var(--red); }
  .badge-medium { background: rgba(251,191,36,.2); color: var(--yellow); }
  .badge-low { background: rgba(74,222,128,.2); color: var(--green); }
  .badge-blocked { background: rgba(248,113,113,.2); color: var(--red); }
  .badge-progress { background: rgba(56,189,248,.2); color: var(--accent); }
  footer { text-align: center; color: var(--muted); font-size: .75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<h1>📊 AgentBoard {{.Period}} Report</h1>
<p class="subtitle">Generated {{.GeneratedAt}}</p>

<div class="grid">
  <div class="stat-card"><div class="label">Total Agents</div><div class="value">{{.TotalAgents}}</div></div>
  <div class="stat-card"><div class="label">Online</div><div class="value">{{.OnlineAgents}}</div></div>
  <div class="stat-card"><div class="label">Total Tasks</div><div class="value">{{.TotalTasks}}</div></div>
  <div class="stat-card"><div class="label">Completed</div><div class="value cost">{{.CompletedTasks}}</div></div>
  <div class="stat-card"><div class="label">In Progress</div><div class="value">{{.InProgressTasks}}</div></div>
  <div class="stat-card"><div class="label">Blocked</div><div class="value" style="color:var(--red)">{{.BlockedTasks}}</div></div>
  <div class="stat-card"><div class="label">Completion Rate</div><div class="value">{{printf "%.1f" .CompletionRate}}%</div></div>
  <div class="stat-card"><div class="label">Cost (Week)</div><div class="value cost">${{printf "%.2f" .CostThisWeek}}</div></div>
</div>

{{if .Agents}}
<h2>🤖 Agent Activity</h2>
<table>
<tr><th>Agent</th><th>Team</th><th>Status</th><th>Done</th><th>In Progress</th><th>Todo</th><th>Avg Hours</th></tr>
{{range .Agents}}<tr>
  <td><strong>{{.DisplayName}}</strong></td><td>{{.Team}}</td><td>{{.Status}}</td>
  <td>{{.TasksCompleted}}</td><td>{{.TasksInProgress}}</td><td>{{.TasksTodo}}</td>
  <td>{{printf "%.1f" .AvgHours}}</td>
</tr>{{end}}
</table>
{{end}}

{{if .TopCosts}}
<h2>💰 Top Costs by Agent</h2>
<table>
<tr><th>Agent</th><th>Cost</th><th>Tokens</th></tr>
{{range .TopCosts}}<tr><td>{{.AgentID}}</td><td>${{printf "%.2f" .TotalCost}}</td><td>{{.Tokens}}</td></tr>{{end}}
</table>
{{end}}

{{if .Blocked}}
<h2>⚠️ Blocked Tasks</h2>
<table>
<tr><th>Task</th><th>Assignee</th><th>Priority</th></tr>
{{range .Blocked}}<tr><td>{{.Title}}</td><td>{{.Assignee}}</td><td><span class="badge badge-{{.Priority}}">{{.Priority}}</span></td></tr>{{end}}
</table>
{{end}}

{{if .InProgress}}
<h2>🔄 In Progress</h2>
<table>
<tr><th>Task</th><th>Assignee</th><th>Priority</th></tr>
{{range .InProgress}}<tr><td>{{.Title}}</td><td>{{.Assignee}}</td><td><span class="badge badge-{{.Priority}}">{{.Priority}}</span></td></tr>{{end}}
</table>
{{end}}

{{if .RecentDone}}
<h2>✅ Recently Completed</h2>
<table>
<tr><th>Task</th><th>Assignee</th><th>Priority</th></tr>
{{range .RecentDone}}<tr><td>{{.Title}}</td><td>{{.Assignee}}</td><td><span class="badge badge-{{.Priority}}">{{.Priority}}</span></td></tr>{{end}}
</table>
{{end}}

<footer>AgentBoard Report • Cost All Time: ${{printf "%.2f" .CostAllTime}} • Tokens: {{.TokensAllTime}}</footer>
</body>
</html>`))
