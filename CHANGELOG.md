# Changelog

## [2026-03-05] No Changes

- No feature commits in last 25 hours
- README verified current (comprehensive: architecture, 70+ API endpoints, FAQ, Quick Start)

## [2026-03-04] No Changes

- No feature commits in last 25 hours
- README verified current (422 lines, all sections complete)

## [2026-03-03] README Rewrite

- Complete README rewrite: added architecture diagram, comprehensive Quick Start with agents.yaml walkthrough, full API reference (70+ endpoints in clean table format), agent-kanban integration examples, configuration reference, FAQ section, contributing guidelines
- No feature commits in last 25 hours

## [2026-03-02] No Changes

- No code changes in last 25 hours. README verified current.

## [2026-03-01] Documentation

- Complete README rewrite: added full API reference (70+ endpoints), architecture diagram, FAQ, Quick Start, agents.yaml guide, agent-kanban integration examples
- No feature commits in last 25 hours


All notable changes to AgentBoard are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2026-02-28] No Code Changes

No commits in the last 25 hours. Documentation and README maintained.

---

## [Unreleased]

See [ROADMAP.md](./ROADMAP.md) for what's coming next.

---

## [No Changes] — 2026-02-27 (Quill daily check)

**Checked by Quill ✍️ at 2:00 AM AST (Qatar)**

No commits to `alghanim/agentboard` in the past 25 hours. Codebase unchanged.

*Next check: 2026-02-28 at 2:00 AM.*

---

## [No Changes] — 2026-02-26 (Quill daily check)

No commits in the last 25 hours. AgentBoard codebase unchanged.

---

## [No Changes] — 2026-02-25 (Quill daily check)

**Checked by Quill ✍️ at 2:00 AM AST (Qatar)**

No commits to `alghanim/agentboard` in the past 25 hours. README and documentation are current. No updates required.

*Next check: 2026-02-26 at 2:00 AM.*

---

## [0.5.2] — 2026-02-23

### 🎨 NerveCenter — Full UI Redesign

AgentBoard has been rebranded and visually overhauled as **NerveCenter** — a premium-grade operations center aesthetic. Repository moved to `alghanim/nervecenter`.

#### Added

- **NerveCenter premium theme** (`0f58373`, `2a61069`) — Full UI redesign with a new CSS variable system. Light/dark mode toggle with `localStorage` persistence. New `variables.css` defines the complete design token set; `animations.css` ships subtle motion (fade-in, slide-in, pulse). The sidebar, agent cards, and navigation all reflect the NerveCenter visual language.
- **Custom Dashboard Builder** (`b5b7304`) — Drag-and-drop widget grid builder. Users can create multiple named dashboards, add/remove/reposition widgets from a library, and set a default view. Widget types: `agent-status`, `task-summary`, `activity-feed`, `cost-overview`, `error-feed`, `git-commits`, `latency-chart`. Layout stored in `~/.openclaw/agentboard-dashboards.json`. Auto-refreshes every 30 seconds. Full CRUD API (`GET/POST /api/dashboards`, `GET/PUT/DELETE /api/dashboards/{id}`).
- **Agent Marketplace** (`b5b7304`) — Browse and deploy pre-built agent templates. 8+ built-in templates with roles, souls, memory seeds, and heartbeat instructions. One-click `POST /api/marketplace/templates/{id}/deploy` scaffolds the agent into the workspace. Templates carry versioning, category tags, star ratings, and deploy counts. Endpoints: `GET /api/marketplace/templates`, `GET /api/marketplace/templates/{id}`, `POST /api/marketplace/templates/{id}/deploy`.

#### Fixed

- **Particle animation removed** (`9ae1056`) — Background particle animation removed from My Dashboard for cleaner, less distracting UI. My Dashboard layout redesigned.
- **Webhook docs** (`9ae1056`) — Webhook settings page now includes inline documentation for event types and HMAC signing.
- **Thunder root node in org chart** (`919f90b`) — Thunder (main) correctly appears as the root node in the agent org chart view.
- **Thunder model + always-online status** (`ad3b311`) — Thunder's model label correct; status transitions respect the always-online designation.
- **Thunder activity dot + Discovered team labels** (`1aa9e24`) — Activity indicator for Thunder resolved; agents in the "Discovered" category now display proper team labels.
- **Health check accuracy** (`dab4fa7`) — `GET /api/health` uses JSONL session file mtimes for `last-seen`; survives restarts.
- **Health check status consistency** (`ae59211`) — Activity log is authoritative for status transitions.
- **Workspace path resolution** (`6b02237`) — Thunder (main) and aliased agent IDs resolve correctly in the file editor and memory viewer.

### Documentation

- `README.md` — Marketplace and Dashboard Builder promoted from "Coming Soon" to Features. NerveCenter branding noted.
- Quill daily run complete: all commits in last 25 hours documented.

### Status — 2026-02-23 12:09 PM (Quill noon check)

- README roadmap section updated: Marketplace and Custom Dashboard Builder moved from v2.0 future to v0.5.2 ✅ (they shipped).
- No new source commits since yesterday's Quill run. All documentation current.

---

## [0.5.1] — 2026-02-22 (post-release patches)

### Fixed

- **Roster completeness** — Thunder (`main`) agent was missing from `agents.yaml`; now shows 19 agents total in the sidebar (`1d23b0d`)
- **Sentinel code review** — three correctness fixes applied (`86056b1`):
  - `updated_at` and `completed_at` now updated atomically in the same query (no TOCTOU gap)
  - Agent `status` field validated against allowed values before DB write
  - Added `idx_tasks_completed_at` index for completed-task queries

### Chore

- **`agents.yaml` tracked in git** — file removed from `.gitignore` so team-wide agent roster changes are versioned (`8a47353`)

### Documentation

- Quill daily run: all changes from last 25 hours confirmed documented; README and CHANGELOG verified current as of 2:00 AM AST.

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
