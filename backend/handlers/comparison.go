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
	AvgQuality     float64 `json:"avg_quality"`
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

		// Display name
		db.DB.QueryRow(`SELECT COALESCE(display_name, id) FROM agents WHERE id = $1`, aid).Scan(&m.DisplayName)
		if m.DisplayName == "" {
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

		// Total cost
		db.DB.QueryRow(`SELECT COALESCE(SUM(total_cost), 0) FROM agent_metrics WHERE agent_id = $1 AND date > NOW() - $2::interval`, aid, interval).Scan(&m.TotalCost)

		// Avg quality score
		db.DB.QueryRow(`SELECT COALESCE(AVG(score), 0) FROM evaluations WHERE agent_id = $1 AND created_at > NOW() - $2::interval`, aid, interval).Scan(&m.AvgQuality)

		results = append(results, m)
	}
	respondJSON(w, 200, results)
}
