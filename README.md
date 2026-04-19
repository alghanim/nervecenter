# AgentBoard - Your AI Team's Command Center 🚀

AgentBoard is a powerful, open-source web application designed to help you visualize, manage, and interact with your AI agent team. Built for orchestrators like Thunder, it provides a centralized dashboard to track agent activity, manage tasks, review their 'soul' files, and ensure your AI workforce operates smoothly.

## What it is

AgentBoard transforms raw agent data into actionable insights, providing:
- **Real-time visibility:** See what your agents are doing, saying, and thinking.
- **Task management:** Integrate with Kanban boards to assign and track agent tasks.
- **Knowledge base:** Easily access and manage agent 'soul' files and key documentation.
- **Performance monitoring:** Understand agent activity, usage, and efficiency.

## Who it's for

- **AI Orchestrators:** Manage complex multi-agent workflows with ease.
- **Developers:** Monitor agent behavior, debug interactions, and optimize performance.
- **Team Leaders:** Gain an overview of AI team productivity and project status.

## What problem it solves

In a multi-agent system, tracking individual agent activities, understanding their decision-making processes, and managing tasks can become overwhelming. AgentBoard centralizes this information, making it easy to:
- Prevent duplicate efforts between agents.
- Identify bottlenecks or failures in agent workflows.
- Ensure agents adhere to their 'soul' and operational guidelines.
- Provide a clear audit trail of all agent interactions.

## Quick Start ⚡

Get your AgentBoard up and running in minutes!

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/alghanim/agentboard.git
    cd agentboard
    ```

2.  **Configure your environment:**
    Create a `.env` file in the root directory:
    ```
    OPENCLAW_DIR=/home/aalghanim/.openclaw
    AGENTBOARD_PORT=8891
    KANBAN_API_URL=http://localhost:8889/api
    ```
    *Replace `/home/aalghanim/.openclaw` with the actual path to your OpenClaw directory.*

3.  **Install dependencies and run:**
    ```bash
    npm install
    npm start
    ```
    AgentBoard will be accessible at `http://localhost:8891`.

## Agents.yaml - Your Agent Manifest

The `agents.yaml` file defines the structure and metadata for your AI agents. It's crucial for AgentBoard to correctly display and manage your team.

**Example `agents.yaml`:**

```yaml
agents:
  thunder:
    id: thunder
    name: Thunder
    description: The main orchestrator and Ali's assistant.
    model: google/gemini-2.5-flash
    avatar: ⚡
    soulFile: /home/aalghanim/.openclaw/workspace/SOUL.md
    workspacePath: /home/aalghanim/.openclaw/workspace
  titan:
    id: titan
    name: Titan
    description: Engineering Lead.
    model: google/gemini-2.5-flash
    avatar: 🔩
    soulFile: /home/aalghanim/.openclaw/workspace-titan/SOUL.md
    workspacePath: /home/aalghanim/.openclaw/workspace-titan
```

-   **`id`**: Unique identifier for the agent (must match `workspace-{id}` directory name in OpenClaw).
-   **`name`**: Display name for the agent.
-   **`description`**: A brief overview of the agent's role.
-   **`model`**: The AI model used by the agent.
-   **`avatar`**: An emoji or path to an avatar image.
-   **`soulFile`**: Absolute path to the agent's `SOUL.md` file.
-   **`workspacePath`**: Absolute path to the agent's OpenClaw workspace.

## Features ✨

-   **Kanban Board Integration:** Visualize tasks, assign them to agents, and track progress through customizable stages (TODO, IN PROGRESS, REVIEW, DONE).
-   **Soul Viewer:** Directly view and compare `SOUL.md` files for each agent, ensuring alignment with their intended persona and rules.
-   **Org Chart:** See your agent team's hierarchy and reporting structure at a glance.
-   **Activity Feed:** A real-time log of agent messages, tool calls, and system events.
-   **Analytics Dashboard:** Monitor agent uptime, token usage, task completion rates, and other key performance indicators.
-   **Search Functionality:** Quickly find specific messages, tasks, or agent interactions.
-   **WebSocket Connectivity:** Real-time updates push directly to the UI without constant refreshing.
-   **Branding API:** Customize the look and feel of AgentBoard to match your organization's brand guidelines (colors, fonts, logo).
-   **Light/Dark Theme:** Switch between themes for optimal viewing comfort.

