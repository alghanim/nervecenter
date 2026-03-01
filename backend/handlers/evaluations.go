package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type Evaluation struct {
	ID        string          `json:"id"`
	TaskID    *string         `json:"task_id"`
	AgentID   *string         `json:"agent_id"`
	Score     float64         `json:"score"`
	Criteria  json.RawMessage `json:"criteria"`
	Evaluator string          `json:"evaluator"`
	CreatedAt string          `json:"created_at"`
}

func CreateEvaluation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TaskID    *string         `json:"task_id"`
		AgentID   *string         `json:"agent_id"`
		Score     float64         `json:"score"`
		Criteria  json.RawMessage `json:"criteria"`
		Evaluator string          `json:"evaluator"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Score < 0 || req.Score > 100 {
		respondError(w, 400, "score must be 0-100")
		return
	}
	if req.Evaluator == "" {
		req.Evaluator = "manual"
	}
	if req.Criteria == nil {
		req.Criteria = json.RawMessage(`{}`)
	}
	var id string
	err := db.DB.QueryRow(
		`INSERT INTO evaluations (task_id, agent_id, score, criteria, evaluator) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.TaskID, req.AgentID, req.Score, req.Criteria, req.Evaluator,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]string{"id": id})
}

// BulkCreateEvaluations handles POST /api/evaluations/bulk
func BulkCreateEvaluations(w http.ResponseWriter, r *http.Request) {
	var reqs []struct {
		TaskID    *string         `json:"task_id"`
		AgentID   *string         `json:"agent_id"`
		Score     float64         `json:"score"`
		Criteria  json.RawMessage `json:"criteria"`
		Evaluator string          `json:"evaluator"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqs); err != nil {
		respondError(w, 400, "invalid JSON: expected array of evaluations")
		return
	}
	if len(reqs) == 0 {
		respondError(w, 400, "empty array")
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer tx.Rollback()

	ids := []string{}
	for i, req := range reqs {
		if req.Score < 0 || req.Score > 100 {
			respondError(w, 400, "score must be 0-100 (index "+fmt.Sprintf("%d", i)+")")
			return
		}
		if req.Evaluator == "" {
			req.Evaluator = "manual"
		}
		if req.Criteria == nil {
			req.Criteria = json.RawMessage(`{}`)
		}
		var id string
		err := tx.QueryRow(
			`INSERT INTO evaluations (task_id, agent_id, score, criteria, evaluator) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			req.TaskID, req.AgentID, req.Score, req.Criteria, req.Evaluator,
		).Scan(&id)
		if err != nil {
			respondError(w, 500, err.Error())
			return
		}
		ids = append(ids, id)
	}

	if err := tx.Commit(); err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]interface{}{"ids": ids, "count": len(ids)})
}

// GetCriteriaBreakdown handles GET /api/evaluations/criteria-breakdown?agent_id=X
func GetCriteriaBreakdown(w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agent_id")
	if agentID == "" {
		respondError(w, 400, "agent_id parameter required")
		return
	}

	rows, err := db.DB.Query(
		`SELECT key, AVG(value::numeric) as avg_score, COUNT(*) as count
		 FROM evaluations, jsonb_each_text(criteria) AS kv(key, value)
		 WHERE agent_id = $1 AND criteria != '{}'::jsonb
		 GROUP BY key ORDER BY key`, agentID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	type CriteriaScore struct {
		Key      string  `json:"key"`
		AvgScore float64 `json:"avg_score"`
		Count    int     `json:"count"`
	}
	results := []CriteriaScore{}
	for rows.Next() {
		var cs CriteriaScore
		if err := rows.Scan(&cs.Key, &cs.AvgScore, &cs.Count); err == nil {
			results = append(results, cs)
		}
	}
	respondJSON(w, 200, map[string]interface{}{
		"agent_id":  agentID,
		"breakdown": results,
	})
}

func GetTaskEvaluations(w http.ResponseWriter, r *http.Request) {
	taskID := mux.Vars(r)["id"]
	rows, err := db.DB.Query(
		`SELECT id, task_id, agent_id, score, criteria, evaluator, created_at FROM evaluations WHERE task_id = $1 ORDER BY created_at DESC`, taskID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	evals := []Evaluation{}
	for rows.Next() {
		var e Evaluation
		if err := rows.Scan(&e.ID, &e.TaskID, &e.AgentID, &e.Score, &e.Criteria, &e.Evaluator, &e.CreatedAt); err != nil {
			continue
		}
		evals = append(evals, e)
	}
	respondJSON(w, 200, evals)
}

func GetAgentQuality(w http.ResponseWriter, r *http.Request) {
	agentID := mux.Vars(r)["id"]

	// Overall average
	var avgScore float64
	var totalEvals int
	db.DB.QueryRow(`SELECT COALESCE(AVG(score), 0), COUNT(*) FROM evaluations WHERE agent_id = $1`, agentID).Scan(&avgScore, &totalEvals)

	// Trend (last 30 days, grouped by day)
	rows, err := db.DB.Query(
		`SELECT DATE(created_at) as day, AVG(score) as avg_score, COUNT(*) as count
		 FROM evaluations WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '30 days'
		 GROUP BY DATE(created_at) ORDER BY day`, agentID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	type TrendPoint struct {
		Date     string  `json:"date"`
		AvgScore float64 `json:"avg_score"`
		Count    int     `json:"count"`
	}
	trend := []TrendPoint{}
	for rows.Next() {
		var tp TrendPoint
		if err := rows.Scan(&tp.Date, &tp.AvgScore, &tp.Count); err != nil {
			continue
		}
		trend = append(trend, tp)
	}

	respondJSON(w, 200, map[string]interface{}{
		"agent_id":    agentID,
		"avg_score":   avgScore,
		"total_evals": totalEvals,
		"trend":       trend,
	})
}
