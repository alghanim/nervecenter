package handlers

import (
	"net/http"
	"strings"

	"github.com/alghanim/agentboard/backend/db"
)

type AgentComparisonMetrics struct {
	AgentID        string  `json:"agent_id"`
	DisplayName    string  `json:"display_name"`
	TasksCompleted int     `json:"tasks_completed"`
	TasksFailed    int     `json:"tasks_failed"`
	CompletionRate float64 `json:"completion_rate"`
	AvgSpeed       float64 `json:"avg_speed_hours"`
	TotalCost      float64 `json:"total_cost"`
	CostPerTask    float64 `json:"cost_per_task"`
	AvgQuality     float64 `json:"avg_quality"`
	Model          string  `json:"model"`
}

func CompareAgents(w http.ResponseWriter, r *http.Request) {
	agentsParam := r.URL.Query().Get("agents")
	rangeParam := r.URL.Query().Get("range")
	if agentsParam == "" {
		respondError(w, 400, "agents parameter required (comma-separated)")
		return
	}

	agentIDs := strings.Split(agentsParam, ",")
	interval := "30 days"
	switch rangeParam {
	case "7d":
		interval = "7 days"
	case "90d":
		interval = "90 days"
	case "365d":
		interval = "365 days"
	}

	results := []AgentComparisonMetrics{}
	for _, aid := range agentIDs {
		aid = strings.TrimSpace(aid)
		if aid == "" {
			continue
		}
		m := AgentComparisonMetrics{AgentID: aid}

		// Display name — gracefully handle missing agents
		err := db.DB.QueryRow(`SELECT COALESCE(display_name, id) FROM agents WHERE id = $1`, aid).Scan(&m.DisplayName)
		if err != nil || m.DisplayName == "" {
			m.DisplayName = aid
		}

		// Tasks completed/failed in range
		db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE assignee = $1 AND status = 'done' AND completed_at > NOW() - $2::interval`, aid, interval).Scan(&m.TasksCompleted)
		db.DB.QueryRow(`SELECT COUNT(*) FROM activity_log WHERE agent_id = $1 AND action LIKE '%fail%' AND created_at > NOW() - $2::interval`, aid, interval).Scan(&m.TasksFailed)

		total := m.TasksCompleted + m.TasksFailed
		if total > 0 {
			m.CompletionRate = float64(m.TasksCompleted) / float64(total) * 100
		}

		// Avg completion speed (hours)
		db.DB.QueryRow(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600), 0) FROM tasks WHERE assignee = $1 AND status = 'done' AND completed_at > NOW() - $2::interval`, aid, interval).Scan(&m.AvgSpeed)

		// Total cost — fixed to use agent_costs table
		db.DB.QueryRow(`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_costs WHERE agent_id = $1 AND created_at > NOW() - $2::interval`, aid, interval).Scan(&m.TotalCost)

		// Cost per task
		if m.TasksCompleted > 0 {
			m.CostPerTask = m.TotalCost / float64(m.TasksCompleted)
		}

		// Most-used model
		db.DB.QueryRow(`SELECT COALESCE(model, '') FROM agent_costs WHERE agent_id = $1 AND created_at > NOW() - $2::interval GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1`, aid, interval).Scan(&m.Model)

		// Avg quality score
		db.DB.QueryRow(`SELECT COALESCE(AVG(score), 0) FROM evaluations WHERE agent_id = $1 AND created_at > NOW() - $2::interval`, aid, interval).Scan(&m.AvgQuality)

		results = append(results, m)
	}
	respondJSON(w, 200, results)
}
