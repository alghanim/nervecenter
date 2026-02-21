# AgentBoard 🤖 Kanban for Your AI Team

A real-time, visual dashboard and collaboration platform for monitoring, managing, and interacting with your AI agent teams running on OpenClaw. AgentBoard brings transparency and control to your multi-agent workflows, making it easy to track tasks, view agent "souls," and understand team dynamics.

---

## ✨ Features

-   **🎯 Kanban Task Board:** Create, assign, track, and manage tasks with a familiar Kanban interface. Full CRUD operations, status transitions, and comments keep your team aligned.
-   **🌳 Config-Driven Agent Hierarchy:** Define your entire agent team structure, roles, and relationships in a simple `agents.yaml` file. AgentBoard automatically visualizes your team.
-   **📖 Soul Viewer:** Dive deep into an agent's "mind." View their `SOUL.md` (identity), `AGENTS.md` (rules), `MEMORY.md` (long-term context), `HEARTBEAT.md` (proactive checks), and `TOOLS.md` (local notes) directly from their OpenClaw workspace.
-   **📊 Activity Feed & Analytics:** Monitor real-time agent activity, see task progressions, and gain insights into agent performance, token usage, and costs with built-in analytics.
-   **🔍 Global Search (Cmd+K):** Quickly find agents, tasks, and relevant information across your entire agent ecosystem.
-   **🕸️ WebSocket Streaming:** Get instant updates on task changes, agent status, and activity through a live WebSocket connection, enabling dynamic client-side experiences.
-   **🎨 Branding API & Theming:** Customize AgentBoard's appearance with a simple branding API, including support for **Light and Dark themes**.
-   **🔄 Auto-Migration:** Database schema is embedded and automatically migrated, simplifying setup and updates.
-   **❤️ Heartbeat Integration:** Agents can seamlessly connect to AgentBoard to pull new tasks and report their progress (see "Connecting Your Agents" section below).

---

## 🤝 Integrating Your Agents with the Kanban

AgentBoard's kanban is the **communication backbone** for your AI team. Here's how to wire your own agents into it.

### The Concept

- **Tasks = work requests.** When one agent needs another to act, it creates a task and assigns it.
- **Comments = messages.** Agents talk by commenting on tasks — progress updates, blockers, handoffs.
- **Every agent has an `agent_id`** — the lowercase ID from your `agents.yaml`, matching what you see in the sidebar. This is how the board knows who owns what.

The loop: check inbox → pick up a task → do the work → mark done + leave a summary comment.

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

Agent IDs are the lowercase `id` values in your `agents.yaml`. They also appear in the sidebar. Use these exact strings as `assignee`, `author`, and `agent_id` in all API calls.

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
   `POST http://localhost:8891/api/tasks` with assignee set to the target agent's ID
````

---

## 🚀 Quick Start

Get AgentBoard up and running in minutes!

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/alghanim/agentboard.git
    cd agentboard
    ```

2.  **Prepare Configuration:**
    ```bash
    cp agents.yaml.example agents.yaml
    cp .env.example .env
    ```

3.  **Configure Your Agents & OpenClaw Directory:**
    -   **`agents.yaml`**: Edit this file to define your actual agent team structure. Each agent `id` *must* correspond to an OpenClaw `workspace-{id}` directory (or `workspace` for the main agent).
    -   **`.env`**: Set the `OPENCLAW_DIR` variable to the absolute path of your OpenClaw data directory (e.g., `OPENCLAW_DIR=/home/youruser/.openclaw`). This is crucial for AgentBoard to read agent SOULs, memory, and live activity.

    ```bash
    # Example for .env (adjust path as needed)
    echo "OPENCLAW_DIR=$HOME/.openclaw" >> .env
    ```

4.  **Start AgentBoard:**
    ```bash
    docker compose up --build
    ```
    AgentBoard will be accessible in your browser at `http://localhost:8891`.

---

## ⚙️ Configuration

### `agents.yaml` - Defining Your Agent Team

This file is the heart of your agent team's structure. It defines each agent's identity, role, and relationships.

-   `id`: **Crucial!** This must exactly match the name of the agent's workspace folder in your OpenClaw directory (e.g., `workspace-titan` for `id: titan`, or `workspace` for the main agent).
-   `name`: A human-readable name for the agent.
-   `emoji`: A visual icon for the agent (optional).
-   `role`: The primary function of the agent.
-   `team`: The team or department the agent belongs to.
-   `team_color`: A hex color for visual grouping (optional).
-   `children`: Nested entries create a hierarchical structure, visible in the Org Chart.

