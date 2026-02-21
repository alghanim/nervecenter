package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
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

	repos := candidateRepos(agentID)

	var all []Commit
	for _, repo := range repos {
		if _, err := os.Stat(repo.path); os.IsNotExist(err) {
			continue
		}
		// Try with agentID filter first, then without (to show repo-level commits)
		commits := gitLog(repo.path, repo.name, agentID, limit)
		all = append(all, commits...)
	}

	// Sort newest first and cap
	sortCommitsByDate(all)
	if len(all) > limit {
		all = all[:limit]
	}

	w.Header().Set("Content-Type", "application/json")
	if all == nil {
		all = []Commit{}
	}
	json.NewEncoder(w).Encode(all)
}

// candidateRepos returns the list of repo paths to check for an agent.
func candidateRepos(agentID string) []struct{ path, name string } {
	home, _ := os.UserHomeDir()
	openclawDir := os.Getenv("OPENCLAW_DIR")
	if openclawDir == "" {
		openclawDir = filepath.Join(home, ".openclaw")
	}

	candidates := []struct{ path, name string }{
		// Agentboard repo (mounted at /app/repo inside Docker, or ~/agentboard on host)
		{"/app/repo", "agentboard"},
		{filepath.Join(home, "agentboard"), "agentboard"},

		// Thunder site
		{"/mnt/thunder-site", "thunder-site"},
		{filepath.Join(home, "thunder-site"), "thunder-site"},

		// Agent-specific workspace under OPENCLAW_DIR
		{filepath.Join(openclawDir, fmt.Sprintf("workspace-%s", agentID)), "workspace-" + agentID},
	}

	// Deduplicate by path
	seen := map[string]bool{}
	unique := candidates[:0]
	for _, c := range candidates {
		if !seen[c.path] {
			seen[c.path] = true
			unique = append(unique, c)
		}
	}
	return unique
}

// gitLog runs git log filtered by author substring in a repo directory.
func gitLog(repoPath, repoName, authorFilter string, limit int) []Commit {
	// -c safe.directory=* bypasses ownership checks in Docker volume mounts
	args := []string{
		"-c", "safe.directory=*",
		"log",
		fmt.Sprintf("--max-count=%d", limit),
		"--format=%H|%s|%ai",
		"--all",
	}

	if authorFilter != "" {
		args = append(args, fmt.Sprintf("--author=%s", authorFilter))
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

	out, err := cmd.Output()
	if err != nil {
		log.Printf("commits: git log in %s (author=%s): %v", repoPath, authorFilter, err)
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
		hash := parts[0]
		if len(hash) > 7 {
			hash = hash[:7]
		}
		commits = append(commits, Commit{
			Hash:    hash,
			Message: parts[1],
			Date:    parts[2],
			Repo:    repoName,
		})
	}
	return commits
}

// sortCommitsByDate sorts commits newest-first.
func sortCommitsByDate(commits []Commit) {
	sort.SliceStable(commits, func(i, j int) bool {
		di, _ := time.Parse("2006-01-02 15:04:05 -0700", commits[i].Date)
		dj, _ := time.Parse("2006-01-02 15:04:05 -0700", commits[j].Date)
		return di.After(dj)
	})
}
