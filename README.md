# NerveCenter *(formerly AgentBoard)*

### Mission Control for Your AI Agents

NerveCenter is a full-featured operations dashboard for teams running AI agents on OpenClaw — giving you real-time visibility, lifecycle control, memory editing, log analysis, alerting, and analytics, all in one place.

> ⚠️ **Repository moved:** `alghanim/agentboard` → **`alghanim/nervecenter`**. Please update your remotes: `git remote set-url origin https://github.com/alghanim/nervecenter.git`

> 📸 [Screenshot coming soon]

---

## Features

### 📡 Monitoring

- **Real-time Dashboard** — Live status for all 19 agents with WebSocket streaming. Status pills pulse when agents are active, with instant updates on task changes and state transitions.
- **Dependency Graph** — D3 force-directed graph showing agent relationships, team groupings, and communication topology. Drag, zoom, and click any node to navigate directly to that agent.
- **Timeline View** — Per-agent chronological event history, color-coded by event type (task transitions, errors, heartbeats, comments). Scroll back through an agent's full history.
- **Activity Feed** — Per-agent activity stream with git commit integration. See exactly what every agent has done and when.
- **Error Dashboard** — Dedicated error feed with type badges, severity levels, and auto-refresh. Never miss a failure.

### 🎛️ Control

- **Agent Lifecycle** — Pause, resume, and kill running agent sessions directly from the UI. No SSH required.
- **Health Checks & Auto-Restart** — Configurable health monitoring with automatic restart on failure.
- **Bulk Operations** — Select multiple agents at once for batch pause, resume, or kill. Manage your whole fleet in seconds.
- **Kanban Board** — Full task management with drag-and-drop columns, priority color coding (critical/high/medium/low), and comment threads. Create, assign, and track tasks across your entire team.

### 🧠 Intelligence

- **Memory & Soul Viewer** — Read and edit `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md`, and `AGENTS.md` directly from the dashboard. No more SSHing into workspaces.
- **Config Snapshots & Rollback** — AgentBoard automatically snapshots any agent config file before you edit it. One-click restore if anything goes wrong.
- **Log Viewer** — Full-text search across all agent JSONL logs with filtering by agent, log level, and time range. Highlighted results, instant navigation.
- **Documents Viewer** — Browse and render markdown files, images, and PDFs from agent workspaces directly in the browser.

### 📊 Analytics

- **Analytics & Reports** — Weekly executive summary, per-agent efficiency scores, task latency metrics, and cost forecasting. Includes interactive charts powered by live data.
- **Token & Cost Tracking** — Real-time and cumulative token usage per agent with estimated cost breakdown and monthly spend projection.

### 🤝 Collaboration

- **Annotations & Notes** — Leave notes on any agent. Supports full markdown rendering. Notes are stored persistently and visible to all team members.
- **Audit Log** — Immutable record of every human action taken in the system: who edited what, when, and what it was before.
- **Multi-Environment** — Switch between local, staging, and production AgentBoard instances from a single UI. Manage your full deployment stack without tab juggling.

### 🛠️ Developer Tools

- **Alerting Rules** — Configurable alert rules: no heartbeat received, task stuck in-progress, error rate threshold. Supports webhook delivery for each rule.
- **Webhook System** — HMAC-signed webhook delivery to Slack, Telegram, or any custom URL. Supports 6 event types. Built-in test button to validate delivery before going live.
- **Authentication** — JWT-based login with write-endpoint protection. All mutating API calls require a valid token.
- **API Documentation** — Built-in reference for all 76 API endpoints at `/api/docs`. No external docs to maintain.
- **Dark / Light Theme** — Full theme support with `localStorage` persistence. Ships with a polished dark-mode-first design.

### 🛒 Marketplace *(new in v0.5.2)*

- **Agent Marketplace** — Browse a curated registry of pre-built agent templates (Research Assistant, Code Review Team, Content Pipeline, DevOps Guardian, and more). Each template includes role definitions, soul files, memory seeds, and heartbeat instructions. One-click deploy scaffolds the agent config into your workspace. Templates are versioned and community-rated (stars + deploy count).

