// Package config provides config-driven agent discovery for AgentBoard.
// It reads agents.yaml from path in env var AGENTS_CONFIG (default: /app/agents.yaml)
// and supports hot-reload on SIGHUP.
package config

import (
	"bufio"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"gopkg.in/yaml.v3"
)

// AgentNode is a node in the YAML hierarchy (supports nested children).
type AgentNode struct {
	ID        string       `yaml:"id"`
	Name      string       `yaml:"name"`
	Emoji     string       `yaml:"emoji"`
	Role      string       `yaml:"role"`
	Team      string       `yaml:"team"`
	TeamColor string       `yaml:"team_color"`
	IsLead    bool         `yaml:"is_lead"`
	Model     string       `yaml:"model,omitempty"`
	Children  []*AgentNode `yaml:"children,omitempty"`

	// Set during flattening — not in YAML
	Parent string `yaml:"-"`
}

// Branding holds the branding configuration from agents.yaml.
type Branding struct {
	TeamName    string `yaml:"team_name" json:"team_name"`
	LogoPath    string `yaml:"logo_path" json:"logo_path"`
	AccentColor string `yaml:"accent_color" json:"accent_color"`
	Theme       string `yaml:"theme" json:"theme"`
}

// AgentsFile is the top-level YAML structure.
type AgentsFile struct {
	Name        string              `yaml:"name"`
	OpenClawDir string              `yaml:"openclaw_dir"`
	Agents      []*AgentNode        `yaml:"agents"`
	LegacyDirs  map[string][]string `yaml:"legacy_dirs"`
	Branding    Branding            `yaml:"branding"`
}

// Agent is a flat agent record (after hierarchy flattening).
type Agent struct {
	ID        string
	Name      string
	Emoji     string
	Role      string
	Team      string
	TeamColor string
	IsLead    bool
	Model     string
	Parent    string
}

// HierarchyNode is a node in the agent hierarchy tree (for /api/structure).
type HierarchyNode struct {
	ID        string           `json:"id"`
	Name      string           `json:"name"`
	Emoji     string           `json:"emoji"`
	Role      string           `json:"role"`
	Team      string           `json:"team"`
	TeamColor string           `json:"teamColor"`
	IsLead    bool             `json:"isLead"`
	Parent    string           `json:"parent,omitempty"`
	Children  []*HierarchyNode `json:"children,omitempty"`
}

// openClawAgentEntry is a single entry in openclaw.json agents.list[].
type openClawAgentEntry struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Workspace string `json:"workspace"`
	Model     string `json:"model"`
}

// openClawJSON is the top-level structure of openclaw.json (partial).
type openClawJSON struct {
	Agents struct {
		List []openClawAgentEntry `json:"list"`
	} `json:"agents"`
}

// registry holds the loaded config.
type registry struct {
	mu          sync.RWMutex
	teamName    string
	openClawDir string
	agents      []Agent
	agentByName map[string]*Agent
	agentByID   map[string]*Agent
	legacyDirs  map[string][]string
	hierarchy   []*HierarchyNode
	branding    Branding
}

var global = &registry{}

func init() {
	if err := global.load(); err != nil {
		log.Printf("[config] WARNING: failed to load agents config: %v", err)
	}
	go global.watchSIGHUP()
}

