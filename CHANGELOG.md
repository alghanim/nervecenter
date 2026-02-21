# Changelog

All notable changes to AgentBoard are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

See [ROADMAP.md](./ROADMAP.md) for what's coming next.

---

## [0.5.0] — 2026-02-22

### 🚀 Full Platform Launch — AgentBoard Becomes Mission Control

A massive feature expansion shipping tonight. AgentBoard is no longer an internal monitoring tool — it's a full-featured operations platform for running AI agent teams.

#### Added

**Monitoring**
- **Dependency Graph** — D3 force-directed graph of agent relationships, team-colored nodes, drag/zoom/click navigation
- **Timeline View** — per-agent chronological event history, color-coded by event type (transitions, errors, heartbeats, comments)
- **Error Dashboard** — dedicated error feed with type badges, severity levels, and auto-refresh
- **Activity Feed** — per-agent activity stream with git commit integration

**Control**
- **Agent Lifecycle Controls** — pause, resume, and kill running agent sessions from the UI
- **Health Checks & Auto-Restart** — configurable health monitoring with automatic failure recovery
- **Bulk Operations** — batch pause/resume/kill across multiple selected agents

**Intelligence**
- **Memory & Soul Editor** — read AND edit `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md`, `AGENTS.md` directly in the dashboard
- **Config Snapshots & Rollback** — automatic pre-edit snapshots, one-click restore to any previous version
- **Log Viewer** — full-text search across all agent JSONL logs, filter by agent/level/time, highlighted results
- **Documents Viewer** — browse and render markdown, images, and PDFs from agent workspaces

**Analytics**
- **Analytics & Reports** — weekly executive summary, per-agent efficiency scores, task latency metrics, cost forecasting
- **Token & Cost Tracking** — real-time and cumulative token usage per agent with monthly spend projection
- **Interactive Charts** — visual analytics panels for throughput, errors, and cost over time

**Collaboration**
- **Annotations & Notes** — leave markdown-rendered notes on any agent; stored persistently
- **Audit Log** — immutable record of all human actions (who edited what, when, before/after values)
- **Multi-Environment Support** — switch between local, staging, and production AgentBoard instances from one UI

**Developer Tools**
- **Alerting Rules** — configurable rules for no-heartbeat, task-stuck, and error-rate conditions
- **Webhook System** — HMAC-signed delivery to Slack, Telegram, or custom URLs; 6 event types; built-in test button
- **Authentication** — JWT login with write-endpoint protection
- **API Documentation** — built-in `/api/docs` reference for all 76 endpoints

**Documentation**
- **README rewrite** — complete product-grade README by Quill; reflects the full current feature set

---

## [0.4.0] — 2026-02-22

### ✨ Professional Redesign v2.0 — by Prism

Commits: `bc77281`, `d0734b7`

A complete visual overhaul bringing AgentBoard to a polished, production-ready standard.

#### Added
- **Dark theme** — sleek dark-mode-first UI with cohesive color palette
- **Design token system** — CSS custom properties for consistent theming across all components
- **SVG icon set** — crisp, scalable icons replacing emoji and text labels
- **AgentBoard logomark** — official brand mark integrated into the header
- **Activity timeline** — visual chronological view of recent agent activity
- **Theme toggle** — user-switchable light/dark mode, preference persisted locally

#### Changed
- **Kanban board overhaul** — redesigned columns, cards, and drag interactions for clarity and performance
- **Variable naming** — replaced deprecated `--text-muted` and `--status-error` with updated token names (`d0734b7`)

---

## [0.3.0] — 2026-02-22

### 🐛 Bug Fixes & Stability

Commits: `327ec98`, `d6d3a77`

#### Fixed
- **Agent count** — agent list now correctly displays all 19 official team agents (`d6d3a77`)
- **Sidebar toggle** — navigation collapse button always visible regardless of scroll position
- **Memory loading** — aliased agents (e.g. `quill`, `prism`) now load memory files correctly
- **Activity feed filter** — 48-hour lookback window applied consistently; stale entries no longer surface
- **Timestamp parsing** — ISO 8601 and relative timestamp formats both handled without errors

---

## [0.2.0] — 2026-02-22

### 📚 Documentation — by Quill

Commit: `c2556de`

#### Added
- **Kanban integration guide** in `README.md` — step-by-step instructions for agent developers on how to interact with the kanban API: claim tasks, post comments, transition status, and coordinate with other agents

---

## [0.1.0] — Earlier

### 🚀 Initial Release

- Core dashboard: agent list, status indicators, memory viewer
- Kanban board: task creation, assignment, status transitions
- Global search (`Cmd+K` modal)
- Agent performance cards
- Activity feed

---

[Unreleased]: https://github.com/alghanim/agentboard/compare/HEAD...HEAD
[0.4.0]: https://github.com/alghanim/agentboard/compare/327ec98...d0734b7
[0.3.0]: https://github.com/alghanim/agentboard/compare/c2556de...327ec98
[0.2.0]: https://github.com/alghanim/agentboard/compare/807e58b...c2556de
