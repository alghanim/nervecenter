package handlers

import (
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/lib/pq"
)

type AnalyticsHandler struct{}

// GetOverview handles GET /api/analytics/overview
func (h *AnalyticsHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	var totalTasks int
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&totalTasks)

	var completedThisWeek int
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status = 'done' AND completed_at >= date_trunc('week', NOW())`).Scan(&completedThisWeek)

	var avgHours *float64
	db.DB.QueryRow(`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL`).Scan(&avgHours)

	var agentsActiveToday int
	db.DB.QueryRow(`SELECT COUNT(DISTINCT agent_id) FROM activity_log WHERE created_at >= CURRENT_DATE`).Scan(&agentsActiveToday)

	avg := 0.0
	if avgHours != nil {
		avg = *avgHours
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"total_tasks":        totalTasks,
		"completed_this_week": completedThisWeek,
		"avg_completion_hours": fmt.Sprintf("%.1f", avg),
		"agents_active_today": agentsActiveToday,
	})
}

// GetAgentAnalytics handles GET /api/analytics/agents
func (h *AnalyticsHandler) GetAgentAnalytics(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT
			a.id,
			a.display_name,
			COALESCE(done.cnt, 0) AS completed,
			COALESCE(prog.cnt, 0) AS in_progress,
			COALESCE(done.avg_hours, 0) AS avg_hours,
			a.last_active
		FROM agents a
		LEFT JOIN (
			SELECT assignee, COUNT(*) AS cnt,
				AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) AS avg_hours
			FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL
			GROUP BY assignee
		) done ON done.assignee = a.id
		LEFT JOIN (
			SELECT assignee, COUNT(*) AS cnt
			FROM tasks WHERE status IN ('progress', 'todo')
			GROUP BY assignee
		) prog ON prog.assignee = a.id
		ORDER BY completed DESC
	`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, name string
		var completed, inProgress int
		var avgHours float64
		var lastActive *time.Time
		rows.Scan(&id, &name, &completed, &inProgress, &avgHours, &lastActive)
		results = append(results, map[string]interface{}{
			"id":                  id,
			"display_name":       name,
			"tasks_completed":    completed,
			"tasks_in_progress":  inProgress,
			"avg_completion_hours": fmt.Sprintf("%.1f", avgHours),
			"last_active":        lastActive,
		})
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "row iteration error: "+err.Error())
		return
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, http.StatusOK, results)
}

// GetThroughput handles GET /api/analytics/throughput
func (h *AnalyticsHandler) GetThroughput(w http.ResponseWriter, r *http.Request) {
	daysStr := r.URL.Query().Get("days")
	days := 30
	if daysStr != "" {
		if v, err := strconv.Atoi(daysStr); err == nil && v > 0 && v <= 365 {
			days = v
		}
	}

	rows, err := db.DB.Query(`
		SELECT d::date AS date, COALESCE(t.cnt, 0) AS count
		FROM generate_series(NOW() - ($1 || ' days')::interval, NOW(), '1 day') d
		LEFT JOIN (
			SELECT completed_at::date AS day, COUNT(*) AS cnt
			FROM tasks WHERE status = 'done' AND completed_at >= NOW() - ($1 || ' days')::interval
			GROUP BY day
		) t ON t.day = d::date
		ORDER BY date
	`, days)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var date time.Time
		var count int
		rows.Scan(&date, &count)
		results = append(results, map[string]interface{}{
			"date":  date.Format("2006-01-02"),
			"count": count,
		})
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "row iteration error: "+err.Error())
		return
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, http.StatusOK, results)
}