// configPath returns the path to agents.yaml.
func configPath() string {
	if p := os.Getenv("AGENTS_CONFIG"); p != "" {
		return p
	}
	candidates := []string{
		"/app/agents.yaml",
		"./agents.yaml",
		"../agents.yaml",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "./agents.yaml"
}

// flattenNode recursively flattens a node tree into a list of Agents.
func flattenNode(node *AgentNode, parent string, out *[]Agent) {
	node.Parent = parent
	*out = append(*out, Agent{
		ID:        node.ID,
		Name:      node.Name,
		Emoji:     node.Emoji,
		Role:      node.Role,
		Team:      node.Team,
		TeamColor: node.TeamColor,
		IsLead:    node.IsLead,
		Model:     node.Model,
		Parent:    parent,
	})
	for _, child := range node.Children {
		flattenNode(child, node.Name, out)
	}
}

// buildHierarchyNode converts an AgentNode tree to HierarchyNode tree.
func buildHierarchyNode(node *AgentNode, parent string) *HierarchyNode {
	h := &HierarchyNode{
		ID:        node.ID,
		Name:      node.Name,
		Emoji:     node.Emoji,
		Role:      node.Role,
		Team:      node.Team,
		TeamColor: node.TeamColor,
		IsLead:    node.IsLead,
		Parent:    parent,
	}
	for _, child := range node.Children {
		h.Children = append(h.Children, buildHierarchyNode(child, node.Name))
	}
	return h
}

// isASCIIWord returns true if all runes in s are plain ASCII.
func isASCIIWord(s string) bool {
	for _, r := range s {
		if r > 127 {
			return false
		}
	}
	return true
}

// parseSoulMD reads a SOUL.md file and extracts name, emoji, and role (best-effort).
func parseSoulMD(path string) (name, emoji, role string) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineNum++
		if lineNum > 30 {
			break
		}
		// First heading: # SOUL.md — Name Emoji  OR  # Name Emoji
		if strings.HasPrefix(line, "# ") && name == "" {
			rest := strings.TrimPrefix(line, "# ")
			// Strip "SOUL.md — " prefix if present
			if idx := strings.Index(rest, " — "); idx >= 0 {
				rest = rest[idx+3:]
			}
			parts := strings.Fields(rest)
			if len(parts) >= 2 {
				last := parts[len(parts)-1]
				if !isASCIIWord(last) {
					emoji = last
					name = strings.Join(parts[:len(parts)-1], " ")
				} else {
					name = rest
				}
			} else if len(parts) == 1 {
				name = parts[0]
			}
		}
		// First non-heading, non-empty line that looks like a role description
		if role == "" && !strings.HasPrefix(line, "#") && strings.TrimSpace(line) != "" {
			lower := strings.ToLower(line)
			if strings.Contains(lower, "you are") || strings.Contains(lower, "lead") ||
				strings.Contains(lower, "agent") || strings.Contains(lower, "engineer") ||
				strings.Contains(lower, "manager") || strings.Contains(lower, "analyst") {
				role = strings.TrimSpace(line)
				if len(role) > 120 {
					role = role[:120]
				}
			}
		}
	}
	return name, emoji, role
}

// readOpenClawJSON reads openclaw.json from the given dir and returns agent entries.
func readOpenClawJSON(openClawDir string) ([]openClawAgentEntry, error) {
	path := filepath.Join(openClawDir, "openclaw.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var oc openClawJSON
	if err := json.Unmarshal(data, &oc); err != nil {
		return nil, err
	}
	return oc.Agents.List, nil
}

// load reads and parses agents.yaml + openclaw.json for dynamic agent discovery.
func (r *registry) load() error {
	path := configPath()
	abs, _ := filepath.Abs(path)

	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var af AgentsFile
	if err := yaml.Unmarshal(data, &af); err != nil {
		return err
	}

	// Determine openclaw dir
	openClawDir := af.OpenClawDir
	if d := os.Getenv("OPENCLAW_DIR"); d != "" {
		openClawDir = d
	}
	if openClawDir == "" {
		home := os.Getenv("HOME")
		openClawDir = filepath.Join(home, ".openclaw")
	}

	// Flatten agents from hierarchy
	var flat []Agent
	var hierarchy []*HierarchyNode
	for _, root := range af.Agents {
		flattenNode(root, "", &flat)
		hierarchy = append(hierarchy, buildHierarchyNode(root, ""))
	}

	// Build a map of YAML agents by ID
	yamlAgents := make(map[string]Agent, len(flat))
	for _, a := range flat {
		yamlAgents[a.ID] = a
	}

	// Read openclaw.json for dynamic agent discovery
	ocEntries, ocErr := readOpenClawJSON(openClawDir)
	if ocErr != nil {
		log.Printf("[config] Could not read openclaw.json (using agents.yaml only): %v", ocErr)
	}

	// Build map of openclaw.json agents
	ocAgents := make(map[string]openClawAgentEntry, len(ocEntries))
	for _, e := range ocEntries {
		ocAgents[e.ID] = e
	}

	merged := make(map[string]Agent)

	// Add all openclaw.json agents (prefer YAML hierarchy info when available)
	for id, oc := range ocAgents {
		if ya, ok := yamlAgents[id]; ok {
			if ya.Model == "" && oc.Model != "" {
				ya.Model = oc.Model
			}
			// Enrich yaml agent with SOUL.md if fields are missing
			workspace := oc.Workspace
			if workspace == "" {
				workspace = filepath.Join(openClawDir, "workspace-"+id)
			}
			sName, sEmoji, sRole := parseSoulMD(filepath.Join(workspace, "SOUL.md"))
			if ya.Name == "" && sName != "" {
				ya.Name = sName
			}
			if ya.Emoji == "" && sEmoji != "" {
				ya.Emoji = sEmoji
			}
			if ya.Role == "" && sRole != "" {
				ya.Role = sRole
			}
			merged[id] = ya
		} else {
			// New agent from openclaw.json — auto-create with defaults
			a := Agent{
				ID:        id,
				Name:      id,
				Emoji:     "🤖",
				Team:      "Discovered",
				TeamColor: "#6B7280",
				Model:     oc.Model,
			}
			if oc.Name != "" {
				a.Name = oc.Name
			}
			workspace := oc.Workspace
			if workspace == "" {
				workspace = filepath.Join(openClawDir, "workspace-"+id)
			}
			sName, sEmoji, sRole := parseSoulMD(filepath.Join(workspace, "SOUL.md"))
			if sName != "" {
				a.Name = sName
			}
			if sEmoji != "" {
				a.Emoji = sEmoji
			}
			if sRole != "" {
				a.Role = sRole
			}
			merged[id] = a
			log.Printf("[config] Discovered new agent from openclaw.json: %s", id)
		}
	}

	// Also keep agents from agents.yaml not in openclaw.json (hierarchy info preserved)
	for id, ya := range yamlAgents {
		if _, ok := merged[id]; !ok {
			merged[id] = ya
			log.Printf("[config] Keeping agents.yaml agent not in openclaw.json: %s", id)
		}
	}

	// Convert map to slice with defaults
	result := make([]Agent, 0, len(merged))
	for _, a := range merged {
		if a.Name == "" {
			a.Name = a.ID
		}
		if a.Emoji == "" {
			a.Emoji = "🤖"
		}
		result = append(result, a)
	}

	// Resolve branding defaults
	branding := af.Branding
	if branding.TeamName == "" {
		branding.TeamName = af.Name
	}
	if branding.Theme == "" {
		branding.Theme = "dark"
	}

	// Build lookup maps
	byName := make(map[string]*Agent, len(result))
	byID := make(map[string]*Agent, len(result))
	for i := range result {
		a := &result[i]
		byName[a.Name] = a
		byID[a.ID] = a
	}

	r.mu.Lock()
	r.teamName = af.Name
	r.openClawDir = openClawDir
	r.agents = result
	r.agentByName = byName
	r.agentByID = byID
	r.legacyDirs = af.LegacyDirs
	r.hierarchy = hierarchy
	r.branding = branding
	r.mu.Unlock()

	log.Printf("[config] Loaded %d agents from %s (openclaw_dir=%s)", len(result), abs, openClawDir)
	return nil
}

// watchSIGHUP listens for SIGHUP and reloads config.
func (r *registry) watchSIGHUP() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGHUP)
	for range ch {
		log.Println("[config] SIGHUP received — reloading agents config...")
		if err := r.load(); err != nil {
			log.Printf("[config] Reload failed: %v", err)
		}
	}
}