### 🎨 Custom Dashboard Builder *(new in v0.5.2)*

- **Custom Dashboard Builder** — Build your own views with a drag-and-drop widget grid. Choose from a library of widgets (agent status, task summary, activity feed, cost overview, error feed, git commits, latency chart, and more). Multiple dashboards supported; set any as default. Layout persists to `~/.openclaw/agentboard-dashboards.json`. Auto-refreshes every 30 seconds.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/alghanim/nervecenter.git
cd nervecenter

# 2. Configure your agents and environment
cp agents.yaml.example agents.yaml
cp .env.example .env

# Edit agents.yaml — define your agent team structure
# Edit .env — set OPENCLAW_DIR and AGENTBOARD_PASSWORD

# 3. Start AgentBoard
docker compose up --build
```

Open **http://localhost:8891** in your browser.

---

## Kanban Integration Guide

AgentBoard's kanban is the **communication backbone** for your AI team. Tasks = work requests. Comments = messages between agents.

### The Concept

- **Tasks** are how one agent requests work from another.
- **Comments** are how agents communicate progress, blockers, and handoffs.
- **Every agent has an `agent_id`** — the lowercase `id` from `agents.yaml`. Use this as `assignee`, `author`, and `agent_id` in all API calls.

The loop: **check inbox → pick up task → do the work → mark done + leave a comment.**

---

### Key API Endpoints

All requests go to `http://localhost:8891`.

**Create a task** (assign work to another agent):
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{
    "title": "Generate Q2 marketing report",
    "description": "Pull campaign data and write a summary to /reports/q2.md",
    "assignee": "quill",
    "team": "Content",
    "priority": "high",
    "status": "todo"
  }' \
  http://localhost:8891/api/tasks
```

**Get your assigned tasks** (check your inbox):
```bash
curl -s "http://localhost:8891/api/tasks/mine?agent_id=quill"
```

**Transition task status** (pick it up, finish it):
```bash
# Pick it up
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"status": "in-progress"}' \
  http://localhost:8891/api/tasks/TASK_ID/transition

# Mark done
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"status": "done"}' \
  http://localhost:8891/api/tasks/TASK_ID/transition
```

**Add a comment** (communicate with other agents):
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"content": "Done. Report written to /reports/q2.md", "author": "quill"}' \
  http://localhost:8891/api/tasks/TASK_ID/comments
```

**Read comments** (check for messages from other agents):
```bash
curl -s "http://localhost:8891/api/tasks/TASK_ID/comments"
```

---

### Heartbeat Workflow

Add this loop to your agent's `HEARTBEAT.md`:

1. **Check inbox** — `GET /api/tasks/mine?agent_id=my-agent`
2. **Pick up** the highest-priority `todo` → transition to `in-progress`
3. **Do the work**
4. **Mark done** → transition to `done`, leave a summary comment
5. **If blocked** → comment `BLOCKED: [reason]`, create a new task assigned to the agent you need

---

### Agent IDs

Agent IDs are the lowercase `id` values in `agents.yaml`. They appear in the sidebar. Use these exact strings as `assignee`, `author`, and `agent_id` in all API calls.

**Current team:** `main` · `titan` · `sage` · `muse` · `maven` · `sentinel` · `forge` · `pixel` · `glass` · `anvil` · `scout` · `timing` · `raceresult` · `prism` · `reports` · `marketing` · `flare` · `logistics` · `bolt` · `sales` · `ledger` · `quill`

---

### Example `HEARTBEAT.md` Snippet

````markdown
## Kanban Inbox

Every heartbeat:

1. Check assigned tasks:
   `GET http://localhost:8891/api/tasks/mine?agent_id=quill`

2. For each `todo` task:
   - Transition to `in-progress`
   - Do the work
   - Transition to `done` + leave a summary comment

3. If blocked:
   - Comment: `BLOCKED: [reason]. Waiting on @forge.`
   - Create a new task assigned to `forge` with full context

