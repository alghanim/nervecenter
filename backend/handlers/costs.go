package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/alghanim/agentboard/backend/db"
)

// CostsHandler handles cost tracking endpoints
type CostsHandler struct{}

// IngestCost handles POST /api/costs
func (h *CostsHandler) IngestCost(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID   string  `json:"agent_id"`
		TaskID    *string `json:"task_id"`
		TokensIn  int64   `json:"tokens_in"`
		TokensOut int64   `json:"tokens_out"`
		CostUSD   float64 `json:"cost_usd"`
		Model     string  `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.AgentID == "" {
		respondError(w, 400, "agent_id is required")
		return
	}

	var id string
	err := db.DB.QueryRow(
		`INSERT INTO agent_costs (agent_id, task_id, tokens_in, tokens_out, cost_usd, model)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		req.AgentID, req.TaskID, req.TokensIn, req.TokensOut, req.CostUSD, req.Model,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]string{"id": id})
}

func costRangeToInterval(rangeParam string) string {
	switch rangeParam {
	case "7d":
		return "7 days"
	case "90d":
		return "90 days"
	case "365d":
		return "365 days"
	default:
		return "30 days"
	}
}

// GetCostSummary handles GET /api/costs/summary?agent_id=X&range=30d
func (h *CostsHandler) GetCostSummary(w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agent_id")
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	var whereClause string
	var args []interface{}
	args = append(args, interval)
	if agentID != "" {
		whereClause = "AND agent_id = $2"
		args = append(args, agentID)
	}

	var totalCost float64
	var totalTokensIn, totalTokensOut int64
	var taskCount int
	var dayCount int

	query := fmt.Sprintf(`SELECT
		COALESCE(SUM(cost_usd), 0),
		COALESCE(SUM(tokens_in), 0),
		COALESCE(SUM(tokens_out), 0),
		COUNT(DISTINCT task_id),
		GREATEST(COUNT(DISTINCT DATE(created_at)), 1)
	FROM agent_costs WHERE created_at > NOW() - $1::interval %s`, whereClause)

	db.DB.QueryRow(query, args...).Scan(&totalCost, &totalTokensIn, &totalTokensOut, &taskCount, &dayCount)

	costPerTask := 0.0
	if taskCount > 0 {
		costPerTask = totalCost / float64(taskCount)
	}
	burnRate := totalCost / float64(dayCount)

	respondJSON(w, 200, map[string]interface{}{
		"total_cost":        totalCost,
		"total_tokens_in":   totalTokensIn,
		"total_tokens_out":  totalTokensOut,
		"task_count":        taskCount,
		"cost_per_task":     costPerTask,
		"burn_rate_per_day": burnRate,
	})
}

// GetCostBreakdown handles GET /api/costs/breakdown?range=30d&group_by=model|agent
func (h *CostsHandler) GetCostBreakdown(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))
	groupBy := r.URL.Query().Get("group_by")

	result := map[string]interface{}{}

	if groupBy == "" || groupBy == "model" || strings.Contains(groupBy, "model") {
		rows, err := db.DB.Query(
			`SELECT COALESCE(model, 'unknown'), SUM(cost_usd), SUM(tokens_in), SUM(tokens_out), COUNT(*)
			 FROM agent_costs WHERE created_at > NOW() - $1::interval
			 GROUP BY model ORDER BY SUM(cost_usd) DESC`, interval)
		if err == nil {
			var byModel []map[string]interface{}
			for rows.Next() {
				var model string
				var cost float64
				var tokIn, tokOut int64
				var cnt int
				rows.Scan(&model, &cost, &tokIn, &tokOut, &cnt)
				byModel = append(byModel, map[string]interface{}{
					"model": model, "total_cost": cost,
					"tokens_in": tokIn, "tokens_out": tokOut, "count": cnt,
				})
			}
			rows.Close()
			if byModel == nil {
				byModel = []map[string]interface{}{}
			}
			result["by_model"] = byModel
		}
	}

	if groupBy == "" || groupBy == "agent" || strings.Contains(groupBy, "agent") {
		rows, err := db.DB.Query(
			`SELECT c.agent_id, COALESCE(a.display_name, c.agent_id), SUM(c.cost_usd), SUM(c.tokens_in), SUM(c.tokens_out), COUNT(*)
			 FROM agent_costs c LEFT JOIN agents a ON a.id = c.agent_id
			 WHERE c.created_at > NOW() - $1::interval
			 GROUP BY c.agent_id, a.display_name ORDER BY SUM(c.cost_usd) DESC`, interval)
		if err == nil {
			var byAgent []map[string]interface{}
			for rows.Next() {
				var agentID, name string
				var cost float64
				var tokIn, tokOut int64
				var cnt int
				rows.Scan(&agentID, &name, &cost, &tokIn, &tokOut, &cnt)
				byAgent = append(byAgent, map[string]interface{}{
					"agent_id": agentID, "display_name": name, "total_cost": cost,
					"tokens_in": tokIn, "tokens_out": tokOut, "count": cnt,
				})
			}
			rows.Close()
			if byAgent == nil {
				byAgent = []map[string]interface{}{}
			}
			result["by_agent"] = byAgent
		}
	}

	respondJSON(w, 200, result)
}

