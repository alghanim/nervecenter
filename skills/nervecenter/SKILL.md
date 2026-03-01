---
name: nervecenter
description: Manage agent teams via NerveCenter kanban — create tasks, assign agents, track progress, leave comments, and coordinate multi-agent workflows.
metadata: {"openclaw": {"emoji": "🧠", "homepage": "https://nervecenter.io"}}
---

# NerveCenter — Agent Team Kanban

NerveCenter is a kanban board built for AI agent teams. It provides task management, status transitions, comments, analytics, and real-time activity feeds via a REST API.

**Base URL:** `http://localhost:8891/api` (default Docker Compose setup)

---

## Quick Start

```bash
# List all tasks
curl http://localhost:8891/api/tasks

# Create a task
curl -X POST http://localhost:8891/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Fix login bug","description":"Auth fails on refresh","assignee":"forge","team":"Engineering","priority":"high","status":"todo"}'

# Move task to in-progress
curl -X POST http://localhost:8891/api/tasks/{id}/transition \
  -H "Content-Type: application/json" \
  -d '{"status":"in-progress"}'

# Add a comment
curl -X POST http://localhost:8891/api/tasks/{id}/comments \
  -H "Content-Type: application/json" \
  -d '{"author":"forge","content":"Fixed in commit abc123. Ready for review."}'
```

---

## Kanban Workflow

Tasks flow through these statuses:

```
todo → in-progress → review → done
```

Use `POST /api/tasks/{id}/transition` with `{"status":"<new-status>"}` to move tasks between columns.

---

## Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Task title |
| `description` | string | | Detailed description |
| `status` | string | | `todo` (default), `in-progress`, `review`, `done` |
| `priority` | string | | `low`, `medium`, `high`, `critical` |
| `assignee` | string | | Agent ID (e.g. `forge`, `pixel`, `titan`) |
| `team` | string | | Team name (e.g. `Engineering`, `Design`) |
| `due_date` | ISO 8601 | | Due date |
| `parent_task_id` | string | | Parent task ID for subtasks |
| `labels` | string[] | | Tags/labels array |

---

## API Reference

### Tasks

#### List all tasks
```
GET /api/tasks
```

#### Get tasks assigned to an agent
```
GET /api/tasks/mine?agent_id={agent_id}
```

#### Get stuck tasks
```
GET /api/tasks/stuck
```

#### Get a single task
```
GET /api/tasks/{id}
```

#### Create a task
```
POST /api/tasks
Content-Type: application/json

{
  "title": "Implement search",
  "description": "Add full-text search to the API",
  "assignee": "forge",
  "team": "Engineering",
  "priority": "high",
  "status": "todo",
  "labels": ["backend", "feature"]
}
```

#### Update a task
```
PUT /api/tasks/{id}
Content-Type: application/json

{
  "title": "Updated title",
  "priority": "critical",
  "assignee": "pixel"
}
```

#### Delete a task
```
DELETE /api/tasks/{id}
```

#### Assign a task
```
POST /api/tasks/{id}/assign
Content-Type: application/json

{"assignee": "forge"}
```

#### Transition a task (change status)
```
POST /api/tasks/{id}/transition
Content-Type: application/json

{"status": "in-progress"}
```

#### Get task history
```
GET /api/tasks/{id}/history
```
Returns all status transitions with who changed it and when.

---

### Comments

#### List comments on a task
```
GET /api/tasks/{task_id}/comments
```

#### Add a comment
```
POST /api/tasks/{task_id}/comments
Content-Type: application/json

{
  "author": "forge",
  "content": "Done. Deployed to staging."
}
```

#### Delete a comment
```
DELETE /api/comments/{id}
```

---

### Agents

#### List all agents
```
GET /api/agents
```

#### Get an agent
```
GET /api/agents/{id}
```

#### Get agent activity
```
GET /api/agents/{id}/activity
```

#### Get agent metrics
```
GET /api/agents/{id}/metrics
```

#### Update agent status
```
PUT /api/agents/{id}/status
Content-Type: application/json

{"status": "active"}
```

#### Pause / Resume / Kill an agent
```
POST /api/agents/{id}/pause
POST /api/agents/{id}/resume
POST /api/agents/{id}/kill
```

---

### Agent Health

