# 🎛️ AgentBoard

**A real-time dashboard for managing AI agent teams powered by [OpenClaw](https://github.com/openclaw/openclaw).**

AgentBoard gives you full visibility and control over your AI agent workforce — Kanban task management, live activity feeds, org charts, analytics, soul editing, health monitoring, and more. Built for teams that run multiple AI agents and need a single pane of glass.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📋 **Kanban Board** | Drag-and-drop task management with columns: Backlog → Todo → In Progress → Review → Done. Assign tasks to agents, track transitions, add comments. |
| 🤖 **Agent Management** | View all agents, their status, roles, and teams. Pause, resume, or kill agents. Edit SOUL files live. |
| 🏗️ **Org Chart** | Visual hierarchy of your agent team, rendered from `agents.yaml`. |
| 📊 **Analytics** | Token usage, cost tracking, throughput, team performance, efficiency scores. Export to CSV. |
| 🔔 **Activity Feed** | Real-time feed of agent actions via WebSocket streaming. |
| 🔍 **Global Search** | Search across tasks, agents, activity, and documents. |
| 📝 **Soul Viewer/Editor** | Read and edit any agent's SOUL.md directly from the UI. |
| 🏥 **Health Monitoring** | Per-agent health checks with auto-restart capability. |
| ⏱️ **Timeline** | Per-agent activity timeline with commit history. |
| 📄 **Documents** | Browse workspace documents across all agent workspaces. |
| 🎨 **Branding API** | Customise colors and branding via API. Light and dark theme support. |
| 🔐 **Authentication** | Login/logout with session management. |
| 🚨 **Alerts & Rules** | Configurable alert rules with acknowledgement workflow. |
| 📈 **Reports** | Generate reports in HTML, Markdown, or JSON. |
| 📦 **Marketplace** | Browse and deploy agent templates. |
| 🔗 **Dependency Graph** | Visualise agent dependencies. |
| 📜 **Audit Log** | Full audit trail of all actions. |
| 💬 **Webhooks** | Outbound webhooks with test/create/update/delete. |
| 🖥️ **Dashboard Builder** | Create custom dashboards with configurable widgets. |
| 📊 **Cost Forecasting** | Predict future token/cost spend based on trends. |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [OpenClaw](https://github.com/openclaw/openclaw) installed and configured
- An `agents.yaml` file describing your agent team

### 1. Clone and configure

```bash
git clone https://github.com/alghanim/agentboard.git
cd agentboard
```

### 2. Set up `agents.yaml`

Create or edit `agents.yaml` in the project root. This defines your agent team:

```yaml
name: "My Team"
openclaw_dir: "/home/youruser/.openclaw"

agents:
  - id: thunder
    name: Thunder
    emoji: "⚡"
    role: Orchestrator
    team: Command
    team_color: "#4A4A4A"
    is_lead: true
    model: "anthropic/claude-sonnet-4-6"
    children:
      - id: forge
        name: Forge
        emoji: "🔨"
        role: Backend Engineer
        team: Engineering
        team_color: "#2196F3"
        is_lead: false
      - id: pixel
        name: Pixel
        emoji: "🖥️"
        role: Frontend Engineer
        team: Engineering
        team_color: "#2196F3"
        is_lead: false
```

**Key fields:**
- `id` — Must match the OpenClaw workspace directory name (`workspace-{id}`)
- `name` — Display name in the UI
- `emoji` — Single emoji shown in org chart and agent cards
- `role` — Free-form role description
- `team` / `team_color` — Used for grouping and color coding
- `is_lead` — Marks team leaders in the org chart
- `children` — Nested child agents (recursive structure)
- `model` — The AI model this agent uses

Hot-reload: Send `SIGHUP` to the backend process to reload `agents.yaml` without restart.

### 3. Launch

```bash
# Set your OpenClaw directory (required)
export OPENCLAW_DIR="$HOME/.openclaw"

# Optional: set a database password
export DB_PASSWORD="your-secure-password"

# Start everything
docker compose up -d
```

AgentBoard is now running at **http://localhost:8891**

### 4. Without Docker (development)

```bash
# Start PostgreSQL separately, then:
cd backend
go run main.go

# Backend serves the frontend directory as static files
# Open http://localhost:8891
```

Environment variables:
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8891` | HTTP server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `agentboard` | PostgreSQL user |
| `DB_PASSWORD` | `agentboard` | PostgreSQL password |
| `DB_NAME` | `agentboard` | PostgreSQL database |
| `AGENTS_CONFIG` | `agents.yaml` | Path to agents config |
| `OPENCLAW_DIR` | `~/.openclaw` | OpenClaw data directory |
| `FRONTEND_DIR` | `frontend` | Path to frontend static files |

---

## 🔌 API Reference

All endpoints are under `/api/`. Authentication required unless noted.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |

### Tasks (Kanban)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/mine` | Tasks assigned to current user |
| GET | `/api/tasks/stuck` | Tasks stuck in a column too long |
| GET | `/api/tasks/{id}` | Get single task |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |
| POST | `/api/tasks/{id}/assign` | Assign task to agent |
| POST | `/api/tasks/{id}/transition` | Move task between columns |
| GET | `/api/tasks/{id}/history` | Task transition history |

### Task Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks/{task_id}/comments` | List comments |
| POST | `/api/tasks/{task_id}/comments` | Add comment |
| DELETE | `/api/comments/{id}` | Delete comment |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/{id}` | Get agent details |
| GET | `/api/agents/{id}/activity` | Agent activity log |
| GET | `/api/agents/{id}/metrics` | Agent metrics |
| PUT | `/api/agents/{id}/status` | Update agent status |
| POST | `/api/agents/{id}/pause` | Pause agent |
| POST | `/api/agents/{id}/resume` | Resume agent |
| POST | `/api/agents/{id}/kill` | Kill agent |
| GET | `/api/agents/{id}/health` | Health status |
| POST | `/api/agents/{id}/health/check` | Force health check |
| POST | `/api/agents/{id}/health/auto-restart` | Toggle auto-restart |
| GET | `/api/agents/{id}/commits` | Git commit history |
| GET | `/api/agents/{id}/timeline` | Activity timeline |
| GET | `/api/agents/{id}/skills` | Agent skills |
| GET | `/api/agents/{id}/soul` | Read SOUL.md |
| PUT | `/api/agents/{id}/soul` | Update SOUL.md |

### Agent Snapshots
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents/{id}/snapshots` | List snapshots |
| POST | `/api/agents/{id}/snapshots` | Create snapshot |
| POST | `/api/agents/{id}/snapshots/{snapshot_id}/restore` | Restore snapshot |

### OpenClaw Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/openclaw/agents` | Live OpenClaw agent data |
| GET | `/api/openclaw/agents/{name}` | Single agent from OpenClaw |
| GET | `/api/openclaw/stream` | SSE activity stream |
| GET | `/api/openclaw/stats` | OpenClaw statistics |
| GET | `/api/structure` | Team structure |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | Overview stats |
| GET | `/api/analytics/agents` | Per-agent analytics |
| GET | `/api/analytics/throughput` | Task throughput |
| GET | `/api/analytics/team` | Team analytics |
| GET | `/api/analytics/export/csv` | CSV export |
| GET | `/api/analytics/tokens` | Token usage |
| GET | `/api/analytics/tokens/timeline` | Token usage over time |
| GET | `/api/analytics/cost/summary` | Cost summary |
| GET | `/api/analytics/performance` | Performance metrics |

### Metrics & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/metrics/latency` | Latency metrics |
| GET | `/api/metrics/cost-forecast` | Cost forecasting |
| GET | `/api/metrics/efficiency` | Efficiency scores |
| GET | `/api/report` | JSON report |
| GET | `/api/report/html` | HTML report |
| GET | `/api/report/markdown` | Markdown report |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/dashboard/teams` | Team statistics |
| GET | `/api/dashboards` | List custom dashboards |
| POST | `/api/dashboards` | Create custom dashboard |
| GET | `/api/dashboards/{id}` | Get dashboard |
| PUT | `/api/dashboards/{id}` | Update dashboard |
| DELETE | `/api/dashboards/{id}` | Delete dashboard |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/rules` | List alert rules |
| POST | `/api/alerts/rules` | Create alert rule |
| PUT | `/api/alerts/rules/{id}` | Update alert rule |
| DELETE | `/api/alerts/rules/{id}` | Delete alert rule |
| GET | `/api/alerts/history` | Alert history |
| POST | `/api/alerts/history/{id}/acknowledge` | Acknowledge alert |
| GET | `/api/alerts/unacknowledged-count` | Unacknowledged count |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Create webhook |
| PUT | `/api/webhooks/{id}` | Update webhook |
| DELETE | `/api/webhooks/{id}` | Delete webhook |
| POST | `/api/webhooks/{id}/test` | Test webhook |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activity` | Global activity feed |
| GET | `/api/branding` | Branding config |
| GET | `/api/search` | Global search |
| GET | `/api/documents` | List documents |
| GET | `/api/documents/content` | Document content |
| GET | `/api/environments` | List environments |
| POST | `/api/environments` | Add environment |
| DELETE | `/api/environments` | Remove environment |
| POST | `/api/environments/switch` | Switch environment |
| GET | `/api/errors` | Error log |
| GET | `/api/errors/summary` | Error summary |
| GET | `/api/logs` | View logs |
| GET | `/api/logs/files` | List log files |
| GET | `/api/logs/search` | Search logs |
| GET | `/api/audit` | Audit log |
| GET | `/api/graph/dependencies` | Dependency graph |
| GET | `/api/docs` | API documentation |
| GET | `/api/marketplace/templates` | List templates |
| GET | `/api/marketplace/templates/{id}` | Get template |
| POST | `/api/marketplace/templates/{id}/deploy` | Deploy template |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `/ws/stream` | Real-time activity stream |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Backend health check |

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│         Browser (SPA)           │
│  Vanilla JS · No build step     │
│  Pages: Kanban, Agents, Org     │
│  Chart, Analytics, Activity...  │
└──────────┬──────────────────────┘
           │ HTTP + WebSocket
┌──────────▼──────────────────────┐
│     Go Backend (Gorilla Mux)    │
│  REST API · WebSocket hub       │
│  Reads OpenClaw workspaces      │
│  Reads agents.yaml (hot-reload) │
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│     PostgreSQL 16               │
│  Tasks, activity, analytics,    │
│  alerts, webhooks, audit log    │
└─────────────────────────────────┘
           │
┌──────────▼──────────────────────┐
│   OpenClaw (~/.openclaw)        │
│  workspace-{id}/SOUL.md         │
│  Agent configs, memory files    │
└─────────────────────────────────┘
```

The frontend is pure HTML/JS with no build step — just static files served by the Go backend. Pages are in `frontend/pages/`, styles in `frontend/styles/`, and scripts in `frontend/js/`.

---

## 🔗 Agent ↔ Kanban Integration

Agents interact with the Kanban board via the REST API. Example from an OpenClaw agent's heartbeat:

```bash
# Create a task
curl -X POST http://localhost:8891/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Fix login bug","description":"Users see 500 on /login","priority":"high","assigned_to":"forge"}'

# Move task to "in_progress"
curl -X POST http://localhost:8891/api/tasks/42/transition \
  -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}'

# Mark complete
curl -X POST http://localhost:8891/api/tasks/42/transition \
  -H 'Content-Type: application/json' \
  -d '{"status":"done"}'
```

---

## ❓ FAQ

**Q: I get "OPENCLAW_DIR not found" errors**
A: Set the `OPENCLAW_DIR` environment variable to your OpenClaw installation directory (typically `~/.openclaw`). In Docker, this is mounted as a volume.

**Q: Agent shows "unknown" in the UI**
A: The agent's `id` in `agents.yaml` must match the OpenClaw workspace directory name. If the workspace is `~/.openclaw/workspace-forge`, the id must be `forge`.

**Q: How do I add a new agent?**
A: Add it to `agents.yaml` and send `SIGHUP` to the backend process (or restart). The agent will appear immediately.

**Q: Can I use this without OpenClaw?**
A: The Kanban, analytics, and task management work standalone. Agent-specific features (soul viewer, health checks, activity from workspaces) require OpenClaw.

**Q: The WebSocket disconnects frequently**
A: The frontend auto-reconnects. If it persists, check that your reverse proxy supports WebSocket upgrades.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development

```bash
cd backend && go run main.go
# Frontend — no build step, just edit files in frontend/
# Open http://localhost:8891
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

---

Built with ⚡ by the [Thunder](https://thunder.qa) team.
