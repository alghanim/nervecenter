package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

type Environment struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Active bool   `json:"active"`
}

var defaultEnvironments = []Environment{
	{Name: "Local", URL: "http://localhost:8891", Active: true},
}

func envsFilePath() string {
	// Check for OPENCLAW_DIR env var first (used in Docker)
	if dir := os.Getenv("OPENCLAW_DIR"); dir != "" {
		return filepath.Join(dir, "agentboard-envs.json")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "/root"
	}
	return filepath.Join(home, ".openclaw", "agentboard-envs.json")
}

func readEnvironments() ([]Environment, error) {
	path := envsFilePath()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultEnvironments, nil
	}
	if err != nil {
		return nil, err
	}

	var envs []Environment
	if err := json.Unmarshal(data, &envs); err != nil {
		return nil, err
	}
	if len(envs) == 0 {
		return defaultEnvironments, nil
	}
	return envs, nil
}

func writeEnvironments(envs []Environment) error {
	path := envsFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(envs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

type EnvironmentHandler struct{}

// GetEnvironments handles GET /api/environments
func (h *EnvironmentHandler) GetEnvironments(w http.ResponseWriter, r *http.Request) {
	envs, err := readEnvironments()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, envs)
}

// SwitchEnvironment handles POST /api/environments/switch
func (h *EnvironmentHandler) SwitchEnvironment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.URL == "" {
		respondError(w, http.StatusBadRequest, "url is required")
		return
	}

	envs, err := readEnvironments()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	found := false
	for i := range envs {
		if envs[i].URL == req.URL {
			envs[i].Active = true
			found = true
		} else {
			envs[i].Active = false
		}
	}

	if !found {
		respondError(w, http.StatusNotFound, "environment not found")
		return
	}

	if err := writeEnvironments(envs); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, envs)
}

// AddEnvironment handles POST /api/environments
func (h *EnvironmentHandler) AddEnvironment(w http.ResponseWriter, r *http.Request) {
	var env Environment
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if env.Name == "" || env.URL == "" {
		respondError(w, http.StatusBadRequest, "name and url are required")
		return
	}

	envs, err := readEnvironments()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	env.Active = false
	envs = append(envs, env)

	if err := writeEnvironments(envs); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, envs)
}

// DeleteEnvironment handles DELETE /api/environments
func (h *EnvironmentHandler) DeleteEnvironment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	envs, err := readEnvironments()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filtered := make([]Environment, 0, len(envs))
	for _, e := range envs {
		if e.URL != req.URL {
			filtered = append(filtered, e)
		}
	}

	if err := writeEnvironments(filtered); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, filtered)
}
