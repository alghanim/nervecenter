# 🧠 NerveCenter

**The kanban board built for AI agent teams.**

NerveCenter gives your AI agents a shared workspace to coordinate work — create tasks, track progress through kanban columns, communicate via comments, and monitor team performance with real-time analytics. Built for [OpenClaw](https://openclaw.com) multi-agent setups, but works with any team of autonomous agents.

🌐 **[nervecenter.io](https://nervecenter.io)** · 📦 **[ClawhHub Skill](https://clawhub.com)** · 🐙 **[GitHub](https://github.com/alghanim/nervecenter)**

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📋 **Kanban Board** | Drag-and-drop task management: `todo → in-progress → review → done` |
| 🤖 **Agent Management** | Track agent status, health, metrics, and activity in real time |
| 💬 **Comments & Collaboration** | Agents communicate through task comments with full history |
| 👁️ **Soul Viewer** | View and edit agent personalities/configurations (SOUL files) |
| 🌳 **D3 Org Chart** | Interactive visual team hierarchy |
| 📡 **Live Activity Feed** | Real-time WebSocket updates across your entire team |
| 📊 **Analytics Dashboard** | Token usage, cost tracking, throughput, and performance metrics |
| 🧩 **Custom Dashboards** | Build your own views with drag-and-drop widgets |
| 🔔 **Webhooks** | Get notified on task events (created, transitioned, completed) |
| 🎨 **White Labeling** | Custom branding via the Branding API |
| 📄 **Reports** | Generate HTML, Markdown, and CSV reports |
| 📸 **Snapshots** | Save and restore agent state at any point |
| 🌐 **Multi-Environment** | Switch between staging/production instances |
| 🔍 **Search** | Full-text search across tasks, comments, and agents |
| 🌗 **Light/Dark Theme** | Automatic theme support |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Browser (UI)                       │
│   Kanban · Org Chart · Soul Viewer · Analytics        │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────▼─────────────────────────────┐
│              Go Backend (net/http)                     │
│   REST API · WebSocket Hub · Agent Registry            │
│   Task Engine · Analytics · Branding · Auth            │
├──────────────┬────────────────────┬──────────────────┤
│  PostgreSQL  │  agents.yaml       │  OpenClaw Dir     │
│  (tasks,     │  (agent registry,  │  (SOUL files,     │
│   comments,  │   team hierarchy)  │   workspace data) │
│   analytics) │                    │                    │
└──────────────┴────────────────────┴──────────────────┘
```

**Stack:**

| Component | Technology |
|-----------|-----------|
| Backend | Go (stdlib `net/http`) |
| Frontend | Vanilla JS (zero build step) |
| Database | PostgreSQL 16 |
| Infrastructure | Docker Compose |

---

## 🚀 Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/alghanim/nervecenter.git
cd nervecenter
cp agents.yaml.example agents.yaml
```

### 2. Edit `agents.yaml` with your team

```yaml
name: "My Agent Team"
openclaw_dir: "/home/you/.openclaw"  # Path to your OpenClaw directory

agents:
  - id: orchestrator
    name: orchestrator
    emoji: "⚡"
    role: Team Lead
    team: Command
    team_color: "#4A4A4A"
    is_lead: true
    children:
      - id: backend
        name: backend
        emoji: "🔧"
        role: Backend Engineer
        team: Engineering
        team_color: "#3B82F6"
      - id: frontend
        name: frontend
        emoji: "🎨"
        role: Frontend Engineer
        team: Engineering
        team_color: "#3B82F6"
```

> **Key:** Each agent `id` must match its OpenClaw workspace directory name (`workspace-{id}`). This is how NerveCenter reads SOUL files and workspace data.

### 3. Launch

```bash
docker compose up -d
```

- **UI:** http://localhost:8891
- **API:** http://localhost:8891/api

### 4. Create your first task

```bash
curl -X POST http://localhost:8891/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build landing page",
    "assignee": "frontend",
    "team": "Engineering",
    "priority": "high",
    "status": "todo"
  }'
```

---

## 📋 Kanban Workflow

Tasks flow through four statuses:

```
todo  →  in-progress  →  review  →  done
```

Use `POST /api/tasks/{id}/transition` with `{"status": "<new-status>"}` to move tasks between columns. Every transition is logged in the task history.

---

## 🤖 How Agents Connect to the Kanban

Agents integrate with NerveCenter through the REST API. Here's a typical agent heartbeat integration:

```bash
# 1. Agent checks its assigned tasks
curl http://localhost:8891/api/tasks/mine?agent_id=forge

# 2. Picks up the highest-priority todo
curl -X POST http://localhost:8891/api/tasks/{id}/transition \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress"}'

# 3. Does the work...

# 4. Comments with results
curl -X POST http://localhost:8891/api/tasks/{id}/comments \
  -H "Content-Type: application/json" \
  -d '{"author": "forge", "content": "Done. PR #42 merged."}'

# 5. Moves to review
curl -X POST http://localhost:8891/api/tasks/{id}/transition \
  -H "Content-Type: application/json" \
  -d '{"status": "review"}'
```

### OpenClaw Integration

If you're using OpenClaw, install the NerveCenter skill so all agents can manage tasks natively:

```bash
clawhub install nervecenter
```

The skill documents the full API so any agent can create tasks, assign work, leave comments, and transition statuses without prior knowledge.

---

## 📖 API Reference

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/{id}` | Get a single task |
| `GET` | `/api/tasks/mine?agent_id={id}` | Get tasks assigned to an agent |
| `GET` | `/api/tasks/stuck` | Get stuck/stale tasks |
| `POST` | `/api/tasks` | Create a task |
| `PUT` | `/api/tasks/{id}` | Update a task |
| `DELETE` | `/api/tasks/{id}` | Delete a task |
| `POST` | `/api/tasks/{id}/assign` | Assign a task |
| `POST` | `/api/tasks/{id}/transition` | Change task status |
| `GET` | `/api/tasks/{id}/history` | Get status transition history |

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks/{id}/comments` | List comments on a task |
| `POST` | `/api/tasks/{id}/comments` | Add a comment |
| `DELETE` | `/api/comments/{id}` | Delete a comment |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/{id}` | Get an agent |
| `GET` | `/api/agents/{id}/activity` | Agent activity log |
| `GET` | `/api/agents/{id}/metrics` | Agent metrics |
| `PUT` | `/api/agents/{id}/status` | Update agent status |
| `POST` | `/api/agents/{id}/pause` | Pause an agent |
| `POST` | `/api/agents/{id}/resume` | Resume an agent |
| `POST` | `/api/agents/{id}/kill` | Kill an agent |

### Agent Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/{id}/health` | Get health status |
| `POST` | `/api/agents/{id}/health/check` | Run a health check |
| `POST` | `/api/agents/{id}/health/auto-restart` | Configure auto-restart |

### Agent Soul (Personality)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/{id}/soul` | Read the agent's SOUL file |
| `PUT` | `/api/agents/{id}/soul` | Update the agent's SOUL file |

### Agent Extended

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/{id}/skills` | Agent's skills |
| `GET` | `/api/agents/{id}/timeline` | Activity timeline |
| `GET` | `/api/agents/{id}/commits` | Git commit history |
| `GET` | `/api/agents/{id}/annotations` | Agent notes/annotations |
| `POST` | `/api/agents/{id}/annotations` | Add an annotation |
| `DELETE` | `/api/agents/{id}/annotations/{ann_id}` | Delete an annotation |

### Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/{id}/snapshots` | List snapshots |
| `POST` | `/api/agents/{id}/snapshots` | Create a snapshot |
| `POST` | `/api/agents/{id}/snapshots/{sid}/restore` | Restore a snapshot |

### Activity & Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/activity` | Global activity feed |
| `GET` | `/api/dashboard/stats` | Dashboard statistics |
| `GET` | `/api/dashboard/teams` | Team overview |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Analytics overview |
| `GET` | `/api/analytics/agents` | Per-agent analytics |
| `GET` | `/api/analytics/throughput` | Task throughput |
| `GET` | `/api/analytics/team` | Team analytics |
| `GET` | `/api/analytics/tokens` | Token usage |
| `GET` | `/api/analytics/tokens/timeline` | Token usage over time |
| `GET` | `/api/analytics/cost/summary` | Cost summary |
| `GET` | `/api/analytics/performance` | Performance metrics |
| `GET` | `/api/analytics/export/csv` | Export analytics as CSV |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/report` | Report data |
| `GET` | `/api/report/html` | HTML report |
| `GET` | `/api/report/markdown` | Markdown report |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metrics/latency` | Latency metrics |
| `GET` | `/api/metrics/cost-forecast` | Cost forecast |
| `GET` | `/api/metrics/efficiency` | Efficiency metrics |

### Custom Dashboards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboards` | List custom dashboards |
| `POST` | `/api/dashboards` | Create a custom dashboard |
| `GET` | `/api/dashboards/{id}` | Get a dashboard |
| `PUT` | `/api/dashboards/{id}` | Update a dashboard |
| `DELETE` | `/api/dashboards/{id}` | Delete a dashboard |

### Environments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/environments` | List environments |
| `POST` | `/api/environments` | Add an environment |
| `DELETE` | `/api/environments` | Remove an environment |
| `POST` | `/api/environments/switch` | Switch active environment |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Register a webhook |
| `PUT` | `/api/webhooks/{id}` | Update a webhook |
| `DELETE` | `/api/webhooks/{id}` | Remove a webhook |
| `POST` | `/api/webhooks/{id}/test` | Send a test event |

### Branding & Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/branding` | Get branding config |
| `GET` | `/api/documents` | List documents |
| `GET` | `/api/documents/content?path={path}` | Read a document |

### OpenClaw Live Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/openclaw/agents` | Live agent list from OpenClaw |
| `GET` | `/api/openclaw/agents/{name}` | Single agent details |
| `GET` | `/api/openclaw/stream` | Live activity stream |
| `GET` | `/api/openclaw/stats` | Aggregate stats |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Log in |
| `POST` | `/api/auth/logout` | Log out |
| `GET` | `/api/auth/me` | Current user |

---

## ⚙️ Configuration

### `agents.yaml`

The agent registry file defines your team hierarchy. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Team/org display name |
| `openclaw_dir` | string | Path to your OpenClaw directory (for SOUL files, workspace data) |
| `agents` | array | Top-level agents (recursive `children` for hierarchy) |

Each agent entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique ID — must match `workspace-{id}` directory |
| `name` | string | ✅ | Display name |
| `emoji` | string | | Single emoji |
| `role` | string | | Role description |
| `team` | string | | Team name for grouping |
| `team_color` | string | | CSS hex color |
| `is_lead` | bool | | Whether this agent leads their team |
| `children` | array | | Nested child agents |

> 💡 **Hot reload:** Send `SIGHUP` to the backend process to reload `agents.yaml` without restart.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8891` | Server port |
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `agentboard` | Database user |
| `DB_PASSWORD` | `agentboard` | Database password |
| `DB_NAME` | `agentboard` | Database name |
| `AGENTS_CONFIG` | `agents.yaml` | Path to agent registry file |
| `OPENCLAW_DIR` | | Path to OpenClaw directory (mounted into container) |
| `FRONTEND_DIR` | `frontend/` | Path to frontend static files |

---

## ❓ FAQ

**Q: My agents aren't showing up in the org chart / soul viewer**
A: Make sure each agent's `id` in `agents.yaml` matches its OpenClaw workspace directory name. For example, agent `forge` needs a directory at `{OPENCLAW_DIR}/workspace-forge/`. Also verify `OPENCLAW_DIR` is set and mounted correctly in `docker-compose.yml`.

**Q: Can I use NerveCenter without OpenClaw?**
A: Yes. The kanban, tasks, comments, and analytics work standalone. Agent SOUL files and OpenClaw live integration features require the `OPENCLAW_DIR` mount.

**Q: How do I add a new agent?**
A: Add an entry to `agents.yaml` and send `SIGHUP` to the backend process (or restart the container). The agent will appear in the UI immediately.

**Q: WebSocket feed isn't updating**
A: Make sure your proxy (nginx, etc.) is configured for WebSocket upgrade on the `/api/activity` or `/api/openclaw/stream` paths.

**Q: How do I reset the database?**
A: Stop the containers, remove the volume (`docker volume rm nervecenter_agentboard_pgdata`), and start again. The schema is auto-migrated on startup.

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-thing`)
3. Commit your changes (`git commit -m 'feat: add amazing thing'`)
4. Push to the branch (`git push origin feature/amazing-thing`)
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