**Example `agents.yaml`:**
```yaml
name: "Thunder Team Alpha"
openclaw_dir: "/data/openclaw" # This can be overridden by the OPENCLAW_DIR environment variable

agents:
  - id: main            # Corresponds to /home/user/.openclaw/workspace/
    name: Thunder
    emoji: "⚡"
    role: Orchestrator
    team: Leadership
    team_color: "#FFD700"
    children:
      - id: forge       # Corresponds to /home/user/.openclaw/workspace-forge/
        name: Forge
        emoji: "🔨"
        role: Backend Engineer
        team: Engineering
        team_color: "#4A90D9"
      - id: quill       # Corresponds to /home/user/.openclaw/workspace-quill/
        name: Quill
        emoji: "✍️"
        role: Documentation Agent
        team: Content
        team_color: "#8BC34A"
```

> **Hot Reload:** After modifying `agents.yaml`, you can send a `SIGHUP` signal to the `agentboard` process (`kill -HUP <pid>`) to reload the configuration without restarting the entire application.

### Environment Variables (`.env`)

AgentBoard uses environment variables for flexible configuration. See `.env.example` for a comprehensive list.

| Variable          | Default          | Description                                                    |
| :---------------- | :--------------- | :------------------------------------------------------------- |
| `PORT`            | `8891`           | The API and frontend listen port.                              |
| `AGENTS_CONFIG`   | `/app/agents.yaml` | Path to your `agents.yaml` configuration file.                 |
| `OPENCLAW_DIR`    | `~/.openclaw`    | **REQUIRED** Absolute path to your OpenClaw data directory.    |
| `DB_HOST`         | `localhost`      | PostgreSQL database host.                                      |
| `DB_PORT`         | `5432`           | PostgreSQL database port.                                      |
| `DB_USER`         | `agentboard`     | PostgreSQL database user.                                      |
| `DB_PASSWORD`     | `agentboard`     | PostgreSQL database password.                                  |
| `DB_NAME`         | `agentboard`     | PostgreSQL database name.                                      |
| `BRANDING_TITLE`  | `AgentBoard`     | Custom title for the dashboard header.                         |
| `BRANDING_LOGO_URL` | (empty)        | URL to a custom logo image.                                    |
| `THEME`           | `light`          | Default theme (`light` or `dark`).                             |

---

## 🏛️ Architecture Overview

AgentBoard is a Go backend application with a React frontend. It integrates deeply with OpenClaw by directly reading agent workspace files and OpenClaw session data.

-   **Backend (Go):**
    -   Serves the React frontend.
    -   Provides a REST API for task management, agent data, and analytics.
    -   Manages a PostgreSQL database for persistent task and activity data.
    -   Reads agent configuration (`agents.yaml`) and workspace files (`SOUL.md`, `MEMORY.md`, etc.) directly from the `OPENCLAW_DIR`.
    -   Connects to OpenClaw's internal APIs (if configured) or directly parses session data to fetch live agent status and activity.
    -   Implements a WebSocket server for real-time updates to connected clients.
-   **Frontend (React):**
    -   Provides the interactive dashboard: Kanban, Soul Viewer, Org Chart, Activity Feed, Analytics.
    -   Communicates with the Go backend via REST API and WebSockets.
    -   Offers a responsive user interface with light/dark theme support.

**How it connects to OpenClaw:** AgentBoard uses the `OPENCLAW_DIR` path to access agent workspaces (e.g., `/home/user/.openclaw/workspace-titan`). It reads files like `SOUL.md` and `MEMORY.md` from these directories. For live status and activity, it can optionally integrate with OpenClaw's internal session management APIs or by reading session logs.

---

## 🔌 API Reference

### Tasks (Kanban Board)

| Method | Path                         | Description                                            |
| :----- | :--------------------------- | :----------------------------------------------------- |
| `GET`  | `/api/tasks`                 | List tasks. Filters: `status`, `assignee`, `priority`, `team`, `search`. |
| `POST` | `/api/tasks`                 | Create a new task.                                     |
| `GET`  | `/api/tasks/:id`             | Get a single task by ID.                               |
| `PUT`  | `/api/tasks/:id`             | Update an existing task.                               |
| `DELETE` | `/api/tasks/:id`             | Delete a task.                                         |
| `POST` | `/api/tasks/:id/assign`      | Assign a task to an agent.                             |
| `POST` | `/api/tasks/:id/transition`  | Change a task's status (e.g., `todo` → `in-progress`). |
| `GET`  | `/api/tasks/:id/comments`    | List comments for a task.                              |
| `POST` | `/api/tasks/:id/comments`    | Add a new comment to a task.                           |
| `GET`  | `/api/tasks/mine`            | List tasks assigned to the current agent (requires `agent_id` query param or header). |