// GetTeamAnalytics handles GET /api/analytics/team
func (h *AnalyticsHandler) GetTeamAnalytics(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT
			COALESCE(a.team, 'unassigned') AS team,
			COUNT(*) FILTER (WHERE t.status = 'done') AS completed,
			COUNT(*) FILTER (WHERE t.status IN ('progress', 'todo')) AS in_progress,
			COUNT(*) AS total
		FROM tasks t
		LEFT JOIN agents a ON a.id = t.assignee
		GROUP BY a.team
		ORDER BY completed DESC
	`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var team string
		var completed, inProgress, total int
		rows.Scan(&team, &completed, &inProgress, &total)
		results = append(results, map[string]interface{}{
			"team":        team,
			"completed":   completed,
			"in_progress": inProgress,
			"total":       total,
		})
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "row iteration error: "+err.Error())
		return
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, http.StatusOK, results)
}

// ExportCSV handles GET /api/analytics/export/csv
func (h *AnalyticsHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT id, title, COALESCE(description,''), status, COALESCE(priority,''),
			COALESCE(assignee,''), COALESCE(team,''), created_at, updated_at,
			completed_at
		FROM tasks ORDER BY created_at DESC
	`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=tasks_export.csv")

	writer := csv.NewWriter(w)
	writer.Write([]string{"id", "title", "description", "status", "priority", "assignee", "team", "created_at", "updated_at", "completed_at"})

	for rows.Next() {
		var id, title, desc, status, priority, assignee, team string
		var createdAt, updatedAt time.Time
		var completedAt *time.Time
		rows.Scan(&id, &title, &desc, &status, &priority, &assignee, &team, &createdAt, &updatedAt, &completedAt)
		ca := ""
		if completedAt != nil {
			ca = completedAt.Format(time.RFC3339)
		}
		writer.Write([]string{id, title, desc, status, priority, assignee, team, createdAt.Format(time.RFC3339), updatedAt.Format(time.RFC3339), ca})
	}
	if err := rows.Err(); err != nil {
		// Headers already sent; log and flush what we have
		log.Printf("ExportCSV row iteration error: %v", err)
	}
	writer.Flush()
}

// GetTrends handles GET /api/analytics/trends?metric=throughput|cost|quality|velocity&range=30d
func (h *AnalyticsHandler) GetTrends(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		respondError(w, 400, "metric parameter required (throughput|cost|quality|velocity)")
		return
	}
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	type DataPoint struct {
		Date  string  `json:"date"`
		Value float64 `json:"value"`
	}

	var points []DataPoint
	var err error

	switch metric {
	case "throughput":
		rows, e := db.DB.Query(`
			SELECT d::date, COALESCE(t.cnt, 0)
			FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
			LEFT JOIN (
				SELECT completed_at::date AS day, COUNT(*)::float AS cnt
				FROM tasks WHERE status = 'done' AND completed_at > NOW() - $1::interval
				GROUP BY day
			) t ON t.day = d::date ORDER BY d::date`, interval)
		if e != nil {
			err = e
			break
		}
		defer rows.Close()
		for rows.Next() {
			var dp DataPoint
			var dt time.Time
			rows.Scan(&dt, &dp.Value)
			dp.Date = dt.Format("2006-01-02")
			points = append(points, dp)
		}

	case "cost":
		rows, e := db.DB.Query(`
			SELECT d::date, COALESCE(c.total, 0)
			FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
			LEFT JOIN (
				SELECT created_at::date AS day, SUM(cost_usd) AS total
				FROM agent_costs WHERE created_at > NOW() - $1::interval
				GROUP BY day
			) c ON c.day = d::date ORDER BY d::date`, interval)
		if e != nil {
			err = e
			break
		}
		defer rows.Close()
		for rows.Next() {
			var dp DataPoint
			var dt time.Time
			rows.Scan(&dt, &dp.Value)
			dp.Date = dt.Format("2006-01-02")
			points = append(points, dp)
		}

	case "quality":
		rows, e := db.DB.Query(`
			SELECT d::date, COALESCE(q.avg_score, 0)
			FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
			LEFT JOIN (
				SELECT created_at::date AS day, AVG(score) AS avg_score
				FROM evaluations WHERE created_at > NOW() - $1::interval
				GROUP BY day
			) q ON q.day = d::date ORDER BY d::date`, interval)
		if e != nil {
			err = e
			break
		}
		defer rows.Close()
		for rows.Next() {
			var dp DataPoint
			var dt time.Time
			rows.Scan(&dt, &dp.Value)
			dp.Date = dt.Format("2006-01-02")
			points = append(points, dp)
		}

	case "velocity":
		rows, e := db.DB.Query(`
			SELECT d::date, COALESCE(v.velocity, 0)
			FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
			LEFT JOIN (
				SELECT completed_at::date AS day,
					COUNT(*)::float / GREATEST(COUNT(DISTINCT assignee), 1) AS velocity
				FROM tasks WHERE status = 'done' AND completed_at > NOW() - $1::interval
				GROUP BY day
			) v ON v.day = d::date ORDER BY d::date`, interval)
		if e != nil {
			err = e
			break
		}
		defer rows.Close()
		for rows.Next() {
			var dp DataPoint
			var dt time.Time
			rows.Scan(&dt, &dp.Value)
			dp.Date = dt.Format("2006-01-02")
			points = append(points, dp)
		}

	default:
		respondError(w, 400, "unsupported metric: "+metric)
		return
	}

	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	if points == nil {
		points = []DataPoint{}
	}

	respondJSON(w, 200, map[string]interface{}{
		"metric": metric,
		"range":  r.URL.Query().Get("range"),
		"data":   points,
	})
}


