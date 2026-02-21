# AgentBoard Roadmap

This document outlines the planned development trajectory for AgentBoard — from stabilization through platform-scale features.

> **Status key:** ✅ Complete · 🚧 In Progress · 📋 Planned

---

## v0.x — Stabilization ✅ Complete

Foundation work: getting the core solid, documented, and visually professional.

| Item | Status |
|---|---|
| Core dashboard (agent list, status, memory viewer) | ✅ |
| Kanban board with task management | ✅ |
| Global search (`Cmd+K`) | ✅ |
| Agent performance cards | ✅ |
| Bug fixes — agent visibility, sidebar, memory loading, timestamps | ✅ |
| README rewrite & documentation | ✅ |
| Kanban integration guide for agent developers | ✅ |
| Professional redesign v2.0 (dark theme, design tokens, SVG icons, logomark, timeline) | ✅ |
| Theme toggle (light/dark) | ✅ |

---

## v1.0 — Core Power Features 🚧 In Progress

The features that make AgentBoard genuinely powerful for running and monitoring an AI agent team.

| Feature | Description | Status |
|---|---|---|
| **Token & Cost Tracker** | Real-time and cumulative token usage per agent; estimated cost breakdown | 📋 |
| **Error Dashboard** | Centralized error log with severity levels, stack traces, and agent attribution | 📋 |
| **Direct Agent Messaging** | Send messages or commands directly to a specific agent from the UI | 📋 |
| **Pause / Resume / Kill** | Lifecycle controls for running agent sessions | 📋 |
| **Task Creator** | Create and assign kanban tasks from within AgentBoard without API calls | 📋 |
| **Webhook Notifications** | Push events (task complete, agent error, etc.) to external endpoints | 📋 |
| **Alerting Rules** | Define conditions that trigger notifications (e.g. agent idle >1h, error rate spike) | 📋 |
| **Log Viewer with Search** | Full-text search across agent logs with date filtering and highlighting | 📋 |
| **Daily / Weekly Reports** | Auto-generated summaries of agent activity, tasks completed, and cost | 📋 |

---

## v1.x — Team & Integrations 📋 Planned

Collaboration features and external integrations for teams operating multiple agents.

| Feature | Description |
|---|---|
| **User Accounts** | Multi-user support with login, roles, and per-user preferences |
| **Shared Annotations** | Attach notes to tasks, agent sessions, and log entries — visible to all team members |
| **Audit Log** | Immutable record of all actions taken via the dashboard (who did what, when) |
| **GitHub Integration** | Link tasks to commits and PRs; surface repo activity alongside agent activity |
| **REST API** | Public API for querying agent status, tasks, and logs from external tools |
| **Cost Forecasting** | Project monthly spend based on current usage trends |
| **Agent Timeline** | Visual Gantt-style view of what each agent was doing over a time range |
| **Memory Editor** | View and edit agent memory files directly from the dashboard |
| **Bulk Operations** | Select multiple tasks or agents and apply actions in one click |

---

## v2.0 — Platform 📋 Planned

AgentBoard as a product — scalable, deployable, and extensible beyond a single team.

| Feature | Description |
|---|---|
| **Cloud-Hosted Mode** | Managed SaaS deployment — no self-hosting required |
| **Agent Marketplace** | Browse, install, and configure pre-built agents from a shared registry |
| **Custom Dashboard Builder** | Drag-and-drop widget layout — build views tailored to your team's workflow |
| **Multi-Environment Support** | Manage dev, staging, and production agent clusters from one interface |
| **Agent Efficiency Score** | Composite metric scoring each agent on task throughput, error rate, and cost |

---

## Contributing

AgentBoard is built collaboratively by the agent team. If you're an agent working on a feature:

1. Claim the task on the kanban board
2. Branch from `main`, implement, and open a PR
3. Update this roadmap and `CHANGELOG.md` when the feature ships

See the [Kanban Integration Guide](./README.md#kanban-integration-for-agent-developers) for API details.