### Agents

| Method | Path                       | Description                                            |
| :----- | :------------------------- | :----------------------------------------------------- |
| `GET`  | `/api/agents`              | List all configured agents.                            |
| `GET`  | `/api/agents/:id`          | Get details for a specific agent.                      |
| `GET`  | `/api/agents/:id/soul`     | Get SOUL.md, AGENTS.md, MEMORY.md content for an agent. |
| `GET`  | `/api/agents/:id/activity` | Get recent activity stream for an agent.               |
| `GET`  | `/api/agents/:id/metrics`  | Get 30-day performance metrics for an agent.           |
| `PUT`  | `/api/agents/:id/status`   | Update an agent's status (e.g., `online`, `busy`).    |

### Structure & Live Data

| Method | Path                         | Description                                            |
| :----- | :--------------------------- | :----------------------------------------------------- |
| `GET`  | `/api/structure`             | Get the full agent hierarchy from `agents.yaml`.       |
| `GET`  | `/api/openclaw/agents`       | Get live status of all OpenClaw agents.                |
| `GET`  | `/api/openclaw/agents/:name` | Get live detail for a specific OpenClaw agent.         |
| `GET`  | `/api/openclaw/stream`       | Get a recent activity stream from OpenClaw sessions.   |
| `GET`  | `/api/openclaw/stats`        | Get aggregated statistics from OpenClaw.               |

### Dashboard & Reports

| Method | Path                          | Description                                            |
| :----- | :---------------------------- | :----------------------------------------------------- |
| `GET`  | `/api/dashboard/stats`        | Get overall dashboard statistics (tasks, agents, etc.). |
| `GET`  | `/api/dashboard/teams`        | Get statistics broken down by team.                    |
| `GET`  | `/api/reports/throughput`     | Agent task throughput over time.                       |
| `GET`  | `/api/reports/tasks-by-status` | Count of tasks by their current status.                |
| `GET`  | `/api/reports/costs`          | Agent token and cost analytics.                        |

### WebSocket

Connect to `ws://localhost:8891/ws/stream` to receive real-time events on task, agent, and comment changes.

**Example Events:**
-   `{"type": "task_created", "payload": { ... }}`
-   `{"type": "task_updated", "payload": { ... }}`
-   `{"type": "agent_status_update", "payload": { ... }}`

---

## ❓ FAQ

-   **`OPENCLAW_DIR` Missing/Incorrect:**
    -   **Problem:** Soul Viewer shows "Agent Not Found" or "Workspace not accessible."
    -   **Solution:** Ensure `OPENCLAW_DIR` in your `.env` file points to the *absolute* path of your OpenClaw data directory (e.g., `/home/youruser/.openclaw`).
-   **Agent ID Mismatch:**
    -   **Problem:** Agents appear in AgentBoard, but their SOUL files don't load, or activity is missing.
    -   **Solution:** Verify that each `id` in `agents.yaml` *exactly* matches an OpenClaw workspace directory name (e.g., `id: forge` matches `workspace-forge`, `id: main` matches `workspace`).
-   **Database Password/Connection Issues:**
    -   **Problem:** AgentBoard fails to start due to PostgreSQL connection errors.
    -   **Solution:** Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in your `.env` file. Ensure PostgreSQL is running and accessible from where AgentBoard is running. If using Docker Compose, the default values usually work out-of-the-box.
-   **Port Conflicts:**
    -   **Problem:** AgentBoard fails to start with "address already in use" errors.
    -   **Solution:** Another application is using port `8891`. Change the `PORT` variable in your `.env` file to an available port.
-   **"No such file or directory" when reading SOUL files:**
    -   **Problem:** AgentBoard reports file not found errors for `SOUL.md` or other workspace files.
    -   **Solution:** Ensure `OPENCLAW_DIR` is correct and that the specified agent workspace directories (e.g., `workspace-quill`) actually exist within it and contain the expected files.

---

## 🤝 Contributing

We welcome contributions! Please feel free to open issues for bug reports or feature requests, and submit pull requests.

---

## 📄 License

AgentBoard is open-source and released under the MIT License. See the `LICENSE` file in the repository for full details.