// --- Public API ---

// Reload re-reads agents.yaml and openclaw.json (can be called from goroutines).
func Reload() error {
	return global.load()
}

// GetTeamName returns the configured team name.
func GetTeamName() string {
	global.mu.RLock()
	defer global.mu.RUnlock()
	return global.teamName
}

// GetOpenClawDir returns the configured openclaw directory.
func GetOpenClawDir() string {
	global.mu.RLock()
	defer global.mu.RUnlock()
	return global.openClawDir
}

// GetAgents returns a snapshot of all configured agents (flat list).
func GetAgents() []Agent {
	global.mu.RLock()
	defer global.mu.RUnlock()
	cp := make([]Agent, len(global.agents))
	copy(cp, global.agents)
	return cp
}

// GetAgent returns the agent with the given name (or nil).
func GetAgent(name string) *Agent {
	global.mu.RLock()
	defer global.mu.RUnlock()
	if a, ok := global.agentByName[name]; ok {
		cp := *a
		return &cp
	}
	return nil
}

// GetAgentByID returns the agent with the given ID (or nil).
func GetAgentByID(id string) *Agent {
	global.mu.RLock()
	defer global.mu.RUnlock()
	if a, ok := global.agentByID[id]; ok {
		cp := *a
		return &cp
	}
	return nil
}

// GetLegacyDirs returns the legacy directory alias map.
func GetLegacyDirs() map[string][]string {
	global.mu.RLock()
	defer global.mu.RUnlock()
	cp := make(map[string][]string, len(global.legacyDirs))
	for k, v := range global.legacyDirs {
		vs := make([]string, len(v))
		copy(vs, v)
		cp[k] = vs
	}
	return cp
}

// GetBranding returns the branding configuration.
func GetBranding() Branding {
	global.mu.RLock()
	defer global.mu.RUnlock()
	return global.branding
}

// GetHierarchy returns the full agent hierarchy tree.
func GetHierarchy() []*HierarchyNode {
	global.mu.RLock()
	defer global.mu.RUnlock()
	cp := make([]*HierarchyNode, len(global.hierarchy))
	copy(cp, global.hierarchy)
	return cp
}
