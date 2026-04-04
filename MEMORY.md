# NerveCenter — Project Memory

Chronological log of major features and decisions.

**⚠️ PUBLIC REPO — no secrets, no internal details.**

---

## Initial Setup (2026-02)

- Go backend + vanilla JS frontend + PostgreSQL
- Docker Compose deployment
- Port 8891
- Domain: nervecenter.io

## Kanban Board

- Drag-and-drop task management
- Columns: Backlog, In Progress, Review, Done
- Task creation, editing, deletion via API
- API key authentication for write operations

## Soul Viewer

- View and edit agent configuration files
- Markdown rendering for soul/personality documents

## D3 Org Chart

- Interactive organization chart using D3.js
- Hierarchical agent structure visualization
- Expandable/collapsible nodes

## WebSocket Live Feed

- Real-time activity feed
- Agent actions streamed via WebSocket
- Auto-reconnect on disconnect

## White Labeling

- Configurable branding per deployment
- Custom logo, colors, and name
- Environment variable or API-based configuration

## Analytics Dashboard

- Agent performance metrics
- Task completion rates
- Activity visualizations

## Known Bugs

- **Transition API**: `POST /api/tasks/{id}/transition` has SQL type error (`pq: inconsistent types deduced for parameter $1`). Root cause: parameter type mismatch in prepared statement. Workaround: use `PUT /api/tasks/{id}` to change column directly.

## Key Decisions

- **Vanilla JS**: No framework dependency — keeps the project simple and deployable anywhere
- **D3 from CDN**: No build step needed for org chart visualization
- **API key for writes only**: GETs are public (read-only is safe), writes need authentication
- **MIT License**: Open source, free for anyone to use and modify
