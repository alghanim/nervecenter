package handlers

import (
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/alghanim/agentboard/backend/db"
)

type MetricsHandler struct{}

// --- Latency & Response Time Metrics ---

type LatencyMetrics struct {
	AgentID         string  `json:"agent_id"`
	Name            string  `json:"name"`
	AvgResponseSec  float64 `json:"avg_response_sec"`
	P50ResponseSec  float64 `json:"p50_response_sec"`
	P95ResponseSec  float64 `json:"p95_response_sec"`
	AvgTaskHours    float64 `json:"avg_task_completion_hours"`
	TasksCompleted  int     `json:"tasks_completed"`
	FastestTaskHrs  float64 `json:"fastest_task_hours"`
	SlowestTaskHrs  float64 `json:"slowest_task_hours"`
}

// GetLatencyMetrics handles GET /api/metrics/latency
func (h *MetricsHandler) GetLatencyMetrics(w http.ResponseWriter, r *http.Request) {
	// Get per-agent task completion latency from DB
	rows, err := db.DB.Query(`
		SELECT
			a.id,
			COALESCE(a.display_name, a.id),
			COUNT(CASE WHEN t.status='done' THEN 1 END),
			COALESCE(AVG(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END), 0),
			COALESCE(MIN(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END), 0),
			COALESCE(MAX(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END), 0)
		FROM agents a
		LEFT JOIN tasks t ON t.assignee = a.id
		GROUP BY a.id, a.display_name
		HAVING COUNT(t.id) > 0
		ORDER BY AVG(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
			THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END) ASC NULLS LAST
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	// Also get token-level response time from JSONL (message-to-message latency)
	allMsgs := parseAllTokenData()
	agentResponseTimes := make(map[string][]float64)
	// Group messages by agent, sort by time, measure gaps
	agentMsgs := make(map[string][]time.Time)
	for _, m := range allMsgs {
		if !m.Timestamp.IsZero() {
			agentMsgs[m.AgentID] = append(agentMsgs[m.AgentID], m.Timestamp)
		}
	}
	for agentID, times := range agentMsgs {
		sort.Slice(times, func(i, j int) bool { return times[i].Before(times[j]) })
		for i := 1; i < len(times); i++ {
			gap := times[i].Sub(times[i-1]).Seconds()
			// Only count gaps < 10 minutes as response times (longer = idle)
			if gap > 0 && gap < 600 {
				agentResponseTimes[agentID] = append(agentResponseTimes[agentID], gap)
			}
		}
	}

	var results []LatencyMetrics
	for rows.Next() {
		var m LatencyMetrics
		rows.Scan(&m.AgentID, &m.Name, &m.TasksCompleted, &m.AvgTaskHours, &m.FastestTaskHrs, &m.SlowestTaskHrs)

		if rts, ok := agentResponseTimes[m.AgentID]; ok && len(rts) > 0 {
			sort.Float64s(rts)
			sum := 0.0
			for _, v := range rts {
				sum += v
			}
			m.AvgResponseSec = math.Round(sum/float64(len(rts))*10) / 10
			m.P50ResponseSec = math.Round(percentile(rts, 50)*10) / 10
			m.P95ResponseSec = math.Round(percentile(rts, 95)*10) / 10
		}
		results = append(results, m)
	}
	if results == nil {
		results = []LatencyMetrics{}
	}
	respondJSON(w, http.StatusOK, results)
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := (p / 100.0) * float64(len(sorted)-1)
	lower := int(math.Floor(idx))
	upper := int(math.Ceil(idx))
	if lower == upper || upper >= len(sorted) {
		return sorted[lower]
	}
	frac := idx - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

// --- Cost Forecasting ---

type CostForecast struct {
	CurrentDailyAvg  float64            `json:"current_daily_avg"`
	ProjectedWeekly  float64            `json:"projected_weekly"`
	ProjectedMonthly float64            `json:"projected_monthly"`
	Trend            string             `json:"trend"` // "increasing", "decreasing", "stable"
	TrendPct         float64            `json:"trend_pct"`
	DailyHistory     []DailyCostPoint   `json:"daily_history"`
	AgentForecasts   []AgentForecast    `json:"agent_forecasts"`
}

type DailyCostPoint struct {
	Date    string  `json:"date"`
	Cost    float64 `json:"cost"`
	Tokens  int64   `json:"tokens"`
}

type AgentForecast struct {
	AgentID          string  `json:"agent_id"`
	CurrentDailyAvg  float64 `json:"current_daily_avg"`
	ProjectedMonthly float64 `json:"projected_monthly"`
	TrendPct         float64 `json:"trend_pct"`
}

// GetCostForecast handles GET /api/metrics/cost-forecast
func (h *MetricsHandler) GetCostForecast(w http.ResponseWriter, r *http.Request) {
	allMsgs := parseAllTokenData()
	now := time.Now()

	// Build daily cost map for last 30 days
	dailyCosts := make(map[string]float64)
	dailyTokens := make(map[string]int64)
	agentDailyCosts := make(map[string]map[string]float64)

	for _, msg := range allMsgs {
		if msg.Timestamp.Before(now.AddDate(0, 0, -30)) {
			continue
		}
		dateStr := msg.Timestamp.Format("2006-01-02")
		dailyCosts[dateStr] += msg.CostTotal
		dailyTokens[dateStr] += msg.TotalTokens

		if agentDailyCosts[msg.AgentID] == nil {
			agentDailyCosts[msg.AgentID] = make(map[string]float64)
		}
		agentDailyCosts[msg.AgentID][dateStr] += msg.CostTotal
	}

	// Build daily history
	var history []DailyCostPoint
	var recentWeekCosts, priorWeekCosts float64
	for d := 29; d >= 0; d-- {
		date := now.AddDate(0, 0, -d).Format("2006-01-02")
		cost := dailyCosts[date]
		tokens := dailyTokens[date]
		history = append(history, DailyCostPoint{Date: date, Cost: math.Round(cost*100) / 100, Tokens: tokens})

		if d < 7 {
			recentWeekCosts += cost
		} else if d < 14 {
			priorWeekCosts += cost
		}
	}

	// Calculate averages and projections
	var totalCost float64
	var activeDays int
	for _, dp := range history {
		if dp.Cost > 0 {
			totalCost += dp.Cost
			activeDays++
		}
	}

	dailyAvg := 0.0
	if activeDays > 0 {
		dailyAvg = totalCost / float64(activeDays)
	}

	// Trend
	trend := "stable"
	trendPct := 0.0
	if priorWeekCosts > 0 {
		trendPct = ((recentWeekCosts - priorWeekCosts) / priorWeekCosts) * 100
		if trendPct > 10 {
			trend = "increasing"
		} else if trendPct < -10 {
			trend = "decreasing"
		}
	}

	// Per-agent forecasts
	var agentForecasts []AgentForecast
	for agentID, days := range agentDailyCosts {
		var total float64
		var count int
		var recent, prior float64
		for d := 29; d >= 0; d-- {
			date := now.AddDate(0, 0, -d).Format("2006-01-02")
			if c, ok := days[date]; ok && c > 0 {
				total += c
				count++
			}
			if d < 7 {
				recent += days[date]
			} else if d < 14 {
				prior += days[date]
			}
		}
		avg := 0.0
		if count > 0 {
			avg = total / float64(count)
		}
		tp := 0.0
		if prior > 0 {
			tp = ((recent - prior) / prior) * 100
		}
		agentForecasts = append(agentForecasts, AgentForecast{
			AgentID:          agentID,
			CurrentDailyAvg:  math.Round(avg*100) / 100,
			ProjectedMonthly: math.Round(avg*30*100) / 100,
			TrendPct:         math.Round(tp*10) / 10,
		})
	}
	sort.Slice(agentForecasts, func(i, j int) bool {
		return agentForecasts[i].ProjectedMonthly > agentForecasts[j].ProjectedMonthly
	})

	forecast := CostForecast{
		CurrentDailyAvg:  math.Round(dailyAvg*100) / 100,
		ProjectedWeekly:  math.Round(dailyAvg*7*100) / 100,
		ProjectedMonthly: math.Round(dailyAvg*30*100) / 100,
		Trend:            trend,
		TrendPct:         math.Round(trendPct*10) / 10,
		DailyHistory:     history,
		AgentForecasts:   agentForecasts,
	}

	respondJSON(w, http.StatusOK, forecast)
}

// --- Agent Efficiency Score ---

type EfficiencyScore struct {
	AgentID          string  `json:"agent_id"`
	Name             string  `json:"name"`
	Score            float64 `json:"score"`          // 0-100
	TasksCompleted   int     `json:"tasks_completed"`
	TokensPerTask    int64   `json:"tokens_per_task"`
	CostPerTask      float64 `json:"cost_per_task"`
	AvgCompletionHrs float64 `json:"avg_completion_hours"`
	ErrorRate        float64 `json:"error_rate"`     // blocked/total
	Breakdown        EffBreakdown `json:"breakdown"`
}

type EffBreakdown struct {
	Throughput  float64 `json:"throughput"`   // 0-25: tasks done
	TokenEff    float64 `json:"token_eff"`    // 0-25: lower tokens per task = better
	SpeedScore  float64 `json:"speed_score"`  // 0-25: faster completion = better
	Reliability float64 `json:"reliability"`  // 0-25: fewer blocks/errors = better
}

// GetEfficiencyScores handles GET /api/metrics/efficiency
func (h *MetricsHandler) GetEfficiencyScores(w http.ResponseWriter, r *http.Request) {
	// Get task data from DB
	type agentTaskData struct {
		id, name     string
		completed    int
		blocked      int
		total        int
		avgHours     float64
	}

	rows, err := db.DB.Query(`
		SELECT
			a.id,
			COALESCE(a.display_name, a.id),
			COUNT(CASE WHEN t.status='done' THEN 1 END),
			COUNT(CASE WHEN t.status='blocked' THEN 1 END),
			COUNT(t.id),
			COALESCE(AVG(CASE WHEN t.status='done' AND t.completed_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600 END), 0)
		FROM agents a
		LEFT JOIN tasks t ON t.assignee = a.id
		GROUP BY a.id, a.display_name
		HAVING COUNT(t.id) > 0
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	agents := make(map[string]*agentTaskData)
	for rows.Next() {
		a := &agentTaskData{}
		rows.Scan(&a.id, &a.name, &a.completed, &a.blocked, &a.total, &a.avgHours)
		agents[a.id] = a
	}

	// Get token usage from JSONL
	allMsgs := parseAllTokenData()
	agentTokens := make(map[string]int64)
	agentCost := make(map[string]float64)
	for _, msg := range allMsgs {
		agentTokens[msg.AgentID] += msg.TotalTokens
		agentCost[msg.AgentID] += msg.CostTotal
	}

	// Find max values for normalization
	var maxCompleted int
	var maxTokensPerTask int64
	var maxHours float64
	for _, a := range agents {
		if a.completed > maxCompleted {
			maxCompleted = a.completed
		}
		if a.completed > 0 {
			tpt := agentTokens[a.id] / int64(a.completed)
			if tpt > maxTokensPerTask {
				maxTokensPerTask = tpt
			}
		}
		if a.avgHours > maxHours {
			maxHours = a.avgHours
		}
	}

	var results []EfficiencyScore
	for _, a := range agents {
		es := EfficiencyScore{
			AgentID:          a.id,
			Name:             a.name,
			TasksCompleted:   a.completed,
			AvgCompletionHrs: math.Round(a.avgHours*10) / 10,
		}

		if a.completed > 0 {
			es.TokensPerTask = agentTokens[a.id] / int64(a.completed)
			es.CostPerTask = math.Round(agentCost[a.id]/float64(a.completed)*100) / 100
		}
		if a.total > 0 {
			es.ErrorRate = math.Round(float64(a.blocked)/float64(a.total)*100*10) / 10
		}

		// Throughput: 0-25 scaled by max
		if maxCompleted > 0 {
			es.Breakdown.Throughput = math.Round(float64(a.completed)/float64(maxCompleted)*25*10) / 10
		}

		// Token efficiency: lower tokens per task = better, inverted scale
		if maxTokensPerTask > 0 && a.completed > 0 {
			tpt := agentTokens[a.id] / int64(a.completed)
			es.Breakdown.TokenEff = math.Round((1-float64(tpt)/float64(maxTokensPerTask))*25*10) / 10
			if es.Breakdown.TokenEff < 0 {
				es.Breakdown.TokenEff = 0
			}
		}

		// Speed: faster = better, inverted
		if maxHours > 0 && a.avgHours > 0 {
			es.Breakdown.SpeedScore = math.Round((1-a.avgHours/maxHours)*25*10) / 10
			if es.Breakdown.SpeedScore < 0 {
				es.Breakdown.SpeedScore = 0
			}
		} else if a.completed > 0 {
			es.Breakdown.SpeedScore = 25 // instant = max score
		}

		// Reliability: fewer blocks = better
		if a.total > 0 {
			blockRate := float64(a.blocked) / float64(a.total)
			es.Breakdown.Reliability = math.Round((1-blockRate)*25*10) / 10
		} else {
			es.Breakdown.Reliability = 25
		}

		es.Score = math.Round((es.Breakdown.Throughput+es.Breakdown.TokenEff+es.Breakdown.SpeedScore+es.Breakdown.Reliability)*10) / 10
		results = append(results, es)
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	respondJSON(w, http.StatusOK, results)
}
