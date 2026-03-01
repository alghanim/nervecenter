package main

import (
	_ "embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/alghanim/agentboard/backend/db"
	"github.com/alghanim/agentboard/backend/handlers"
	"github.com/alghanim/agentboard/backend/websocket"

	"github.com/gorilla/mux"
	ws "github.com/gorilla/websocket"
	"github.com/rs/cors"
)

//go:embed schema.sql
var schemaSQL string

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func main() {
	// Database configuration
	dbConfig := db.Config{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     getEnvInt("DB_PORT", 5432),
		User:     getEnv("DB_USER", "agentboard"),
		Password: getEnv("DB_PASSWORD", "agentboard"),
		DBName:   getEnv("DB_NAME", "agentboard"),
	}

	if err := db.Connect(dbConfig, schemaSQL); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Seed agents from config into DB (upsert — preserves existing status)
	if err := db.UpsertAgentsFromConfig(config.GetAgents()); err != nil {
		log.Printf("⚠️  Failed to seed agents from config: %v", err)
	}

	// WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Handlers
	taskHandler := &handlers.TaskHandler{Hub: hub}
	agentHandler := &handlers.AgentHandler{}
	commentHandler := &handlers.CommentHandler{Hub: hub}
	activityHandler := &handlers.ActivityHandler{}
	dashboardHandler := &handlers.DashboardHandler{}
	openclawHandler := &handlers.OpenClawHandler{}
	healthHandler := &handlers.HealthHandler{}
	analyticsHandler := &handlers.AnalyticsHandler{}
	brandingHandler := &handlers.BrandingHandler{}
	searchHandler := &handlers.SearchHandler{}
	performanceHandler := &handlers.PerformanceHandler{}
	reportHandler := &handlers.ReportHandler{}
	documentsHandler := &handlers.DocumentsHandler{}
	metricsHandler := &handlers.MetricsHandler{}
	errorsHandler := &handlers.ErrorsHandler{}
	logsHandler := &handlers.LogsHandler{}
	webhookHandler := &handlers.WebhookHandler{}
	controlHandler := &handlers.AgentControlHandler{}
	authHandler := &handlers.AuthHandler{}
	keyHandler := &handlers.APIKeyHandler{}
	templateHandler := &handlers.TemplateHandler{}
	notificationHandler := &handlers.NotificationHandler{}
	traceHandler := &handlers.TraceHandler{}
	dashboardsHandler := &handlers.DashboardsHandler{}
	commitsHandler := &handlers.CommitsHandler{}
	annotationHandler := &handlers.AnnotationHandler{}
	environmentHandler := &handlers.EnvironmentHandler{}
	costsHandler := &handlers.CostsHandler{}
	scorecardHandler := &handlers.ScorecardHandler{}

	// Agent status poller
	go handlers.StartAgentStatusPoller(hub)

	// Periodic agent re-sync from openclaw.json (every 5 minutes)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			log.Println("[sync] Periodic agent re-sync from openclaw.json...")
			if err := config.Reload(); err != nil {
				log.Printf("[sync] Config reload failed: %v", err)
				continue
			}
			if err := db.UpsertAgentsFromConfig(config.GetAgents()); err != nil {
				log.Printf("[sync] DB upsert failed: %v", err)
			}
		}
	}()

	// Alert evaluator
	go handlers.StartAlertEvaluator(hub)

	// Health checker
	go handlers.StartHealthChecker()

	// Router
	router := mux.NewRouter()
	api := router.PathPrefix("/api").Subrouter()
	api.Use(handlers.RequireAuth)

	// Auth routes (public — no auth middleware needed, but RequireAuth allows GETs and login skips check anyway)
	api.HandleFunc("/auth/login", authHandler.Login).Methods("POST")
	api.HandleFunc("/auth/logout", authHandler.Logout).Methods("POST")
	api.HandleFunc("/auth/me", authHandler.Me).Methods("GET")

	// Task routes  — static route MUST come before parameterised {id} route
	api.HandleFunc("/tasks", taskHandler.GetTasks).Methods("GET")
	api.HandleFunc("/tasks", taskHandler.CreateTask).Methods("POST")
	api.HandleFunc("/tasks/mine", taskHandler.GetMyTasks).Methods("GET")
	api.HandleFunc("/tasks/stuck", taskHandler.GetStuckTasks).Methods("GET")
	api.HandleFunc("/tasks/graph", handlers.GetTaskDAG).Methods("GET")
	api.HandleFunc("/tasks/{id}", taskHandler.GetTask).Methods("GET")
	api.HandleFunc("/tasks/{id}", taskHandler.UpdateTask).Methods("PUT")
	api.HandleFunc("/tasks/{id}", taskHandler.DeleteTask).Methods("DELETE")
	api.HandleFunc("/tasks/{id}/assign", taskHandler.AssignTask).Methods("POST")
	api.HandleFunc("/tasks/{id}/transition", taskHandler.TransitionTask).Methods("POST")
	api.HandleFunc("/tasks/{id}/history", taskHandler.GetTaskHistory).Methods("GET")

	// Comment routes
	api.HandleFunc("/tasks/{task_id}/comments", commentHandler.GetComments).Methods("GET")
	api.HandleFunc("/tasks/{task_id}/comments", commentHandler.CreateComment).Methods("POST")
	api.HandleFunc("/comments/{id}", commentHandler.DeleteComment).Methods("DELETE")

	// Agent DB routes
	api.HandleFunc("/agents", agentHandler.GetAgents).Methods("GET")
	api.HandleFunc("/agents/compare", handlers.CompareAgents).Methods("GET")
	api.HandleFunc("/agents/{id}", agentHandler.GetAgent).Methods("GET")
	api.HandleFunc("/agents/{id}/activity", agentHandler.GetAgentActivity).Methods("GET")
	api.HandleFunc("/agents/{id}/metrics", agentHandler.GetAgentMetrics).Methods("GET")
	api.HandleFunc("/agents/{id}/status", agentHandler.UpdateAgentStatus).Methods("PUT")
	api.HandleFunc("/agents/{id}/pause", agentHandler.PauseAgent).Methods("POST")
	api.HandleFunc("/agents/{id}/resume", agentHandler.ResumeAgent).Methods("POST")
	api.HandleFunc("/agents/{id}/kill", agentHandler.KillAgent).Methods("POST")

	// Agent health checks
	api.HandleFunc("/agents/{id}/health", healthHandler.GetAgentHealth).Methods("GET")
	api.HandleFunc("/agents/{id}/health/check", healthHandler.ForceHealthCheck).Methods("POST")
	api.HandleFunc("/agents/{id}/health/auto-restart", healthHandler.SetAutoRestart).Methods("POST")

	// Git commits
	api.HandleFunc("/agents/{id}/commits", commitsHandler.GetCommits).Methods("GET")

	// Annotations (shared notes on agents)
	api.HandleFunc("/agents/{id}/annotations", annotationHandler.GetAnnotations).Methods("GET")
	api.HandleFunc("/agents/{id}/annotations", annotationHandler.CreateAnnotation).Methods("POST")
	api.HandleFunc("/agents/{id}/annotations/{ann_id}", annotationHandler.DeleteAnnotation).Methods("DELETE")

	// Environments
	api.HandleFunc("/environments", environmentHandler.GetEnvironments).Methods("GET")
	api.HandleFunc("/environments", environmentHandler.AddEnvironment).Methods("POST")
	api.HandleFunc("/environments", environmentHandler.DeleteEnvironment).Methods("DELETE")
	api.HandleFunc("/environments/switch", environmentHandler.SwitchEnvironment).Methods("POST")

	// Webhooks
	api.HandleFunc("/webhooks", webhookHandler.ListWebhooks).Methods("GET")
	api.HandleFunc("/webhooks", webhookHandler.CreateWebhook).Methods("POST")
	api.HandleFunc("/webhooks/{id}", webhookHandler.UpdateWebhook).Methods("PUT")
	api.HandleFunc("/webhooks/{id}", webhookHandler.DeleteWebhook).Methods("DELETE")
	api.HandleFunc("/webhooks/{id}/test", webhookHandler.TestWebhook).Methods("POST")

	// Soul endpoint — reads live workspace files
	api.HandleFunc("/agents/{id}/soul", openclawHandler.GetAgentSoul).Methods("GET")
	api.HandleFunc("/agents/{id}/soul", openclawHandler.UpdateAgentSoul).Methods("PUT")

	// Snapshots
	api.HandleFunc("/agents/{id}/snapshots", handlers.GetSnapshots).Methods("GET")
	api.HandleFunc("/agents/{id}/snapshots", handlers.CreateSnapshot).Methods("POST")
	api.HandleFunc("/agents/{id}/snapshots/{snapshot_id}/restore", handlers.RestoreSnapshot).Methods("POST")

	// Timeline endpoint — agent's action history
	api.HandleFunc("/agents/{id}/timeline", openclawHandler.GetAgentTimeline).Methods("GET")

	// Skills endpoint — reads global + agent-specific skills
	api.HandleFunc("/agents/{id}/skills", openclawHandler.GetAgentSkills).Methods("GET")

	// Activity
	api.HandleFunc("/activity", activityHandler.GetActivity).Methods("GET")

	// Dashboard
	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/teams", dashboardHandler.GetTeamStats).Methods("GET")

	// Custom Dashboards (builder)
	api.HandleFunc("/dashboards", dashboardsHandler.ListDashboards).Methods("GET")
	api.HandleFunc("/dashboards", dashboardsHandler.CreateDashboard).Methods("POST")
	api.HandleFunc("/dashboards/{id}", dashboardsHandler.GetDashboard).Methods("GET")
	api.HandleFunc("/dashboards/{id}", dashboardsHandler.UpdateDashboard).Methods("PUT")
	api.HandleFunc("/dashboards/{id}", dashboardsHandler.DeleteDashboard).Methods("DELETE")

	// OpenClaw live data
	api.HandleFunc("/openclaw/agents", openclawHandler.GetAgents).Methods("GET")
	api.HandleFunc("/openclaw/agents/{name}", openclawHandler.GetAgent).Methods("GET")
	api.HandleFunc("/openclaw/stream", openclawHandler.GetStream).Methods("GET")
	api.HandleFunc("/openclaw/stats", openclawHandler.GetStats).Methods("GET")

	// Branding
	api.HandleFunc("/branding", brandingHandler.GetBranding).Methods("GET")

	// Analytics
	api.HandleFunc("/analytics/overview", analyticsHandler.GetOverview).Methods("GET")
	api.HandleFunc("/analytics/agents", analyticsHandler.GetAgentAnalytics).Methods("GET")
	api.HandleFunc("/analytics/throughput", analyticsHandler.GetThroughput).Methods("GET")
	api.HandleFunc("/analytics/team", analyticsHandler.GetTeamAnalytics).Methods("GET")
	api.HandleFunc("/analytics/export/csv", analyticsHandler.ExportCSV).Methods("GET")
	api.HandleFunc("/analytics/tokens", analyticsHandler.GetTokens).Methods("GET")
	api.HandleFunc("/analytics/tokens/timeline", analyticsHandler.GetTokensTimeline).Methods("GET")
	api.HandleFunc("/analytics/cost/summary", analyticsHandler.GetCostSummary).Methods("GET")
	api.HandleFunc("/analytics/tokens/by-agent", analyticsHandler.GetTokensByAgent).Methods("GET")
	api.HandleFunc("/analytics/performance", performanceHandler.GetPerformance).Methods("GET")

	// Cost tracking
	api.HandleFunc("/costs", costsHandler.IngestCost).Methods("POST")
	api.HandleFunc("/costs/summary", costsHandler.GetCostSummary).Methods("GET")
	api.HandleFunc("/costs/breakdown", costsHandler.GetCostBreakdown).Methods("GET")
	api.HandleFunc("/costs/burn-rate", costsHandler.GetBurnRate).Methods("GET")
	api.HandleFunc("/costs/per-task", costsHandler.GetCostPerTask).Methods("GET")
	api.HandleFunc("/costs/by-model", costsHandler.GetCostByModel).Methods("GET")

	// Agent scorecards
	api.HandleFunc("/agents/{id}/scorecard", scorecardHandler.GetScorecard).Methods("GET")
	api.HandleFunc("/agents/{id}/performance/timeline", scorecardHandler.GetPerformanceTimeline).Methods("GET")

		api.HandleFunc("/analytics/cycle-time", analyticsHandler.GetCycleTime).Methods("GET")
	api.HandleFunc("/analytics/active-agents", analyticsHandler.GetActiveAgents).Methods("GET")
	api.HandleFunc("/analytics/dashboard-summary", analyticsHandler.GetDashboardSummary).Methods("GET")

	// Analytics trends & ranking
	api.HandleFunc("/analytics/trends", analyticsHandler.GetTrends).Methods("GET")
	api.HandleFunc("/analytics/agents/ranking", analyticsHandler.GetAgentRanking).Methods("GET")

	// Reports
	api.HandleFunc("/report", reportHandler.GetReport).Methods("GET")
	api.HandleFunc("/report/html", reportHandler.GetReportHTML).Methods("GET")
	api.HandleFunc("/report/markdown", reportHandler.GetReportMarkdown).Methods("GET")

	// Metrics
	api.HandleFunc("/metrics/latency", metricsHandler.GetLatencyMetrics).Methods("GET")
	api.HandleFunc("/metrics/cost-forecast", metricsHandler.GetCostForecast).Methods("GET")
	api.HandleFunc("/metrics/efficiency", metricsHandler.GetEfficiencyScores).Methods("GET")

	// Documents
	api.HandleFunc("/documents", documentsHandler.ListDocuments).Methods("GET")
	api.HandleFunc("/documents/content", documentsHandler.GetDocumentContent).Methods("GET")

	// Agent control (pause/resume/kill)
	api.HandleFunc("/agents/{id}/kill", controlHandler.Kill).Methods("POST")
	api.HandleFunc("/agents/{id}/pause", controlHandler.Pause).Methods("POST")
	api.HandleFunc("/agents/{id}/resume", controlHandler.Resume).Methods("POST")

	// API Keys
	api.HandleFunc("/keys", keyHandler.ListKeys).Methods("GET")
	api.HandleFunc("/keys", keyHandler.CreateKey).Methods("POST")
	api.HandleFunc("/keys/{id}", keyHandler.DeleteKey).Methods("DELETE")

	// Templates
	api.HandleFunc("/templates", templateHandler.ListTemplates).Methods("GET")
	api.HandleFunc("/templates", templateHandler.CreateTemplate).Methods("POST")
	api.HandleFunc("/templates/{id}", templateHandler.GetTemplate).Methods("GET")
	api.HandleFunc("/templates/{id}", templateHandler.UpdateTemplate).Methods("PUT")
	api.HandleFunc("/templates/{id}", templateHandler.DeleteTemplate).Methods("DELETE")
	api.HandleFunc("/templates/{id}/instantiate", templateHandler.InstantiateTemplate).Methods("POST")

	// Notifications
	api.HandleFunc("/notifications", notificationHandler.ListNotifications).Methods("GET")
	api.HandleFunc("/notifications", notificationHandler.CreateNotification).Methods("POST")
	api.HandleFunc("/notifications/read-all", notificationHandler.MarkAllRead).Methods("POST")
	api.HandleFunc("/notifications/unread-count", notificationHandler.UnreadCount).Methods("GET")
	api.HandleFunc("/notifications/{id}/read", notificationHandler.MarkRead).Methods("PUT")
	api.HandleFunc("/notifications/{id}", notificationHandler.DeleteNotification).Methods("DELETE")

	// Agent Traces
	api.HandleFunc("/traces", traceHandler.IngestTrace).Methods("POST")
	api.HandleFunc("/traces/batch", traceHandler.BatchIngestTraces).Methods("POST")
	api.HandleFunc("/traces/{id}", traceHandler.DeleteTrace).Methods("DELETE")
	api.HandleFunc("/tasks/{id}/traces", traceHandler.GetTaskTraces).Methods("GET")
	api.HandleFunc("/agents/{id}/traces", traceHandler.GetAgentTraces).Methods("GET")

	// API Docs
	api.HandleFunc("/docs", handlers.GetAPIDocs).Methods("GET")

	// Global search
	api.HandleFunc("/search", searchHandler.Search).Methods("GET")

	// Errors & Failures dashboard
	api.HandleFunc("/errors", errorsHandler.GetErrors).Methods("GET")
	api.HandleFunc("/errors/summary", errorsHandler.GetErrorsSummary).Methods("GET")

	// Logs viewer
	api.HandleFunc("/logs/files", logsHandler.GetLogFiles).Methods("GET")
	api.HandleFunc("/logs/search", logsHandler.SearchLogs).Methods("GET")
	api.HandleFunc("/logs", logsHandler.GetLogs).Methods("GET")

	// Structure (hierarchy from config)
	api.HandleFunc("/structure", openclawHandler.GetStructure).Methods("GET")

	// Alert Rules Engine
	api.HandleFunc("/alerts/rules", handlers.GetAlertRules).Methods("GET")
	api.HandleFunc("/alerts/rules", handlers.CreateAlertRule).Methods("POST")
	api.HandleFunc("/alerts/rules/{id}", handlers.UpdateAlertRule).Methods("PUT")
	api.HandleFunc("/alerts/rules/{id}", handlers.DeleteAlertRule).Methods("DELETE")
	api.HandleFunc("/alerts/history", handlers.GetAlertHistory).Methods("GET")
	api.HandleFunc("/alerts/history/{id}/acknowledge", handlers.AcknowledgeAlert).Methods("POST")
	api.HandleFunc("/alerts/unacknowledged-count", handlers.GetAlertUnacknowledgedCount).Methods("GET")

	// Audit Log
	api.HandleFunc("/audit", handlers.GetAuditLog).Methods("GET")

	// Dependency Graph
	api.HandleFunc("/graph/dependencies", handlers.GetDependencyGraph).Methods("GET")

	// Phase 2: Git Integrations
	api.HandleFunc("/integrations/git", handlers.GetGitIntegrations).Methods("GET")
	api.HandleFunc("/integrations/git", handlers.CreateGitIntegration).Methods("POST")
	api.HandleFunc("/integrations/git/{id}", handlers.DeleteGitIntegration).Methods("DELETE")
	api.HandleFunc("/tasks/{id}/prs", handlers.GetTaskPRs).Methods("GET")
	api.HandleFunc("/webhooks/github", handlers.GitHubWebhookHandler).Methods("POST")

	// Phase 2: Task Dependencies (DAGs)
	api.HandleFunc("/tasks/{id}/dependencies", handlers.GetTaskDependencies).Methods("GET")
	api.HandleFunc("/tasks/{id}/dependencies", handlers.UpdateTaskDependencies).Methods("PUT")

	// Phase 2: Incidents
	api.HandleFunc("/incidents", handlers.GetIncidents).Methods("GET")
	api.HandleFunc("/incidents", handlers.CreateIncident).Methods("POST")
	api.HandleFunc("/incidents/{id}", handlers.GetIncident).Methods("GET")
	api.HandleFunc("/incidents/{id}", handlers.UpdateIncident).Methods("PUT")
	api.HandleFunc("/incidents/auto-create", handlers.AutoCreateIncident).Methods("POST")

	// Phase 2: Agent Comparison

	// Phase 2: Evaluations
	api.HandleFunc("/evaluations/bulk", handlers.BulkCreateEvaluations).Methods("POST")
	api.HandleFunc("/evaluations/criteria-breakdown", handlers.GetCriteriaBreakdown).Methods("GET")
	api.HandleFunc("/evaluations", handlers.CreateEvaluation).Methods("POST")
	api.HandleFunc("/tasks/{id}/evaluations", handlers.GetTaskEvaluations).Methods("GET")
	api.HandleFunc("/agents/{id}/quality", handlers.GetAgentQuality).Methods("GET")

	// Phase 2: Playground
	api.HandleFunc("/agents/{id}/message", handlers.SendAgentMessage).Methods("POST")

	// Marketplace
	marketplaceHandler := &handlers.MarketplaceHandler{}
	api.HandleFunc("/marketplace/templates", marketplaceHandler.ListTemplates).Methods("GET")
	api.HandleFunc("/marketplace/templates/{id}", marketplaceHandler.GetTemplate).Methods("GET")
	api.HandleFunc("/marketplace/templates/{id}/deploy", marketplaceHandler.DeployTemplate).Methods("POST")

	// WebSocket
	router.HandleFunc("/ws/stream", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		client := &websocket.Client{
			ID:            fmt.Sprintf("client-%d", time.Now().UnixNano()),
			Hub:           hub,
			Conn:          conn,
			Send:          make(chan []byte, 256),
			Subscriptions: make(map[string]bool),
		}
		hub.RegisterClient(client)
		go client.WritePump()
		go client.ReadPump()
	})

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Static frontend
	frontendDir := getEnv("FRONTEND_DIR", "../frontend")
	router.PathPrefix("/").Handler(http.FileServer(http.Dir(frontendDir)))

	// CORS
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	port := getEnv("PORT", "8891")
	addr := fmt.Sprintf(":%s", port)

	log.Printf("🚀 AgentBoard API starting on http://localhost:%s", port)
	log.Printf("📊 Dashboard:  http://localhost:%s/api/dashboard/stats", port)
	log.Printf("🌳 Structure:  http://localhost:%s/api/structure", port)
	log.Printf("🔌 WebSocket:  ws://localhost:%s/ws/stream", port)

	server := &http.Server{
		Addr:         addr,
		Handler:      corsHandler.Handler(router),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if v, err := strconv.Atoi(value); err == nil {
			return v
		}
	}
	return defaultValue
}