// GetCycleTime handles GET /api/analytics/cycle-time?range=30d
func (h *AnalyticsHandler) GetCycleTime(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	var avgHours, medianHours, p90Hours float64
	db.DB.QueryRow(`
		SELECT COALESCE(AVG(hours),0), COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours),0),
			COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY hours),0)
		FROM (SELECT EXTRACT(EPOCH FROM (completed_at - created_at))/3600 AS hours
			FROM tasks WHERE status='done' AND completed_at IS NOT NULL
			AND completed_at > NOW() - $1::interval) sub
	`, interval).Scan(&avgHours, &medianHours, &p90Hours)

	rows, err := db.DB.Query(`
		SELECT COALESCE(priority,'unset'), AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600), COUNT(*)
		FROM tasks WHERE status='done' AND completed_at IS NOT NULL AND completed_at > NOW() - $1::interval
		GROUP BY priority ORDER BY priority
	`, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	var byPriority []map[string]interface{}
	for rows.Next() {
		var p string
		var avg float64
		var cnt int
		rows.Scan(&p, &avg, &cnt)
		byPriority = append(byPriority, map[string]interface{}{"priority": p, "avg_hours": avg, "count": cnt})
	}
	if byPriority == nil {
		byPriority = []map[string]interface{}{}
	}

	trendRows, err := db.DB.Query(`
		SELECT d::date, COALESCE(t.avg_h, 0)
		FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
		LEFT JOIN (
			SELECT completed_at::date AS day, AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) AS avg_h
			FROM tasks WHERE status='done' AND completed_at IS NOT NULL AND completed_at > NOW() - $1::interval
			GROUP BY day
		) t ON t.day = d::date ORDER BY d::date
	`, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer trendRows.Close()
	var trend []map[string]interface{}
	for trendRows.Next() {
		var dt time.Time
		var avg float64
		trendRows.Scan(&dt, &avg)
		trend = append(trend, map[string]interface{}{"date": dt.Format("2006-01-02"), "avg_hours": avg})
	}
	if trend == nil {
		trend = []map[string]interface{}{}
	}

	respondJSON(w, 200, map[string]interface{}{
		"avg_hours":    avgHours,
		"median_hours": medianHours,
		"p90_hours":    p90Hours,
		"by_priority":  byPriority,
		"trend":        trend,
	})
}

// GetActiveAgents handles GET /api/analytics/active-agents?range=30d
func (h *AnalyticsHandler) GetActiveAgents(w http.ResponseWriter, r *http.Request) {
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	rows, err := db.DB.Query(`
		SELECT d::date, COALESCE(a.cnt, 0), COALESCE(a.agents, ARRAY[]::text[])
		FROM generate_series(NOW() - $1::interval, NOW(), '1 day') d
		LEFT JOIN (
			SELECT created_at::date AS day, COUNT(DISTINCT agent_id) AS cnt,
				ARRAY_AGG(DISTINCT agent_id) AS agents
			FROM activity_log WHERE created_at > NOW() - $1::interval
			GROUP BY day
		) a ON a.day = d::date ORDER BY d::date
	`, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var dt time.Time
		var cnt int
		var agents []string
		if err := rows.Scan(&dt, &cnt, pq.Array(&agents)); err != nil {
			respondError(w, 500, err.Error())
			return
		}
		if agents == nil {
			agents = []string{}
		}
		results = append(results, map[string]interface{}{
			"date":         dt.Format("2006-01-02"),
			"active_count": cnt,
			"agents":       agents,
		})
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	respondJSON(w, 200, results)
}

// GetDashboardSummary handles GET /api/analytics/dashboard-summary
func (h *AnalyticsHandler) GetDashboardSummary(w http.ResponseWriter, r *http.Request) {
	var totalTasks, completedThisWeek, activeAgentsToday int
	var avgCycleHours, weeklyCost float64

	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&totalTasks)
	db.DB.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status='done' AND completed_at >= date_trunc('week', NOW())`).Scan(&completedThisWeek)
	db.DB.QueryRow(`SELECT COUNT(DISTINCT agent_id) FROM activity_log WHERE created_at >= CURRENT_DATE`).Scan(&activeAgentsToday)
	db.DB.QueryRow(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600),0) FROM tasks WHERE status='done' AND completed_at IS NOT NULL`).Scan(&avgCycleHours)

	var weeklyVelocity float64
	db.DB.QueryRow(`SELECT COALESCE(COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(completed_at)))/604800, 1), 0)
		FROM tasks WHERE status='done' AND completed_at >= NOW() - interval '28 days'`).Scan(&weeklyVelocity)

	db.DB.QueryRow(`SELECT COALESCE(SUM(cost_usd),0) FROM agent_costs WHERE created_at >= date_trunc('month', NOW())`).Scan(&weeklyCost)

	statusRows, err := db.DB.Query(`SELECT status, COUNT(*) FROM tasks GROUP BY status`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer statusRows.Close()
	statusDist := map[string]int{}
	for statusRows.Next() {
		var s string
		var c int
		statusRows.Scan(&s, &c)
		statusDist[s] = c
	}

	respondJSON(w, 200, map[string]interface{}{
		"total_tasks":              totalTasks,
		"completed_this_week":      completedThisWeek,
		"active_agents_today":      activeAgentsToday,
		"avg_cycle_time_hours":     avgCycleHours,
		"weekly_velocity":          weeklyVelocity,
		"total_cost_this_month":    weeklyCost,
		"task_status_distribution": statusDist,
	})
}

// GetAgentRanking handles GET /api/analytics/agents/ranking?sort_by=completed|speed|cost|quality&range=30d
func (h *AnalyticsHandler) GetAgentRanking(w http.ResponseWriter, r *http.Request) {
	sortBy := r.URL.Query().Get("sort_by")
	if sortBy == "" {
		sortBy = "completed"
	}
	interval := costRangeToInterval(r.URL.Query().Get("range"))

	orderClause := "completed DESC"
	switch sortBy {
	case "speed":
		orderClause = "avg_speed_hours ASC"
	case "cost":
		orderClause = "total_cost DESC"
	case "quality":
		orderClause = "avg_quality DESC"
	}

	query := fmt.Sprintf(`
		SELECT
			a.id,
			COALESCE(a.display_name, a.id),
			COALESCE(done.cnt, 0) AS completed,
			COALESCE(fail.cnt, 0) AS failed,
			COALESCE(done.avg_hours, 0) AS avg_speed_hours,
			COALESCE(cost.total, 0) AS total_cost,
			COALESCE(qual.avg_score, 0) AS avg_quality
		FROM agents a
		LEFT JOIN (
			SELECT assignee, COUNT(*) AS cnt,
				AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) AS avg_hours
			FROM tasks WHERE status = 'done' AND completed_at > NOW() - $1::interval
			GROUP BY assignee
		) done ON done.assignee = a.id
		LEFT JOIN (
			SELECT agent_id, COUNT(*) AS cnt
			FROM activity_log WHERE action ILIKE '%%fail%%' AND created_at > NOW() - $1::interval
			GROUP BY agent_id
		) fail ON fail.agent_id = a.id
		LEFT JOIN (
			SELECT agent_id, SUM(cost_usd) AS total
			FROM agent_costs WHERE created_at > NOW() - $1::interval
			GROUP BY agent_id
		) cost ON cost.agent_id = a.id
		LEFT JOIN (
			SELECT agent_id, AVG(score) AS avg_score
			FROM evaluations WHERE created_at > NOW() - $1::interval
			GROUP BY agent_id
		) qual ON qual.agent_id = a.id
		ORDER BY %s`, orderClause)

	rows, err := db.DB.Query(query, interval)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	type RankedAgent struct {
		AgentID        string  `json:"agent_id"`
		DisplayName    string  `json:"display_name"`
		TasksCompleted int     `json:"tasks_completed"`
		TasksFailed    int     `json:"tasks_failed"`
		CompletionRate float64 `json:"completion_rate"`
		AvgSpeedHours  float64 `json:"avg_speed_hours"`
		TotalCost      float64 `json:"total_cost"`
		AvgQuality     float64 `json:"avg_quality"`
		Rank           int     `json:"rank"`
	}

	var results []RankedAgent
	rank := 1
	for rows.Next() {
		var ra RankedAgent
		rows.Scan(&ra.AgentID, &ra.DisplayName, &ra.TasksCompleted, &ra.TasksFailed,
			&ra.AvgSpeedHours, &ra.TotalCost, &ra.AvgQuality)
		ra.CompletionRate = calculateSuccessRate(ra.TasksCompleted, ra.TasksFailed)
		ra.Rank = rank
		rank++
		results = append(results, ra)
	}
	if results == nil {
		results = []RankedAgent{}
	}
	respondJSON(w, 200, results)
}