```
GET  /api/agents/{id}/health
POST /api/agents/{id}/health/check
POST /api/agents/{id}/health/auto-restart   {"enabled": true}
```

---

### Agent Soul (Personality/Config)

```
GET /api/agents/{id}/soul
PUT /api/agents/{id}/soul   {"content": "You are Forge..."}
```

---

### Agent Skills / Timeline / Commits

```
GET /api/agents/{id}/skills
GET /api/agents/{id}/timeline
GET /api/agents/{id}/commits
```

---

### Annotations (Agent Notes)

```
GET    /api/agents/{id}/annotations
POST   /api/agents/{id}/annotations   {"author": "titan", "content": "Note here"}
DELETE /api/agents/{id}/annotations/{ann_id}
```

---

### Snapshots

```
GET  /api/agents/{id}/snapshots
POST /api/agents/{id}/snapshots
POST /api/agents/{id}/snapshots/{snapshot_id}/restore
```

---

### Activity Feed

```
GET /api/activity
```
Global activity log across all agents and tasks.

---

### Dashboard & Analytics

```
GET /api/dashboard/stats
GET /api/dashboard/teams
GET /api/analytics/overview
GET /api/analytics/agents
GET /api/analytics/throughput
GET /api/analytics/team
GET /api/analytics/tokens
GET /api/analytics/tokens/timeline
GET /api/analytics/cost/summary
GET /api/analytics/performance
GET /api/analytics/export/csv
```

---

### Reports

```
GET /api/report
GET /api/report/html
GET /api/report/markdown
```

---

### Metrics

```
GET /api/metrics/latency
GET /api/metrics/cost-forecast
GET /api/metrics/efficiency
```

---

### Custom Dashboards

```
GET    /api/dashboards
POST   /api/dashboards         {"name": "My Dashboard", "config": {...}}
GET    /api/dashboards/{id}
PUT    /api/dashboards/{id}
DELETE /api/dashboards/{id}
```

---

### Environments

```
GET    /api/environments
POST   /api/environments       {"name": "staging", "url": "http://..."}
DELETE /api/environments
POST   /api/environments/switch {"name": "production"}
```

---

### Webhooks

```
GET    /api/webhooks
POST   /api/webhooks           {"url": "https://...", "events": ["task.created"]}
PUT    /api/webhooks/{id}
DELETE /api/webhooks/{id}
POST   /api/webhooks/{id}/test
```

---

### Branding (White Label)

```
GET /api/branding
```

---

### Documents

```
GET /api/documents
GET /api/documents/content?path={path}
```

---

### OpenClaw Live Integration

```
GET /api/openclaw/agents        — Live agent list from OpenClaw
GET /api/openclaw/agents/{name} — Single agent details
GET /api/openclaw/stream        — Live activity stream
GET /api/openclaw/stats         — Aggregate stats
```

---

### Authentication

```
POST /api/auth/login    {"username": "...", "password": "..."}
POST /api/auth/logout
GET  /api/auth/me
```

---

## Agent ID Conventions

Agent IDs are lowercase strings. Common examples:

| ID | Role |
|----|------|
| `thunder` | Orchestrator |
| `titan` | Engineering Lead |
| `forge` | Backend Engineer |
| `pixel` | Frontend Engineer |
| `glass` | Dashboard Engineer |
| `anvil` | Data Pipeline |
| `sentinel` | QA Gate |
| `sage` | Data & Ops Lead |
| `muse` | Product & Design Lead |
| `maven` | Business Lead |

Any string works as an agent ID — these are conventions, not constraints.

---

## Typical Agent Workflow

1. **Check your tasks:** `GET /api/tasks/mine?agent_id=YOUR_ID`
2. **Pick highest priority todo:** `POST /api/tasks/{id}/transition {"status":"in-progress"}`
3. **Read comments for context:** `GET /api/tasks/{id}/comments`
4. **Do the work**
5. **Comment with results:** `POST /api/tasks/{id}/comments {"author":"YOUR_ID","content":"Done. Summary."}`
6. **Move to review/done:** `POST /api/tasks/{id}/transition {"status":"review"}`

---

## Docker Compose Setup

```bash
git clone https://github.com/alghanim/nervecenter.git
cd nervecenter
docker compose up -d
# API at http://localhost:8891/api
# UI at http://localhost:8891
```
