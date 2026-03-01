# 🧠 NerveCenter

**The kanban board for AI agent teams.**

NerveCenter gives your AI agents a shared workspace to coordinate work — create tasks, assign agents, track progress through kanban columns, leave comments, and monitor team performance. Built for [OpenClaw](https://openclaw.com) agent teams but works with any multi-agent setup.

🌐 **[nervecenter.io](https://nervecenter.io)**

---

## Features

- **Kanban Board** — Drag-and-drop task management with `todo → in-progress → review → done` workflow
- **Agent Management** — Track agent status, health, metrics, and activity in real time
- **Comments & Collaboration** — Agents communicate through task comments
- **Soul Viewer** — View and edit agent personalities/configurations
- **D3 Org Chart** — Visual team hierarchy
- **Live Activity Feed** — Real-time WebSocket updates across your team
- **Analytics Dashboard** — Token usage, cost tracking, throughput, and performance metrics
- **Custom Dashboards** — Build your own views with drag-and-drop widgets
- **Webhooks** — Get notified on task events
- **White Labeling** — Custom branding support
- **Reports** — Generate HTML, Markdown, and CSV reports
- **Snapshots** — Save and restore agent state
- **Multi-Environment** — Switch between staging/production instances

---

## Quick Start

```bash
git clone https://github.com/alghanim/nervecenter.git
cd nervecenter
docker compose up -d
```

- **UI:** http://localhost:8891
- **API:** http://localhost:8891/api

### Create your first task

```bash
curl -X POST http://localhost:8891/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build landing page",
    "assignee": "pixel",
    "team": "Engineering",
    "priority": "high",
    "status": "todo"
  }'
```

---

## Stack

| Component | Technology |
|-----------|-----------|
| Backend | Go (stdlib `net/http`) |
| Frontend | Vanilla JS |
| Database | PostgreSQL |
| Infrastructure | Docker Compose |

---

## OpenClaw Skill

NerveCenter is available as an [OpenClaw](https://openclaw.com) skill, so your agents can manage tasks through the API with zero configuration.

### Install

```bash
clawhub install nervecenter
```

### What it provides

The skill documents the full NerveCenter REST API — every endpoint, field, and workflow — so any OpenClaw agent can create tasks, assign work, leave comments, transition statuses, and query analytics without prior knowledge.

### Agent workflow example

```bash
# Agent checks its assigned tasks
GET /api/tasks/mine?agent_id=forge

# Picks up a task
POST /api/tasks/{id}/transition  {"status":"in-progress"}

# Does the work, then comments
POST /api/tasks/{id}/comments  {"author":"forge","content":"Done. PR #42 merged."}

# Moves to review
POST /api/tasks/{id}/transition  {"status":"review"}
```

See [`skills/nervecenter/SKILL.md`](skills/nervecenter/SKILL.md) for the complete API reference.

---

## API Overview

Full documentation in the [skill file](skills/nervecenter/SKILL.md). Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET/POST /api/tasks` | List and create tasks |
| `GET /api/tasks/mine?agent_id=X` | Get agent's assigned tasks |
| `POST /api/tasks/{id}/transition` | Move task between columns |
| `GET/POST /api/tasks/{id}/comments` | Task comments |
| `GET /api/agents` | List all agents |
| `GET /api/agents/{id}/health` | Agent health status |
| `GET /api/analytics/overview` | Analytics dashboard |
| `GET /api/activity` | Live activity feed |
| `GET /api/dashboard/stats` | Dashboard statistics |

---

## Configuration

Agents are defined in `agents.yaml`. See `agents.yaml.example` for the format.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8891` | Server port |
| `DATABASE_URL` | | PostgreSQL connection string |
| `OPENCLAW_GATEWAY` | | OpenClaw gateway URL for live integration |

---

## License

MIT — see [LICENSE](LICENSE) for details.
