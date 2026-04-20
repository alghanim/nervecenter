# AgentBoard (NerveCenter)

![Go](https://img.shields.io/badge/backend-Go-00ADD8?logo=go&logoColor=white) ![Postgres](https://img.shields.io/badge/database-PostgreSQL-336791?logo=postgresql&logoColor=white) ![WebSocket](https://img.shields.io/badge/realtime-WebSocket-0EA5E9) ![OpenClaw](https://img.shields.io/badge/integrates-OpenClaw-111827)

AgentBoard is a real-time command center for OpenClaw-based AI teams. It combines kanban, live agent visibility, workspace-file inspection, analytics, and operational tooling in one browser UI so an orchestrator can actually run a multi-agent team without juggling ten terminals. In the product UI it is also branded as **NerveCenter**.

## What it is

AgentBoard watches your agent registry, task board, workspace files, and runtime signals, then turns them into a single operational surface. Instead of checking logs, sessions, workspaces, and ad hoc scripts separately, you get one place to:

- see who exists, who owns what, and who is blocked
- read `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md`, and related files live from each workspace
- manage tasks on a kanban board with comments, history, dependencies, and templates
- monitor activity, alerts, errors, traces, costs, and health in real time
- search across the system when something goes wrong

## Who it's for

- **AI orchestrators** running multi-agent delivery teams
- **developers** building OpenClaw agents and needing visibility into behaviour
- **operators / founders** who want a control room, not a pile of transcripts
- **QA and docs leads** who need auditability, history, and team structure in one place

## What problem it solves

Once you move beyond one assistant, the hard part is not model quality. It is coordination.

AgentBoard solves the operational mess around multi-agent systems:

- task state scattered across chat, notes, and git
- no clear map of agent hierarchy or ownership
- difficult-to-audit `SOUL.md` / workspace changes
- weak observability around failures, costs, and stuck work
- too much manual context-switching between CLI tools and internal docs

## At a glance

```text
Browser UI
  ├─ Dashboard / Kanban / Org Chart / Analytics / Search
  ├─ Soul Viewer / Logs / Errors / Alerts / Costs
  └─ Live WebSocket updates
         │
         ▼
Go API server
  ├─ PostgreSQL (tasks, comments, metrics, alerts, API keys, costs)
  ├─ OpenClaw workspace reader (`OPENCLAW_DIR`)
  ├─ agents.yaml registry + branding
  └─ WebSocket hub for realtime UI updates
```

## UI tour

The main UI is a left-nav control room. Out of the box it exposes pages for:

- **Dashboard** and **My Dashboard**
- **Agents** and **Soul Viewer**
- **Org Chart** and **Dependency Graph**
- **Kanban**
- **Activity Feed**
- **Health**
- **Messages / Playground**
- **Reports**
- **Documents**
- **Errors**
- **Costs**
- **Logs**
- **API Docs**
- **Templates**
- **Traces**
- **Notifications**
- **Incidents**
- **Alerts**
- **Marketplace**
- **Settings**

If you want the shortest possible description: it feels like Jira, Grafana, a wiki, and an agent inspector had a sensible child.

## Features

### Kanban
- task CRUD
- assignees, priorities, comments, transition history
- stuck-task view
- dependency graph / DAG support
- template-based task creation

### Soul Viewer
- live reads of `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md`, `AGENTS.md`, and `TOOLS.md`
- edit support through the API
- snapshot + restore workflow for workspace files

### Org Chart
- hierarchy built from `agents.yaml`
- lead / child relationships rendered visually
- side-panel soul preview and agent detail views

### Activity Feed
- recent actions across the team
- realtime updates through WebSocket
- drill-down to agent and task context

### Analytics
- overview, throughput, cycle time, active agents, ranking, token usage, and cost summaries
- scorecards and performance timelines per agent
- CSV export endpoints for external analysis

### Search
- cross-entity search for agents, tasks, and supporting records
- log search endpoints for failure investigation

### WebSocket
- push updates to the UI over `/ws/stream`
- keeps dashboard badges, activity views, and alerts fresh without manual reloads

### Branding API
- team name, logo path, accent color, and theme come from `agents.yaml`
- frontend reads branding via `GET /api/branding`

### Light / Dark theme
- user can toggle theme in the UI
- branding config can set the default theme (`light` or `dark`)

### More built-in operational tooling
- alerts and alert history
- health checks and gateway health
- notifications
- incident tracking
- traces
- git integrations and GitHub webhook receiver
- document browser and reports
- environment switching
- API key management

## Prerequisites

Before you start, have these ready:

- Docker + Docker Compose **or** Go + PostgreSQL for local backend dev
- a real OpenClaw data directory, usually `~/.openclaw`
- an `agents.yaml` whose IDs match your workspaces
- a non-default UI password and a stable `JWT_SECRET`

## Quick Start

### Option A, Docker Compose (recommended)

```bash
git clone https://github.com/alghanim/agentboard.git
cd agentboard
cp .env.example .env
cp agents.yaml.example agents.yaml
```

Edit `.env` and set at least these values. Important: the current `.env.example` does **not** include `AGENTBOARD_PASSWORD` or `JWT_SECRET`, so add them manually after copying the file.

```env
DB_PASSWORD=change-me
OPENCLAW_DIR=/absolute/path/to/.openclaw
AGENTBOARD_PASSWORD=change-me-too
JWT_SECRET=replace-this-in-production
```

Then edit `agents.yaml` so the hierarchy matches your real team and the IDs match your workspaces.

Start the stack:

```bash
docker compose up --build -d
```

Open:

- UI: <http://localhost:8891>
- health check: <http://localhost:8891/health>

First login:

- If you set `AGENTBOARD_PASSWORD`, use that.
- If you did **not** set it, the app falls back to `admin`. That is convenient for local testing and terrible for production.

### Option B, local backend dev

If you already have PostgreSQL running locally:

```bash
git clone https://github.com/alghanim/agentboard.git
cd agentboard
cp .env.example .env
cp agents.yaml.example agents.yaml
export OPENCLAW_DIR=/absolute/path/to/.openclaw
export AGENTS_CONFIG=$PWD/agents.yaml
export AGENTBOARD_PASSWORD=change-me
export JWT_SECRET=dev-secret
cd backend
go run .
```

The Go server serves the static frontend directly. Default port is `8891`.

### Minimum environment reference

| Variable | Required | Why it matters |
|---|---|---|
| `OPENCLAW_DIR` | Yes | Lets AgentBoard read workspaces, session files, and live agent metadata. Use an **absolute path**. |
| `AGENTS_CONFIG` | Usually | Points the backend at your `agents.yaml`. |
| `DB_PASSWORD` | Docker: yes | Used by PostgreSQL and the backend connection. |
| `AGENTBOARD_PASSWORD` or `AGENTBOARD_PASSWORD_HASH` | Yes outside demos | Controls web login for write actions. |
| `JWT_SECRET` | Strongly recommended | Keeps login tokens stable across restarts. |
| `PORT` | Optional | Defaults to `8891`. |
| `FRONTEND_DIR` | Optional | Needed only if you serve the static frontend from a custom path. |

### Smoke test

After startup:

```bash
# 1) Process health
curl http://localhost:8891/health

# 2) Login for a bearer token
curl -s -X POST http://localhost:8891/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"change-me-too"}'

# 3) Read something useful
curl -s http://localhost:8891/api/agents | jq '.[0]'
```

If step 3 returns an empty list, the usual culprits are `OPENCLAW_DIR`, `agents.yaml`, or mismatched workspace IDs.

## `agents.yaml`, explained with a real example

This file is the source of truth for your visible team structure, branding, and workspace discovery.

```yaml
name: "Thunder Team"
openclaw_dir: "/home/alice/.openclaw"

branding:
  team_name: "Thunder Team"
  accent_color: "#C5D92E"
  theme: "light"

agents:
  - id: main
    name: Thunder
    emoji: "⚡"
    role: Orchestrator
    team: Command
    team_color: "#414142"
    is_lead: true
    model: "google/gemini-2.5-flash"
    children:
      - id: titan
        name: Titan
        emoji: "🔩"
        role: Engineering Lead
        team: Engineering
        team_color: "#3B82F6"
        is_lead: true
        children:
          - id: forge
            name: Forge
            emoji: "🔨"
            role: Backend Engineer
            team: Engineering
            team_color: "#3B82F6"

      - id: sentinel
        name: Sentinel
        emoji: "🛡️"
        role: QA Gate
        team: QA
        team_color: "#EF4444"

legacy_dirs:
  sentinel:
    - qa
  chrono:
    - timing
  ink:
    - reports
```

### Field guide

| Field | What it does |
|---|---|
| `name` | Team label used across the UI. |
| `openclaw_dir` | Base path to your OpenClaw data directory. |
| `branding.team_name` | Display name returned by the branding API. |
| `branding.accent_color` | Accent color used by the UI. |
| `branding.theme` | Default theme, `light` or `dark`. |
| `agents[].id` | Logical agent ID. Keep it aligned with workspace naming whenever possible. |
| `agents[].children` | Nested org-chart structure. |
| `agents[].is_lead` | Flags leaders in the hierarchy. |
| `agents[].model` | Optional display metadata for the active model. |
| `legacy_dirs` | Alias map for historical directory names, for example `sentinel -> qa` or `chrono -> timing`. |

### Rules that save you pain

- Prefer IDs that match `workspace-<id>` exactly.
- The main OpenClaw workspace is special. If your orchestrator lives in the base `workspace/` directory, keep that in mind when testing.
- Use `legacy_dirs` whenever history has already given you ugly names like `reports`, `timing`, or `qa`.
- After editing `agents.yaml`, reload the backend or send `SIGHUP` so the config is re-read.

## Authentication

AgentBoard supports two write-auth paths:

1. **Bearer JWT** from `POST /api/auth/login`
2. **`X-API-Key`** header backed by stored hashed API keys

Important behaviour:

- `GET` requests are generally open
- `POST`, `PUT`, and `DELETE` require auth
- `/api/keys/*` additionally requires **admin** role
- if `JWT_SECRET` is missing, AgentBoard generates an ephemeral one on startup, which means all login tokens break on restart

## How agents connect to the kanban

The simplest integration is a heartbeat that polls assigned tasks, moves one into progress, then comments when done.

```bash
API_KEY="<your-agentboard-api-key>"
AGENT_ID="quill"
TASK_ID=$(curl -s "http://localhost:8891/api/tasks/mine?agent_id=$AGENT_ID" | jq -r '.[0].id')

# Move the task into progress
curl -s -X POST "http://localhost:8891/api/tasks/$TASK_ID/transition" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"status":"progress"}'

# Leave a completion note
curl -s -X POST "http://localhost:8891/api/tasks/$TASK_ID/comments" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"author":"quill","content":"Done. README refreshed and changelog updated."}'
```

Useful status values from the schema are:

- `backlog`
- `todo`
- `next`
- `progress`
- `review`
- `done`
- `blocked`

## Full API reference

Notes before the tables:

- All endpoints below are rooted at `http://localhost:8891`
- Unless noted otherwise, the path is under `/api`
- `GET` is read-only and usually public
- `POST` / `PUT` / `DELETE` require auth

### Auth, health, and realtime

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Issue a 24 hour bearer token for the web UI or scripts. |
| `POST` | `/api/auth/logout` | Client-side logout acknowledgement. |
| `GET` | `/api/auth/me` | Check whether the current bearer token is valid. |
| `GET` | `/api/branding` | Read branding config from `agents.yaml`. |
| `GET` | `/api/docs` | Fetch machine-readable API documentation. |
| `GET` | `/health` | Basic process health check. |
| `GET` | `/ws/stream` | Open the live WebSocket stream used by the UI. |

### Tasks and comments

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/tasks` | List tasks, with optional filters. |
| `POST` | `/api/tasks` | Create a task. |
| `GET` | `/api/tasks/mine` | List tasks assigned to a specific agent via `agent_id`. |
| `GET` | `/api/tasks/stuck` | List overdue or stalled tasks. |
| `GET` | `/api/tasks/graph` | Return the task DAG / graph view. |
| `GET` | `/api/tasks/{id}` | Fetch a single task. |
| `PUT` | `/api/tasks/{id}` | Update a task. |
| `DELETE` | `/api/tasks/{id}` | Delete a task. |
| `POST` | `/api/tasks/{id}/assign` | Assign a task to an agent. |
| `POST` | `/api/tasks/{id}/transition` | Move a task between statuses. |
| `GET` | `/api/tasks/{id}/history` | Read task status history / audit trail. |
| `GET` | `/api/tasks/{task_id}/comments` | List comments on a task. |
| `POST` | `/api/tasks/{task_id}/comments` | Add a comment to a task. |
| `DELETE` | `/api/comments/{id}` | Delete a comment. |
| `GET` | `/api/tasks/{id}/dependencies` | Read task dependency edges. |
| `PUT` | `/api/tasks/{id}/dependencies` | Replace task dependency edges. |
| `GET` | `/api/tasks/{id}/prs` | List pull requests linked to a task. |
| `GET` | `/api/tasks/{id}/traces` | List traces linked to a task. |
| `GET` | `/api/tasks/{id}/evaluations` | List quality evaluations for a task. |

### Agents and workspace files

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/agents` | List agents from the registry database. |
| `GET` | `/api/agents/compare` | Compare agents side by side. |
| `GET` | `/api/agents/{id}` | Fetch one agent record. |
| `GET` | `/api/agents/{id}/activity` | Recent activity for an agent. |
| `GET` | `/api/agents/{id}/metrics` | Daily / aggregate metrics for an agent. |
| `PUT` | `/api/agents/{id}/status` | Set an agent status manually. |
| `POST` | `/api/agents/{id}/pause` | Pause an agent. |
| `POST` | `/api/agents/{id}/resume` | Resume an agent. |
| `POST` | `/api/agents/{id}/kill` | Mark an agent killed / request stop. |
| `GET` | `/api/agents/{id}/health` | Read health-check status for one agent. |
| `POST` | `/api/agents/{id}/health/check` | Force a health check now. |
| `POST` | `/api/agents/{id}/health/auto-restart` | Toggle auto-restart behaviour. |
| `GET` | `/api/agents/{id}/commits` | Recent git commits attributed to the agent. |
| `GET` | `/api/agents/{id}/annotations` | Shared notes attached to an agent. |
| `POST` | `/api/agents/{id}/annotations` | Create an annotation. |
| `DELETE` | `/api/agents/{id}/annotations/{ann_id}` | Delete an annotation. |
| `GET` | `/api/agents/{id}/soul` | Read SOUL.md plus related workspace files. |
| `PUT` | `/api/agents/{id}/soul` | Write a workspace file such as SOUL.md or MEMORY.md. |
| `GET` | `/api/agents/{id}/snapshots` | List saved workspace snapshots. |
| `POST` | `/api/agents/{id}/snapshots` | Create a snapshot. |
| `POST` | `/api/agents/{id}/snapshots/{snapshot_id}/restore` | Restore a snapshot. |
| `GET` | `/api/agents/{id}/timeline` | Chronological timeline from agent session files. |
| `GET` | `/api/agents/{id}/skills` | List global and agent-specific skills. |
| `GET` | `/api/agents/{id}/scorecard` | High-level scorecard for an agent. |
| `GET` | `/api/agents/{id}/performance/timeline` | Performance timeline for one agent. |
| `GET` | `/api/agents/{id}/traces` | List traces emitted by one agent. |
| `GET` | `/api/agents/{id}/quality` | Read evaluation / quality aggregates. |
| `POST` | `/api/agents/{id}/message` | Send a direct playground message to an agent. |

### Structure, OpenClaw, and environments

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/structure` | Resolved org chart / hierarchy from `agents.yaml`. |
| `GET` | `/api/openclaw/agents` | Live agent inventory from OpenClaw data. |
| `GET` | `/api/openclaw/agents/{name}` | Live detail for one OpenClaw agent. |
| `GET` | `/api/openclaw/stream` | Live stream metadata / OpenClaw status. |
| `GET` | `/api/openclaw/stats` | OpenClaw aggregate runtime stats. |
| `GET` | `/api/environments` | List saved environments. |
| `POST` | `/api/environments` | Create an environment entry. |
| `DELETE` | `/api/environments` | Delete an environment entry. |
| `POST` | `/api/environments/switch` | Switch the active environment. |
| `GET` | `/api/gateway/health` | Health snapshot for the OpenClaw gateway. |

### Dashboards, analytics, reports, metrics, and costs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Overview cards for the home dashboard. |
| `GET` | `/api/dashboard/teams` | Team-level dashboard summaries. |
| `GET` | `/api/dashboards` | List saved custom dashboards. |
| `POST` | `/api/dashboards` | Create a custom dashboard. |
| `GET` | `/api/dashboards/{id}` | Fetch one custom dashboard. |
| `PUT` | `/api/dashboards/{id}` | Update a custom dashboard. |
| `DELETE` | `/api/dashboards/{id}` | Delete a custom dashboard. |
| `GET` | `/api/activity` | Global activity feed. |
| `GET` | `/api/analytics/overview` | Top-level analytics overview. |
| `GET` | `/api/analytics/agents` | Analytics broken down by agent. |
| `GET` | `/api/analytics/throughput` | Task throughput trends. |
| `GET` | `/api/analytics/team` | Analytics by team. |
| `GET` | `/api/analytics/export/csv` | Export analytics as CSV. |
| `GET` | `/api/analytics/tokens` | Token usage summary. |
| `GET` | `/api/analytics/tokens/timeline` | Token usage over time. |
| `GET` | `/api/analytics/tokens/by-agent` | Token usage by agent. |
| `GET` | `/api/analytics/cost/summary` | Aggregated cost summary. |
| `GET` | `/api/analytics/performance` | Performance analytics. |
| `GET` | `/api/analytics/cycle-time` | Task cycle-time analytics. |
| `GET` | `/api/analytics/active-agents` | Currently active agents snapshot. |
| `GET` | `/api/analytics/dashboard-summary` | Condensed analytics for widgets. |
| `GET` | `/api/analytics/trends` | Trendline analytics. |
| `GET` | `/api/analytics/agents/ranking` | Agent ranking / leaderboard. |
| `POST` | `/api/costs` | Ingest a cost event. |
| `GET` | `/api/costs/summary` | Read total cost summary. |
| `GET` | `/api/costs/breakdown` | Cost breakdown by slice. |
| `GET` | `/api/costs/burn-rate` | Burn-rate forecast inputs. |
| `GET` | `/api/costs/per-task` | Cost per task. |
| `GET` | `/api/costs/by-model` | Cost by model. |
| `GET` | `/api/report` | JSON performance report. |
| `GET` | `/api/report/html` | HTML report. |
| `GET` | `/api/report/markdown` | Markdown report. |
| `GET` | `/api/metrics/latency` | Latency metrics. |
| `GET` | `/api/metrics/cost-forecast` | Cost forecast. |
| `GET` | `/api/metrics/efficiency` | Efficiency scoring. |

### Search, docs, logs, files, and audit

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/search` | Global search across agents, tasks, and related records. |
| `GET` | `/api/documents` | List documents and specs the board can see. |
| `GET` | `/api/documents/content` | Read one document body. |
| `GET` | `/api/logs` | Read log lines. |
| `GET` | `/api/logs/files` | List available log files. |
| `GET` | `/api/logs/search` | Search logs. |
| `GET` | `/api/errors` | List errors / failures. |
| `GET` | `/api/errors/summary` | Error roll-up stats. |
| `GET` | `/api/audit` | Audit log for write operations. |
| `GET` | `/api/graph/dependencies` | Dependency graph data for the graph view. |

### Alerts, notifications, incidents, traces, and evaluations

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/alerts/rules` | List alert rules. |
| `POST` | `/api/alerts/rules` | Create an alert rule. |
| `PUT` | `/api/alerts/rules/{id}` | Update an alert rule. |
| `DELETE` | `/api/alerts/rules/{id}` | Delete an alert rule. |
| `GET` | `/api/alerts/history` | List fired alerts. |
| `POST` | `/api/alerts/history/{id}/acknowledge` | Acknowledge a fired alert. |
| `GET` | `/api/alerts/unacknowledged-count` | Unread alert count for badges. |
| `GET` | `/api/notifications` | List notifications. |
| `POST` | `/api/notifications` | Create a notification. |
| `POST` | `/api/notifications/read-all` | Mark all notifications read. |
| `GET` | `/api/notifications/unread-count` | Unread notification count. |
| `PUT` | `/api/notifications/{id}/read` | Mark one notification read. |
| `DELETE` | `/api/notifications/{id}` | Delete a notification. |
| `POST` | `/api/traces` | Ingest one trace. |
| `POST` | `/api/traces/batch` | Batch ingest traces. |
| `DELETE` | `/api/traces/{id}` | Delete a trace. |
| `GET` | `/api/incidents` | List incidents. |
| `POST` | `/api/incidents` | Create an incident. |
| `GET` | `/api/incidents/{id}` | Fetch one incident. |
| `PUT` | `/api/incidents/{id}` | Update an incident. |
| `POST` | `/api/incidents/auto-create` | Auto-create an incident from current signals. |
| `POST` | `/api/evaluations` | Create one evaluation. |
| `POST` | `/api/evaluations/bulk` | Create many evaluations at once. |
| `GET` | `/api/evaluations/criteria-breakdown` | Read criteria-level evaluation stats. |

### Templates, marketplace, integrations, and admin keys

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/templates` | List task templates. |
| `POST` | `/api/templates` | Create a template. |
| `GET` | `/api/templates/{id}` | Fetch one template. |
| `PUT` | `/api/templates/{id}` | Update a template. |
| `DELETE` | `/api/templates/{id}` | Delete a template. |
| `POST` | `/api/templates/{id}/instantiate` | Create a task from a template. |
| `GET` | `/api/marketplace/templates` | List marketplace templates. |
| `GET` | `/api/marketplace/templates/{id}` | Fetch one marketplace template. |
| `POST` | `/api/marketplace/templates/{id}/deploy` | Deploy a marketplace template. |
| `GET` | `/api/integrations/git` | List git integrations. |
| `POST` | `/api/integrations/git` | Create a git integration. |
| `DELETE` | `/api/integrations/git/{id}` | Delete a git integration. |
| `POST` | `/api/webhooks/github` | Receive GitHub webhook events. |
| `GET` | `/api/webhooks` | List webhooks. |
| `POST` | `/api/webhooks` | Create a webhook. |
| `PUT` | `/api/webhooks/{id}` | Update a webhook. |
| `DELETE` | `/api/webhooks/{id}` | Delete a webhook. |
| `POST` | `/api/webhooks/{id}/test` | Send a test webhook payload. |
| `GET` | `/api/keys` | List API keys (admin only). |
| `POST` | `/api/keys` | Create an API key and return the plaintext once (admin only). |
| `DELETE` | `/api/keys/{id}` | Revoke an API key (admin only). |

## FAQ

### `OPENCLAW_DIR` is missing, and everything looks empty
Set `OPENCLAW_DIR` to the absolute path of the machine's `.openclaw` directory. The board needs it to read workspaces, timeline files, and live agent metadata.

### My agent exists in `agents.yaml`, but AgentBoard cannot find the workspace
The fastest fix is to make the agent ID match the real workspace name. If history already gave you mismatched names, use `legacy_dirs`. Common examples are `sentinel -> qa`, `chrono -> timing`, and `ink -> reports`.

### Does the agent ID have to match `workspace-<built-in function id>` exactly
Usually yes. That convention keeps discovery predictable. The exception is the main OpenClaw workspace and anything you explicitly bridge through `legacy_dirs`.

### Why do writes return `401`
Because reads are mostly open but writes are not. Send either a bearer token from `/api/auth/login` or an `X-API-Key` header.

### Why does `/api/keys` say forbidden
Those routes are admin-only. Use an admin API key or log in as an admin session first.

### Why do logins stop working after every restart
You probably forgot `JWT_SECRET`. Without it, AgentBoard generates an ephemeral secret at boot, which invalidates existing tokens on restart.

### Why am I seeing the default password warning
If `AGENTBOARD_PASSWORD` and `AGENTBOARD_PASSWORD_HASH` are both unset, the app falls back to `admin`. Set one of them immediately outside local dev.

### I copied `.env.example`, why can I still not log in
Because the template currently omits `AGENTBOARD_PASSWORD` and `JWT_SECRET`. Add both manually, then restart the backend.

### Docker Compose starts, but the OpenClaw volume is wrong
Use an absolute path in `.env`. Tilde expansion is a frequent foot-gun in container setups, especially when the shell and Compose disagree.

### The port is already in use
Change `PORT` for local dev, and update the published port mapping in `docker-compose.yml` if needed.

## Contributing

Contributions are welcome. Good first contributions include:

- tightening handler docs so the API reference stays accurate
- improving empty states and onboarding copy
- adding tests for tricky agent/workspace resolution cases
- expanding marketplace templates or dashboard widgets

Suggested flow:

1. open an issue or describe the gap
2. keep the change focused
3. update docs with the code
4. include screenshots or curl output when changing behaviour

## License

MIT. The project UI and repo docs already describe AgentBoard / NerveCenter as MIT-licensed. Keep a top-level `LICENSE` file in the repository so the legal terms stay explicit for downstream users.