// GetBurnRate handles GET /api/costs/burn-rate?range=7d|30d|90d
func (h *CostsHandler) GetBurnRate(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	// Total cost and days in range
	var totalCost float64
	var dayCount int
	db.DB.QueryRow(
		`SELECT COALESCE(SUM(cost_usd), 0), GREATEST(COUNT(DISTINCT DATE(created_at)), 1)
		 FROM agent_costs WHERE created_at > NOW() - $1::interval`, interval,
	).Scan(&totalCost, &dayCount)

	dailyAvg := totalCost / float64(dayCount)
	weeklyAvg := dailyAvg * 7
	monthlyProjected := dailyAvg * 30

	// Trend: compare last 7 days vs previous 7 days
	var recentCost, previousCost float64
	db.DB.QueryRow(
		`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_costs WHERE created_at > NOW() - INTERVAL '7 days'`,
	).Scan(&recentCost)
	db.DB.QueryRow(
		`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_costs WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days'`,
	).Scan(&previousCost)

	trend := "stable"
	if previousCost > 0 {
		change := (recentCost - previousCost) / previousCost
		if change > 0.1 {
			trend = "increasing"
		} else if change < -0.1 {
			trend = "decreasing"
		}
	} else if recentCost > 0 {
		trend = "increasing"
	}

	respondJSON(w, 200, map[string]interface{}{
		"daily_avg_usd":       math.Round(dailyAvg*1e6) / 1e6,
		"weekly_avg_usd":      math.Round(weeklyAvg*1e6) / 1e6,
		"monthly_projected_usd": math.Round(monthlyProjected*1e6) / 1e6,
		"trend":               trend,
	})
}

// GetCostPerTask handles GET /api/costs/per-task?range=30d
func (h *CostsHandler) GetCostPerTask(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	rows, err := db.DB.Query(
		`SELECT c.agent_id, COALESCE(a.display_name, c.agent_id),
		        COUNT(DISTINCT c.task_id), COALESCE(SUM(c.cost_usd), 0)
		 FROM agent_costs c
		 LEFT JOIN agents a ON a.id = c.agent_id
		 WHERE c.created_at > NOW() - $1::interval AND c.task_id IS NOT NULL
		 GROUP BY c.agent_id, a.display_name
		 ORDER BY SUM(c.cost_usd) DESC`, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var agentID, displayName string
		var tasksCompleted int
		var totalCost float64
		rows.Scan(&agentID, &displayName, &tasksCompleted, &totalCost)
		cpt := 0.0
		if tasksCompleted > 0 {
			cpt = totalCost / float64(tasksCompleted)
		}
		results = append(results, map[string]interface{}{
			"agent_id":        agentID,
			"display_name":    displayName,
			"tasks_completed": tasksCompleted,
			"total_cost":      totalCost,
			"cost_per_task":   math.Round(cpt*1e6) / 1e6,
		})
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, 200, results)
}

// GetCostByModel handles GET /api/costs/by-model?range=30d
func (h *CostsHandler) GetCostByModel(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	// Get grand total for percentage calculation
	var grandTotal float64
	db.DB.QueryRow(
		`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_costs WHERE created_at > NOW() - $1::interval`, interval,
	).Scan(&grandTotal)

	rows, err := db.DB.Query(
		`SELECT COALESCE(model, 'unknown'), COALESCE(SUM(cost_usd), 0),
		        COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COUNT(*)
		 FROM agent_costs WHERE created_at > NOW() - $1::interval
		 GROUP BY model ORDER BY SUM(cost_usd) DESC`, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var model string
		var totalCost float64
		var tokIn, tokOut int64
		var reqCount int
		rows.Scan(&model, &totalCost, &tokIn, &tokOut, &reqCount)
		pct := 0.0
		if grandTotal > 0 {
			pct = math.Round((totalCost/grandTotal)*1e4) / 1e2
		}
		results = append(results, map[string]interface{}{
			"model":           model,
			"total_cost":      totalCost,
			"total_tokens_in": tokIn,
			"total_tokens_out": tokOut,
			"request_count":   reqCount,
			"pct_of_total":    pct,
		})
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, 200, results)
}
