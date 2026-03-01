package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

// ScorecardHandler handles agent scorecard endpoints
type ScorecardHandler struct{}

// GetScorecard handles GET /api/agents/{id}/scorecard
func (h *ScorecardHandler) GetScorecard(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]

	var completed, inProgress, total int
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE assignee = $1 AND status = 'done'`, agentID).Scan(&completed)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE assignee = $1 AND status IN ('progress', 'todo')`, agentID).Scan(&inProgress)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE assignee = $1`, agentID).Scan(&total)

	var failed int
	db.DB.QueryRow(`SELECT COUNT(*) FROM activity_log WHERE agent_id = $1 AND action ILIKE '%fail%'`, agentID).Scan(&failed)

	completionRate := calculateSuccessRate(completed, failed)

	var avgHours float64
	db.DB.QueryRow(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600), 0)
		FROM tasks WHERE assignee = $1 AND status = 'done' AND completed_at IS NOT NULL`, agentID).Scan(&avgHours)

	var avgQuality float64
	var evalCount int
	db.DB.QueryRow(`SELECT COALESCE(AVG(score), 0), COUNT(*) FROM evaluations WHERE agent_id = $1`, agentID).Scan(&avgQuality, &evalCount)

	var totalCost float64
	db.DB.QueryRow(`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_costs WHERE agent_id = $1`, agentID).Scan(&totalCost)

	// Failure rate
	var failureRate float64
	if completed+failed > 0 {
		failureRate = float64(failed) / float64(completed+failed) * 100
	}

	// Cost per task
	var costPerTask float64
	if completed > 0 {
		costPerTask = totalCost / float64(completed)
	}

	// Quality trend (last 30 days daily avg scores)
	type QualityTrendPoint struct {
		Date     string  `json:"date"`
		AvgScore float64 `json:"avg_score"`
		Count    int     `json:"count"`
	}
	qualityTrend := []QualityTrendPoint{}
	trendRows, trendErr := db.DB.Query(
		`SELECT DATE(created_at) as day, AVG(score) as avg_score, COUNT(*) as count
		 FROM evaluations WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '30 days'
		 GROUP BY DATE(created_at) ORDER BY day`, agentID)
	if trendErr == nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var tp QualityTrendPoint
			if err := trendRows.Scan(&tp.Date, &tp.AvgScore, &tp.Count); err == nil {
				qualityTrend = append(qualityTrend, tp)
			}
		}
	}

	respondJSON(w, 200, map[string]interface{}{
		"agent_id":               agentID,
		"tasks_completed":        completed,
		"tasks_failed":           failed,
		"tasks_in_progress":      inProgress,
		"tasks_total":            total,
		"completion_rate":        completionRate,
		"failure_rate":           failureRate,
		"avg_time_to_done_hours": fmt.Sprintf("%.1f", avgHours),
		"avg_quality_score":      avgQuality,
		"evaluation_count":       evalCount,
		"total_cost_usd":         totalCost,
		"cost_per_task":          costPerTask,
		"quality_trend":          qualityTrend,
	})
}

// GetPerformanceTimeline handles GET /api/agents/{id}/performance/timeline?range=30d
func (h *ScorecardHandler) GetPerformanceTimeline(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	rows, err := db.DB.Query(`
		SELECT d::date AS date,
			COALESCE(t.cnt, 0) AS completed,
			COALESCE(t.avg_hours, 0) AS avg_hours,
			COALESCE(c.cost, 0) AS cost
		FROM generate_series(NOW() - $2::interval, NOW(), '1 day') d
		LEFT JOIN (
			SELECT completed_at::date AS day, COUNT(*) AS cnt,
				AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) AS avg_hours
			FROM tasks WHERE assignee = $1 AND status = 'done' AND completed_at IS NOT NULL
				AND completed_at > NOW() - $2::interval
			GROUP BY day
		) t ON t.day = d::date
		LEFT JOIN (
			SELECT created_at::date AS day, SUM(cost_usd) AS cost
			FROM agent_costs WHERE agent_id = $1 AND created_at > NOW() - $2::interval
			GROUP BY day
		) c ON c.day = d::date
		ORDER BY date
	`, agentID, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var labels []string
	var completedData []int
	var costData []float64

	for rows.Next() {
		var date time.Time
		var completed int
		var avgHours, cost float64
		rows.Scan(&date, &completed, &avgHours, &cost)
		labels = append(labels, date.Format("2006-01-02"))
		completedData = append(completedData, completed)
		costData = append(costData, cost)
	}
	if labels == nil {
		labels = []string{}
		completedData = []int{}
		costData = []float64{}
	}

	respondJSON(w, 200, map[string]interface{}{
		"agent_id": agentID,
		"labels":   labels,
		"datasets": []map[string]interface{}{
			{"label": "tasks_completed", "data": completedData},
			{"label": "cost_usd", "data": costData},
		},
	})
}