## API Reference

AgentBoard exposes a RESTful API for integration with other systems.

| Endpoint             | Method | Description                                    | Request Body Example              | Response Body Example                    |
|----------------------|--------|------------------------------------------------|-----------------------------------|------------------------------------------|
| `/api/tasks`         | `GET`  | Retrieve all tasks                             | -                                 | `[{ "id": "1", "title": "Task 1" }]`         |
| `/api/tasks`         | `POST` | Create a new task                              | `{ "title": "New Task", "agentId": "thunder" }` | `{ "id": "2", "title": "New Task" }`         |
| `/api/tasks/:id`     | `GET`  | Retrieve a specific task                       | -                                 | `{ "id": "1", "title": "Task 1" }`           |
| `/api/tasks/:id`     | `PUT`  | Update an existing task                        | `{ "status": "DONE" }`              | `{ "id": "1", "title": "Task 1", "status": "DONE" }` |
| `/api/agents`        | `GET`  | Retrieve all registered agents                 | -                                 | `[{ "id": "thunder", "name": "Thunder" }]` |
| `/api/agents/:id/soul` | `GET`  | Retrieve an agent's SOUL.md content         | -                                 | `"# SOUL.md\n..."`                    |
| `/api/activity`      | `GET`  | Retrieve recent agent activity                 | `?limit=10`                       | `[{ "agentId": "thunder", "message": "..." }]` |
| `/api/brand`         | `GET`  | Retrieve branding configuration                | -                                 | `{ "primaryColor": "#C5D92E" }`            |
| `/api/brand`         | `PUT`  | Update branding configuration                  | `{ "primaryColor": "#FF0000" }`     | `{ "primaryColor": "#FF0000" }`            |

**Authentication:** All POST/PUT/DELETE requests require an `X-API-Key` header for authentication. The key is configured in your `.env` file (e.g., `NC_AGENT_API_KEY=your_secret_key`).

## Agent-Kanban Integration (Heartbeat Example)

Agents can integrate with the Kanban board using the `exec` tool to make API calls. This allows them to update task statuses, create new tasks, or log progress.

**Example: Agent updating a task status during a heartbeat:**

```python
# Assuming the agent has a task ID stored in its memory
task_id = "abc-123"
new_status = "IN_PROGRESS"

# Example using curl via default_api.exec
print(default_api.exec(command=f'''
    curl -X PUT -H "Content-Type: application/json" \
         -H "X-API-Key: $NC_AGENT_API_KEY" \
         -d '{{"status": "{new_status}"}}' \
         http://localhost:8891/api/tasks/{task_id}
'''))
```

## Screenshots / Architecture

(Placeholder for future UI screenshot or architecture diagram)

## FAQ

-   **`OPENCLAW_DIR` is missing or incorrect:** Ensure your `.env` file correctly points to your OpenClaw installation directory. This is crucial for AgentBoard to locate agent workspaces and soul files.
-   **Agent ID does not match workspace name:** For AgentBoard to link agents correctly, the `id` in `agents.yaml` must match the `workspace-{id}` directory structure of your OpenClaw agents.
-   **API Key not working:** Verify that the `X-API-Key` header is correctly set in your requests and matches the `NC_AGENT_API_KEY` in your `.env` file.
-   **Port already in use:** If `8891` is in use, change `AGENTBOARD_PORT` in your `.env` file to another available port.

## Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for guidelines.

## License

This project is licensed under the MIT License.
