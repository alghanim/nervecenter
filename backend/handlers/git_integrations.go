package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/alghanim/agentboard/backend/db"
	"github.com/gorilla/mux"
)

type GitIntegration struct {
	ID            string `json:"id"`
	Provider      string `json:"provider"`
	RepoURL       string `json:"repo_url"`
	TokenHash     string `json:"token_hash,omitempty"`
	WebhookSecret string `json:"webhook_secret,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type PRLink struct {
	ID            string `json:"id"`
	TaskID        string `json:"task_id"`
	IntegrationID string `json:"integration_id"`
	PRNumber      int    `json:"pr_number"`
	PRTitle       string `json:"pr_title"`
	PRURL         string `json:"pr_url"`
	PRState       string `json:"pr_state"`
	BranchName    string `json:"branch_name"`
	AuthorLogin   string `json:"author_login"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

func GetGitIntegrations(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`SELECT id, provider, repo_url, created_at, updated_at FROM git_integrations ORDER BY created_at DESC`)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	integrations := []GitIntegration{}
	for rows.Next() {
		var g GitIntegration
		if err := rows.Scan(&g.ID, &g.Provider, &g.RepoURL, &g.CreatedAt, &g.UpdatedAt); err != nil {
			continue
		}
		integrations = append(integrations, g)
	}
	respondJSON(w, 200, integrations)
}

func CreateGitIntegration(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider      string `json:"provider"`
		RepoURL       string `json:"repo_url"`
		Token         string `json:"token"`
		WebhookSecret string `json:"webhook_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "invalid JSON")
		return
	}
	if req.Provider == "" || req.RepoURL == "" {
		respondError(w, 400, "provider and repo_url required")
		return
	}
	tokenHash := ""
	if req.Token != "" {
		h := sha256.Sum256([]byte(req.Token))
		tokenHash = hex.EncodeToString(h[:8])
	}
	var id string
	err := db.DB.QueryRow(
		`INSERT INTO git_integrations (provider, repo_url, token_hash, webhook_secret) VALUES ($1, $2, $3, $4) RETURNING id`,
		req.Provider, req.RepoURL, tokenHash, req.WebhookSecret,
	).Scan(&id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 201, map[string]string{"id": id})
}

func DeleteGitIntegration(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	_, err := db.DB.Exec(`DELETE FROM git_integrations WHERE id = $1`, id)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	respondJSON(w, 200, map[string]string{"status": "deleted"})
}

func GetTaskPRs(w http.ResponseWriter, r *http.Request) {
	taskID := mux.Vars(r)["id"]
	rows, err := db.DB.Query(
		`SELECT id, task_id, COALESCE(integration_id::text,''), pr_number, pr_title, pr_url, pr_state, branch_name, author_login, created_at, updated_at
		 FROM pr_links WHERE task_id = $1 ORDER BY created_at DESC`, taskID)
	if err != nil {
		respondError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	prs := []PRLink{}
	for rows.Next() {
		var p PRLink
		if err := rows.Scan(&p.ID, &p.TaskID, &p.IntegrationID, &p.PRNumber, &p.PRTitle, &p.PRURL, &p.PRState, &p.BranchName, &p.AuthorLogin, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		prs = append(prs, p)
	}
	respondJSON(w, 200, prs)
}

func GitHubWebhookHandler(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, 400, "cannot read body")
		return
	}
	event := r.Header.Get("X-GitHub-Event")
	sig := r.Header.Get("X-Hub-Signature-256")
	if sig != "" {
		rows, _ := db.DB.Query(`SELECT webhook_secret FROM git_integrations WHERE provider = 'github' AND webhook_secret != ''`)
		if rows != nil {
			defer rows.Close()
			verified := false
			for rows.Next() {
				var secret string
				rows.Scan(&secret)
				if verifyGitHubSignature(body, sig, secret) {
					verified = true
					break
				}
			}
			if !verified {
				respondError(w, 403, "invalid signature")
				return
			}
		}
	}
	switch event {
	case "pull_request":
		handlePREvent(body)
	case "push":
		handlePushEvent(body)
	case "issue_comment":
		handleIssueCommentEvent(body)
	}
	respondJSON(w, 200, map[string]string{"status": "ok"})
}

func verifyGitHubSignature(payload []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

var taskIDPattern = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
var ncRefPattern = regexp.MustCompile(`NC-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`)

func handlePREvent(body []byte) {
	var event struct {
		Action string `json:"action"`
		PR     struct {
			Number  int    `json:"number"`
			Title   string `json:"title"`
			HTMLURL string `json:"html_url"`
			State   string `json:"state"`
			Head    struct {
				Ref string `json:"ref"`
			} `json:"head"`
			Merged bool   `json:"merged"`
			Body   string `json:"body"`
			User struct {
				Login string `json:"login"`
			} `json:"user"`
		} `json:"pull_request"`
		Repository struct {
			HTMLURL string `json:"html_url"`
		} `json:"repository"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return
	}
	taskIDs := findTaskIDs(event.PR.Head.Ref, event.PR.Body, event.PR.Title)
	var integrationID string
	db.DB.QueryRow(`SELECT id FROM git_integrations WHERE repo_url LIKE $1 LIMIT 1`,
		"%"+extractRepoPath(event.Repository.HTMLURL)+"%").Scan(&integrationID)
	for _, taskID := range taskIDs {
		db.DB.Exec(
			`INSERT INTO pr_links (task_id, integration_id, pr_number, pr_title, pr_url, pr_state, branch_name, author_login)
			 VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (task_id, pr_number) DO UPDATE SET pr_title=$4, pr_state=$6, updated_at=NOW()`,
			taskID, integrationID, event.PR.Number, event.PR.Title, event.PR.HTMLURL, event.PR.State, event.PR.Head.Ref, event.PR.User.Login,
		)
		if event.Action == "opened" || event.Action == "reopened" {
			db.DB.Exec(`UPDATE tasks SET status = 'review', updated_at = NOW() WHERE id = $1 AND status IN ('progress', 'todo')`, taskID)
			logActivity("github", "pr_opened", taskID, map[string]string{
				"pr_number": fmt.Sprintf("%d", event.PR.Number),
				"pr_url":    event.PR.HTMLURL,
			})
		}
		if event.Action == "closed" {
			logActivity("github", "pr_closed", taskID, map[string]string{
				"pr_number": fmt.Sprintf("%d", event.PR.Number),
			})
			// If PR was merged, auto-transition task to done
			if event.PR.Merged {
				db.DB.Exec(`UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status IN ('review', 'progress')`, taskID)
				logActivity("github", "pr_merged_task_done", taskID, map[string]string{
					"pr_number": fmt.Sprintf("%d", event.PR.Number),
				})
			}
		}
	}
}

