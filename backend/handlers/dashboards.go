package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// DashboardsHandler manages custom user dashboards (file-backed JSON).
type DashboardsHandler struct {
	mu sync.RWMutex
}

type Widget struct {
	ID     string                 `json:"id"`
	Type   string                 `json:"type"`
	X      int                    `json:"x"`
	Y      int                    `json:"y"`
	W      int                    `json:"w"`
	H      int                    `json:"h"`
	Config map[string]interface{} `json:"config"`
}

type CustomDashboard struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	IsDefault bool     `json:"is_default"`
	Widgets   []Widget `json:"widgets"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

type dashboardsFile struct {
	Dashboards []CustomDashboard `json:"dashboards"`
}

func (h *DashboardsHandler) filePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".openclaw", "agentboard-dashboards.json")
}

func (h *DashboardsHandler) load() (*dashboardsFile, error) {
	data, err := os.ReadFile(h.filePath())
	if err != nil {
		if os.IsNotExist(err) {
			return h.createDefault()
		}
		return nil, err
	}
	var f dashboardsFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if len(f.Dashboards) == 0 {
		return h.createDefault()
	}
	return &f, nil
}

func (h *DashboardsHandler) createDefault() (*dashboardsFile, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	f := &dashboardsFile{
		Dashboards: []CustomDashboard{
			{
				ID:        uuid.New().String(),
				Name:      "My Dashboard",
				IsDefault: true,
				CreatedAt: now,
				UpdatedAt: now,
				Widgets: []Widget{
					{ID: uuid.New().String(), Type: "agent-status", X: 0, Y: 0, W: 6, H: 2, Config: map[string]interface{}{}},
					{ID: uuid.New().String(), Type: "task-summary", X: 6, Y: 0, W: 3, H: 1, Config: map[string]interface{}{}},
					{ID: uuid.New().String(), Type: "activity-feed", X: 0, Y: 2, W: 6, H: 3, Config: map[string]interface{}{}},
					{ID: uuid.New().String(), Type: "cost-overview", X: 6, Y: 1, W: 3, H: 1, Config: map[string]interface{}{}},
				},
			},
		},
	}
	if err := h.save(f); err != nil {
		return nil, err
	}
	return f, nil
}

func (h *DashboardsHandler) save(f *dashboardsFile) error {
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(h.filePath())
	os.MkdirAll(dir, 0755)
	return os.WriteFile(h.filePath(), data, 0644)
}

// ListDashboards GET /api/dashboards
func (h *DashboardsHandler) ListDashboards(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	f, err := h.load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, f.Dashboards)
}

// GetDashboard GET /api/dashboards/{id}
func (h *DashboardsHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	id := mux.Vars(r)["id"]
	f, err := h.load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, d := range f.Dashboards {
		if d.ID == id {
			respondJSON(w, http.StatusOK, d)
			return
		}
	}
	respondError(w, http.StatusNotFound, "dashboard not found")
}

// CreateDashboard POST /api/dashboards
func (h *DashboardsHandler) CreateDashboard(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	var input struct {
		Name    string   `json:"name"`
		Widgets []Widget `json:"widgets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	f, err := h.load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if input.Widgets == nil {
		input.Widgets = []Widget{}
	}
	d := CustomDashboard{
		ID:        uuid.New().String(),
		Name:      input.Name,
		Widgets:   input.Widgets,
		CreatedAt: now,
		UpdatedAt: now,
	}
	f.Dashboards = append(f.Dashboards, d)
	if err := h.save(f); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, d)
}

// UpdateDashboard PUT /api/dashboards/{id}
func (h *DashboardsHandler) UpdateDashboard(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	id := mux.Vars(r)["id"]
	var input struct {
		Name    *string  `json:"name,omitempty"`
		Widgets []Widget `json:"widgets,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	f, err := h.load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i, d := range f.Dashboards {
		if d.ID == id {
			if input.Name != nil {
				f.Dashboards[i].Name = *input.Name
			}
			if input.Widgets != nil {
				f.Dashboards[i].Widgets = input.Widgets
			}
			f.Dashboards[i].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			if err := h.save(f); err != nil {
				respondError(w, http.StatusInternalServerError, err.Error())
				return
			}
			respondJSON(w, http.StatusOK, f.Dashboards[i])
			return
		}
	}
	respondError(w, http.StatusNotFound, "dashboard not found")
}

// DeleteDashboard DELETE /api/dashboards/{id}
func (h *DashboardsHandler) DeleteDashboard(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	id := mux.Vars(r)["id"]
	f, err := h.load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i, d := range f.Dashboards {
		if d.ID == id {
			f.Dashboards = append(f.Dashboards[:i], f.Dashboards[i+1:]...)
			if err := h.save(f); err != nil {
				respondError(w, http.StatusInternalServerError, err.Error())
				return
			}
			respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
			return
		}
	}
	respondError(w, http.StatusNotFound, "dashboard not found")
}
