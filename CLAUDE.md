# NerveCenter — Agent Management Dashboard

Open-source dashboard for managing AI agent teams. Kanban boards, org charts, live feeds, and analytics.

**⚠️ This is a PUBLIC open-source repo (MIT license). Do NOT include any secrets, API keys, passwords, internal company details, or private infrastructure information.**

## Personality

You are a sharp, direct full-stack developer. Concise, efficient, no fluff. Dry humor is fine.

## Tech Stack

- **Backend**: Go
- **Frontend**: Vanilla JavaScript (no framework)
- **Database**: PostgreSQL
- **Deployment**: Docker Compose
- **Port**: 8891

## Architecture

```
agentboard-fresh/
├── main.go              # Entry point
├── handlers/            # HTTP handlers
├── static/              # Frontend JS, CSS, HTML
│   ├── js/
│   │   ├── kanban.js    # Kanban board
│   │   ├── orgchart.js  # D3 org chart
│   │   ├── feed.js      # Live WebSocket feed
│   │   └── analytics.js # Analytics dashboard
│   └── css/
├── migrations/          # SQL migrations
├── docker-compose.yml
└── Dockerfile
```

## Features

- **Kanban Board**: Drag-and-drop task management with columns (Backlog, In Progress, Review, Done)
- **Soul Viewer**: View and edit agent personality/configuration files
- **Org Chart**: D3.js-powered interactive organization chart
- **Live Feed**: Real-time WebSocket feed of agent activity
- **White Labeling**: Configurable branding (logo, colors, name) per deployment
- **Analytics**: Agent performance metrics and visualizations

## API

- **Authentication**: `X-API-Key` header required for all write operations (POST/PUT/DELETE)
- **Read access**: GET endpoints are unauthenticated
- **Base path**: `/api/...`

### Key Endpoints

- `GET /api/tasks` — List all tasks
- `POST /api/tasks` — Create task (requires API key)
- `PUT /api/tasks/{id}` — Update task (requires API key)
- `DELETE /api/tasks/{id}` — Delete task (requires API key)
- `POST /api/tasks/{id}/transition` — Move task between columns (**⚠️ has known bug**)
- `GET /api/agents` — List agents
- `GET /api/feed` — WebSocket live feed

## Deployment

- **Domain**: nervecenter.io
- **Stack**: Docker Compose (Go app + PostgreSQL)
- **Start**: `docker compose up -d`

## Conventions

- Vanilla JS — no npm, no build step, no framework
- D3.js loaded from CDN for org chart
- WebSocket for real-time updates
- White labeling configured via environment variables or API

## Known Issues

- **Transition API bug**: `POST /api/tasks/{id}/transition` has a SQL type error (`pq: inconsistent types deduced for parameter $1`). Workaround: use direct task update (`PUT /api/tasks/{id}`) to change column instead.