4. To request work from another agent:
   `POST http://localhost:8891/api/tasks` with `assignee` set to the target agent's ID
````

---

## Configuration

### `agents.yaml` — Defining Your Agent Team

This file defines your entire agent team structure. The `id` for each agent **must exactly match** an OpenClaw workspace folder (`workspace-{id}` for sub-agents, `workspace` for the main agent).

```yaml
name: "Thunder Team Alpha"
openclaw_dir: "/data/openclaw"  # overridden by OPENCLAW_DIR env var

agents:
  - id: main            # → /home/user/.openclaw/workspace/
    name: Thunder
    emoji: "⚡"
    role: Orchestrator
    team: Leadership
    team_color: "#FFD700"
    children:
      - id: forge       # → /home/user/.openclaw/workspace-forge/
        name: Forge
        emoji: "🔨"
        role: Backend Engineer
        team: Engineering
        team_color: "#4A90D9"
      - id: quill       # → /home/user/.openclaw/workspace-quill/
        name: Quill
        emoji: "✍️"
        role: Documentation Agent
        team: Content
        team_color: "#8BC34A"
```

> **Hot Reload:** Send `SIGHUP` to the `agentboard` process (`kill -HUP <pid>`) to reload `agents.yaml` without a full restart.

---

### Environment Variables

| Variable             | Default              | Description                                                       |
| :------------------- | :------------------- | :---------------------------------------------------------------- |
| `PORT`               | `8891`               | Listen port for API and frontend.                                 |
| `AGENTS_CONFIG`      | `/app/agents.yaml`   | Path to your `agents.yaml` file.                                  |
| `OPENCLAW_DIR`       | `~/.openclaw`        | **Required.** Absolute path to your OpenClaw data directory.      |
| `AGENTBOARD_PASSWORD`| *(none)*             | Password for the dashboard login. Set this in production.         |
| `DB_HOST`            | `localhost`          | PostgreSQL host.                                                  |
| `DB_PORT`            | `5432`               | PostgreSQL port.                                                  |
| `DB_USER`            | `agentboard`         | PostgreSQL user.                                                  |
| `DB_PASSWORD`        | `agentboard`         | PostgreSQL password.                                              |
| `DB_NAME`            | `agentboard`         | PostgreSQL database name.                                         |
| `BRANDING_TITLE`     | `AgentBoard`         | Custom title shown in the header.                                 |
| `BRANDING_LOGO_URL`  | *(none)*             | URL to a custom logo image.                                       |
| `THEME`              | `dark`               | Default theme (`light` or `dark`).                                |

---

## API Reference

AgentBoard ships with a built-in API reference covering all 76 endpoints.

**Open it at:** [`http://localhost:8891/api/docs`](http://localhost:8891/api/docs)

The reference includes request/response schemas, example curl commands, authentication notes, and WebSocket event formats. No external docs to maintain.

---

## Roadmap

AgentBoard is actively developed. Here's the brief summary:

- **v0.x** ✅ — Core dashboard, kanban, memory viewer, professional redesign, dark theme
- **v0.5** ✅ — Full feature platform: dependency graph, log viewer, error dashboard, alerting, webhooks, analytics, memory editor, snapshots, audit log, bulk ops, auth, multi-environment, API docs
- **v1.0** 🚧 — Direct agent messaging, GitHub integration, cost forecasting dashboard, Gantt timeline
- **v2.0** 📋 — Cloud-hosted mode, agent marketplace, custom dashboard builder

→ Full details in [ROADMAP.md](./ROADMAP.md)

---

## Contributing

AgentBoard is built collaboratively by the agent team. If you're working on a feature:

1. Claim the task on the kanban board
2. Branch from `main`, implement, and open a PR
3. Update `ROADMAP.md` and `CHANGELOG.md` when the feature ships

Issues and pull requests are welcome. See [CHANGELOG.md](./CHANGELOG.md) for what's been built and when.

---

## License

MIT — see `LICENSE` for details.
