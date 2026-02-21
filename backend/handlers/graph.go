package handlers

import (
	"database/sql"
	"net/http"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/alghanim/agentboard/backend/db"
)

// GraphNode represents a node in the dependency graph.
type GraphNode struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Emoji  string `json:"emoji"`
	Team   string `json:"team"`
	Status string `json:"status"`
	Role   string `json:"role"`
}

// GraphEdge represents a directed edge in the dependency graph.
type GraphEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Type string `json:"type"` // "parent" or "task-flow"
}

// GraphResponse is the full graph payload.
type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// GetDependencyGraph handles GET /api/graph/dependencies
func GetDependencyGraph(w http.ResponseWriter, r *http.Request) {
	agents := config.GetAgents()

	// Build agent status map from DB
	statusMap := make(map[string]string)
	rows, err := db.DB.Query(`SELECT id, COALESCE(status, 'offline') FROM agents`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, status string
			if err := rows.Scan(&id, &status); err == nil {
				statusMap[id] = status
			}
		}
	}

	// Build nodes
	nodes := make([]GraphNode, 0, len(agents))
	nodeIDs := make(map[string]bool)
	for _, a := range agents {
		status := statusMap[a.ID]
		if status == "" {
			status = "offline"
		}
		nodes = append(nodes, GraphNode{
			ID:     a.ID,
			Name:   a.Name,
			Emoji:  a.Emoji,
			Team:   a.Team,
			Status: status,
			Role:   a.Role,
		})
		nodeIDs[a.ID] = true
	}

	// Build parent edges from config
	edges := []GraphEdge{}
	seenEdges := make(map[string]bool)
	for _, a := range agents {
		if a.Parent == "" {
			continue
		}
		// Find parent by name, then match to ID
		parentID := ""
		for _, p := range agents {
			if p.Name == a.Parent || p.ID == a.Parent {
				parentID = p.ID
				break
			}
		}
		if parentID == "" {
			continue
		}
		key := parentID + "→" + a.ID + ":parent"
		if !seenEdges[key] {
			seenEdges[key] = true
			edges = append(edges, GraphEdge{
				From: parentID,
				To:   a.ID,
				Type: "parent",
			})
		}
	}

	// Build task-flow edges from recent activity_log (assignee changes)
	taskRows, err := db.DB.Query(`
		SELECT DISTINCT ON (from_agent, to_agent)
			from_agent, to_agent
		FROM (
			SELECT
				LAG(agent_id) OVER (PARTITION BY task_id ORDER BY created_at) AS from_agent,
				agent_id AS to_agent
			FROM activity_log
			WHERE action IN ('assigned', 'task_assigned', 'transition', 'comment')
			  AND created_at > NOW() - INTERVAL '7 days'
			  AND agent_id IS NOT NULL
		) sub
		WHERE from_agent IS NOT NULL AND from_agent != to_agent
		LIMIT 50
	`)
	if err == nil {
		defer taskRows.Close()
		for taskRows.Next() {
			var fromAgent, toAgent sql.NullString
			if err := taskRows.Scan(&fromAgent, &toAgent); err != nil {
				continue
			}
			if !fromAgent.Valid || !toAgent.Valid {
				continue
			}
			from := fromAgent.String
			to := toAgent.String
			// Only add edges for known agents
			if !nodeIDs[from] || !nodeIDs[to] {
				continue
			}
			key := from + "→" + to + ":task-flow"
			if !seenEdges[key] {
				seenEdges[key] = true
				edges = append(edges, GraphEdge{
					From: from,
					To:   to,
					Type: "task-flow",
				})
			}
		}
	}

	respondJSON(w, http.StatusOK, GraphResponse{
		Nodes: nodes,
		Edges: edges,
	})
}