func handlePushEvent(body []byte) {
	var event struct {
		Ref     string `json:"ref"`
		Commits []struct {
			ID      string `json:"id"`
			Message string `json:"message"`
			Author  struct {
				Name string `json:"name"`
			} `json:"author"`
			URL string `json:"url"`
		} `json:"commits"`
		Repository struct {
			HTMLURL string `json:"html_url"`
		} `json:"repository"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return
	}
	for _, commit := range event.Commits {
		taskIDs := findTaskIDs(commit.Message, event.Ref, "")
		for _, taskID := range taskIDs {
			logActivity("github", "push", taskID, map[string]string{
				"ref":       event.Ref,
				"message":   commit.Message,
				"commit_id": commit.ID,
				"author":    commit.Author.Name,
				"url":       commit.URL,
			})
		}
	}
}

func handleIssueCommentEvent(body []byte) {
	var event struct {
		Action string `json:"action"`
		Issue  struct {
			Number int    `json:"number"`
			Title  string `json:"title"`
			Body   string `json:"body"`
		} `json:"issue"`
		Comment struct {
			Body string `json:"body"`
			User struct {
				Login string `json:"login"`
			} `json:"user"`
		} `json:"comment"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return
	}
	if event.Action != "created" {
		return
	}
	// Find task references in comment body and issue title/body
	taskIDs := findTaskIDs(event.Comment.Body, event.Issue.Title, event.Issue.Body)
	for _, taskID := range taskIDs {
		// Create a comment on the linked task
		content := fmt.Sprintf("GitHub comment by @%s on issue #%d: %s",
			event.Comment.User.Login, event.Issue.Number, event.Comment.Body)
		if len(content) > 2000 {
			content = content[:2000]
		}
		db.DB.Exec(
			`INSERT INTO comments (task_id, author, content) VALUES ($1, $2, $3)`,
			taskID, "github", content,
		)
		logActivity("github", "issue_comment", taskID, map[string]string{
			"issue_number": fmt.Sprintf("%d", event.Issue.Number),
			"author":       event.Comment.User.Login,
		})
	}
}

func findTaskIDs(sources ...string) []string {
	seen := map[string]bool{}
	var ids []string
	for _, s := range sources {
		// Check UUID pattern
		matches := taskIDPattern.FindAllString(s, -1)
		for _, m := range matches {
			var exists bool
			db.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)`, m).Scan(&exists)
			if exists && !seen[m] {
				seen[m] = true
				ids = append(ids, m)
			}
		}
		// Check NC-{uuid} references
		ncMatches := ncRefPattern.FindAllStringSubmatch(s, -1)
		for _, match := range ncMatches {
			if len(match) > 1 {
				m := match[1]
				if !seen[m] {
					var exists bool
					db.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)`, m).Scan(&exists)
					if exists {
						seen[m] = true
						ids = append(ids, m)
					}
				}
			}
		}
	}
	return ids
}

func extractRepoPath(url string) string {
	url = strings.TrimSuffix(url, "/")
	parts := strings.Split(url, "/")
	if len(parts) >= 2 {
		return parts[len(parts)-2] + "/" + parts[len(parts)-1]
	}
	return url
}
