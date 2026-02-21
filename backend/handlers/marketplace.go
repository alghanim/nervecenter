package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
)

// TemplateAgent represents an agent within a marketplace template
type TemplateAgent struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Soul      string `json:"soul"`
	Memory    string `json:"memory"`
	Heartbeat string `json:"heartbeat"`
}

// Template represents a deployable agent template in the marketplace
type Template struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Category     string          `json:"category"`
	Author       string          `json:"author"`
	Version      string          `json:"version"`
	Icon         string          `json:"icon"`
	Stars        int             `json:"stars"`
	Deploys      int             `json:"deploys"`
	Agents       []TemplateAgent `json:"agents"`
	Requirements []string        `json:"requirements"`
}

// MarketplaceHandler handles marketplace-related HTTP endpoints
type MarketplaceHandler struct{}

var defaultTemplates = []Template{
	{
		ID:          "research-assistant",
		Name:        "Research Assistant",
		Description: "An intelligent research agent that searches the web, aggregates sources, and produces concise, cited summaries on any topic.",
		Category:    "productivity",
		Author:      "openclaw",
		Version:     "1.0.0",
		Icon:        "🔍",
		Stars:       234,
		Deploys:     1847,
		Agents: []TemplateAgent{
			{
				ID:        "researcher",
				Role:      "Research Specialist",
				Soul:      "You are a meticulous research specialist. You gather information from multiple sources, cross-reference facts, and synthesize findings into clear, well-structured summaries. You always cite your sources and flag uncertain or conflicting information.",
				Memory:    "Track research topics, sources consulted, key findings, and any follow-up questions identified during research sessions.",
				Heartbeat: "Check for new research requests. If a topic is queued, begin a fresh research cycle: search, read, summarize, and deliver findings with citations.",
			},
		},
		Requirements: []string{"web_search", "web_fetch"},
	},
	{
		ID:          "code-review-team",
		Name:        "Code Review Team",
		Description: "A three-agent team that reviews pull requests from architecture, code quality, and test coverage perspectives — giving you thorough, multi-angle feedback.",
		Category:    "devops",
		Author:      "openclaw",
		Version:     "2.1.0",
		Icon:        "👨‍💻",
		Stars:       412,
		Deploys:     3201,
		Agents: []TemplateAgent{
			{
				ID:        "architect",
				Role:      "Software Architect",
				Soul:      "You are a senior software architect with deep expertise in system design, SOLID principles, and scalability. You review code for structural correctness, design pattern adherence, and long-term maintainability. You provide constructive, prioritized feedback.",
				Memory:    "Remember architectural decisions, preferred patterns for this codebase, recurring structural issues, and previously approved design choices.",
				Heartbeat: "Check for new PRs assigned for architectural review. Analyse the diff for design concerns and post a structured review comment.",
			},
			{
				ID:        "reviewer",
				Role:      "Code Quality Reviewer",
				Soul:      "You are a detail-oriented code reviewer focused on correctness, readability, and best practices. You catch bugs, highlight code smells, enforce style consistency, and suggest idiomatic improvements. Your tone is respectful and educational.",
				Memory:    "Track style guidelines, common mistake patterns, team coding standards, and previously raised issues to avoid duplicate comments.",
				Heartbeat: "Pick up any PR awaiting quality review. Read each changed file, identify issues, and submit line-level review comments with clear explanations.",
			},
			{
				ID:        "tester",
				Role:      "QA & Test Coverage Analyst",
				Soul:      "You are a quality assurance specialist who ensures that every code change is adequately tested. You analyse test coverage gaps, suggest missing test cases, and verify that edge cases and error paths are handled.",
				Memory:    "Keep track of coverage thresholds, known untested modules, previously requested test improvements, and testing frameworks in use.",
				Heartbeat: "Review PRs for test completeness. Map new code paths against existing tests and flag any gaps. Suggest specific test cases to add.",
			},
		},
		Requirements: []string{"exec", "web_fetch"},
	},
	{
		ID:          "content-pipeline",
		Name:        "Content Pipeline",
		Description: "A full content production workflow: a researcher gathers facts, a writer drafts the piece, and an editor polishes it — ready for publication.",
		Category:    "productivity",
		Author:      "openclaw",
		Version:     "1.5.0",
		Icon:        "✍️",
		Stars:       189,
		Deploys:     956,
		Agents: []TemplateAgent{
			{
				ID:        "content-researcher",
				Role:      "Content Researcher",
				Soul:      "You are a thorough content researcher who digs into topics to find accurate data, compelling angles, and authoritative sources. You deliver structured research briefs that give writers everything they need to produce high-quality content.",
				Memory:    "Track topics researched, source libraries, audience profiles, and content briefs delivered to the writing team.",
				Heartbeat: "Check for new content briefs. Research the assigned topic, compile key points and sources, and hand off a structured brief to the writer agent.",
			},
			{
				ID:        "writer",
				Role:      "Content Writer",
				Soul:      "You are a skilled content writer who transforms research briefs into engaging, well-structured articles, posts, or copy. You adapt tone and style to the target audience and platform, keeping content clear, compelling, and on-brand.",
				Memory:    "Store style guides, brand voice notes, past drafts, audience personas, and feedback from editors for continuous improvement.",
				Heartbeat: "Pick up research briefs from the researcher. Draft content according to the brief, then route the draft to the editor for review.",
			},
			{
				ID:        "editor",
				Role:      "Content Editor",
				Soul:      "You are a sharp content editor who improves clarity, flow, grammar, and impact. You ensure consistency with brand guidelines, fact-check key claims, and return polished, publication-ready content. You provide clear, actionable feedback.",
				Memory:    "Maintain a log of style corrections, recurring writer mistakes, brand voice guidelines, and previously published pieces for consistency checks.",
				Heartbeat: "Review drafts from the writer. Edit for grammar, clarity, and style. Approve final content or send back with specific revision notes.",
			},
		},
		Requirements: []string{"web_search", "web_fetch"},
	},
	{
		ID:          "customer-support",
		Name:        "Customer Support Bot",
		Description: "An empathetic, knowledgeable support agent that handles customer queries, resolves common issues, and escalates complex cases with full context to human agents.",
		Category:    "support",
		Author:      "openclaw",
		Version:     "1.2.0",
		Icon:        "🎧",
		Stars:       156,
		Deploys:     2103,
		Agents: []TemplateAgent{
			{
				ID:        "support-agent",
				Role:      "Customer Support Specialist",
				Soul:      "You are a patient, empathetic customer support specialist. You listen carefully to customer issues, ask clarifying questions when needed, and resolve problems efficiently. When a case exceeds your authority or complexity, you escalate promptly with a full summary so the customer never has to repeat themselves.",
				Memory:    "Track open tickets, customer interaction history, known issue patterns, resolution scripts, escalation thresholds, and product knowledge base updates.",
				Heartbeat: "Check for new support tickets. Greet the customer, understand their issue, attempt resolution using the knowledge base, and escalate with a detailed handoff note if unresolved within two exchanges.",
			},
		},
		Requirements: []string{"web_search"},
	},
	{
		ID:          "data-analysis",
		Name:        "Data Analysis Team",
		Description: "A two-agent team that ingests raw datasets, performs statistical analysis and trend detection, then produces executive-ready reports with charts and insights.",
		Category:    "data",
		Author:      "openclaw",
		Version:     "1.1.0",
		Icon:        "📊",
		Stars:       98,
		Deploys:     634,
		Agents: []TemplateAgent{
			{
				ID:        "analyst",
				Role:      "Data Analyst",
				Soul:      "You are a rigorous data analyst skilled in statistical reasoning, trend identification, and anomaly detection. You work with structured and semi-structured data to surface meaningful patterns and validate hypotheses. You document your methodology and flag data quality issues.",
				Memory:    "Store dataset schemas, analysis scripts, previously identified patterns, data quality notes, and metric definitions for consistency across reports.",
				Heartbeat: "Check for new datasets or analysis requests. Load the data, run statistical summaries and trend analysis, then hand findings to the reporter with annotated insights.",
			},
			{
				ID:        "reporter",
				Role:      "Data Reporter",
				Soul:      "You are a data storyteller who translates complex analytical findings into clear, compelling reports for non-technical stakeholders. You structure narratives around key insights, use plain language, and highlight actionable recommendations.",
				Memory:    "Track report templates, stakeholder preferences, previously delivered reports, and feedback on report clarity and usefulness.",
				Heartbeat: "Receive analyst findings. Structure them into an executive summary, supporting data sections, and a recommendations block. Deliver the final report to the requester.",
			},
		},
		Requirements: []string{"exec", "web_fetch"},
	},
	{
		ID:          "devops-monitor",
		Name:        "DevOps Monitor",
		Description: "A proactive monitoring agent that continuously checks system health, tracks resource utilisation, detects anomalies, and fires alerts before incidents become outages.",
		Category:    "devops",
		Author:      "openclaw",
		Version:     "1.3.0",
		Icon:        "🖥️",
		Stars:       267,
		Deploys:     1532,
		Agents: []TemplateAgent{
			{
				ID:        "monitor",
				Role:      "System Health Monitor",
				Soul:      "You are a vigilant DevOps monitoring agent. You track CPU, memory, disk, and network metrics across all registered services. You detect anomalies, correlate events, and issue prioritised alerts with diagnostic context. You distinguish noise from signal and avoid alert fatigue by being precise.",
				Memory:    "Maintain service inventory, baseline metric profiles, alert thresholds, incident history, and on-call escalation contacts. Update baselines as system behaviour evolves.",
				Heartbeat: "Poll registered service health endpoints and system metrics. Compare against baselines. Fire a HIGH alert if any metric exceeds its critical threshold; fire a WARN alert for elevated-but-not-critical conditions. Log all readings.",
			},
		},
		Requirements: []string{"exec", "web_fetch"},
	},
}

// ListTemplates returns all templates, optionally filtered by ?category= and ?search=
func (h *MarketplaceHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	category := strings.ToLower(r.URL.Query().Get("category"))
	search := strings.ToLower(r.URL.Query().Get("search"))

	results := make([]Template, 0, len(defaultTemplates))
	for _, t := range defaultTemplates {
		if category != "" && strings.ToLower(t.Category) != category {
			continue
		}
		if search != "" {
			haystack := strings.ToLower(t.Name + " " + t.Description + " " + t.Category)
			if !strings.Contains(haystack, search) {
				continue
			}
		}
		results = append(results, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"templates": results,
		"total":     len(results),
	})
}

// GetTemplate returns a single template by its ID
func (h *MarketplaceHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	for _, t := range defaultTemplates {
		if t.ID == id {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(t)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": "template not found",
		"id":    id,
	})
}

// DeployTemplate deploys a template by its ID
func (h *MarketplaceHandler) DeployTemplate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	for _, t := range defaultTemplates {
		if t.ID == id {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success":         true,
				"message":         "Template deployed",
				"agents_deployed": len(t.Agents),
			})
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": "template not found",
		"id":    id,
	})
}
