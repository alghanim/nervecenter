package handlers

import (
	"encoding/json"
	"log"

	"github.com/alghanim/agentboard/backend/db"
)

// WorkflowRule represents a single workflow rule from a template.
type WorkflowRule struct {
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
	Action     string `json:"action"`
	Target     string `json:"target"`
}

// applyWorkflowRules checks all templates for matching workflow rules and executes actions.
func applyWorkflowRules(taskID, fromStatus, toStatus string) {
	rows, err := db.DB.Query(`SELECT workflow_rules FROM task_templates WHERE workflow_rules != '[]'::jsonb`)
	if err != nil {
		log.Printf("[workflow] Error querying templates: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var rulesJSON json.RawMessage
		if err := rows.Scan(&rulesJSON); err != nil {
			continue
		}
		var rules []WorkflowRule
		if err := json.Unmarshal(rulesJSON, &rules); err != nil {
			continue
		}
		for _, rule := range rules {
			if rule.FromStatus == fromStatus && rule.ToStatus == toStatus {
				executeWorkflowAction(taskID, rule)
			}
		}
	}
}

func executeWorkflowAction(taskID string, rule WorkflowRule) {
	switch rule.Action {
	case "assign":
		_, err := db.DB.Exec(`UPDATE tasks SET assignee = $1, updated_at = NOW() WHERE id = $2`, rule.Target, taskID)
		if err != nil {
			log.Printf("[workflow] assign action failed for task %s: %v", taskID, err)
		} else {
			log.Printf("[workflow] Assigned task %s to %s", taskID, rule.Target)
		}

	case "notify":
		agentID := rule.Target
		if agentID == "" {
			// Get assignee from task
			db.DB.QueryRow(`SELECT COALESCE(assignee, '') FROM tasks WHERE id = $1`, taskID).Scan(&agentID)
		}
		if agentID != "" {
			CreateNotificationInternal(agentID, "workflow", "Workflow trigger", "Task "+taskID+" transitioned, triggering workflow rule")
		}

	case "create_subtask":
		title := rule.Target
		if title == "" {
			title = "Auto-created subtask"
		}
		_, err := db.DB.Exec(
			`INSERT INTO tasks (title, status, priority, parent_task_id) VALUES ($1, 'todo', 'medium', $2)`,
			title, taskID,
		)
		if err != nil {
			log.Printf("[workflow] create_subtask failed for task %s: %v", taskID, err)
		} else {
			log.Printf("[workflow] Created subtask '%s' for task %s", title, taskID)
		}
	}
}
