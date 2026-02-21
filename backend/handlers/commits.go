package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// CommitsHandler serves git commit history for agents.
type CommitsHandler struct{}

// Commit represents a single git commit entry.
type Commit struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Date    string `json:"date"`
	Repo    string `json:"repo"`
}

// GET /api/agents/{id}/commits?limit=10
func (h *CommitsHandler) GetCommits(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	agentID := vars["id"]

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	// Resolve agent name (may be "forge", "titan", etc.)
	agentName := resolveAgentName(agentID)

	// Repos to check
	home, _ := os.UserHomeDir()
	repos := []struct {
		path string
		name string
	}{
		{filepath.Join(home, "thunder-site"), "thunder-site"},
		{filepath.Join(home, "agentboard"), "agentboard"},
		// Agent-specific workspace under ~/.openclaw/workspace-{agentID}
		{filepath.Join(home, ".openclaw", fmt.Sprintf("workspace-%s", agentID)), "workspace-" + agentID},
	}

	var all []Commit

	for _, repo := range repos {
		if _, err := os.Stat(repo.path); os.IsNotExist(err) {
			continue
		}
		commits := gitLog(repo.path, repo.name, agentName, limit)
		all = append(all, commits...)
	}

	// Sort by date descending (they're already in order per repo; merge by taking first N)
	// Simple approach: sort all combined
	sortCommitsByDate(all)
	if len(all) > limit {
		all = all[:limit]
	}

	w.Header().Set("Content-Type", "application/json")
	if all == nil {
		all = []Commit{} // return [] not null
	}
	json.NewEncoder(w).Encode(all)
}

// gitLog runs git log filtered by author in a repo directory.
func gitLog(repoPath, repoName, authorName string, limit int) []Commit {
	args := []string{
		"log",
		fmt.Sprintf("--max-count=%d", limit),
		"--format=%H|%s|%ai", // full hash | subject | date ISO
	}

	// If authorName is non-empty, filter by author
	if authorName != "" {
		args = append(args, fmt.Sprintf("--author=%s", authorName))
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

	out, err := cmd.Output()
	if err != nil {
		// Not a git repo or no commits — silently skip
		log.Printf("commits: git log in %s: %v", repoPath, err)
		return nil
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var commits []Commit
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 3 {
			continue
		}
		commits = append(commits, Commit{
			Hash:    parts[0][:7],  // short hash
			Message: parts[1],
			Date:    parts[2],
			Repo:    repoName,
		})
	}
	return commits
}

// resolveAgentName maps an agent ID to a display name for git --author filtering.
// Many agents commit using their display name (e.g. "forge" → "forge").
func resolveAgentName(agentID string) string {
	// Try to map common IDs to git author names.
	// The simplest heuristic: use the agentID itself; git --author does partial matching.
	return agentID
}

// sortCommitsByDate sorts commits newest-first by their ISO date string.
func sortCommitsByDate(commits []Commit) {
	// Simple insertion sort (slice is small)
	for i := 1; i < len(commits); i++ {
		for j := i; j > 0; j-- {
			di, _ := time.Parse("2006-01-02 15:04:05 -0700", commits[j].Date)
			dj, _ := time.Parse("2006-01-02 15:04:05 -0700", commits[j-1].Date)
			if di.After(dj) {
				commits[j], commits[j-1] = commits[j-1], commits[j]
			} else {
				break
			}
		}
	}
}
