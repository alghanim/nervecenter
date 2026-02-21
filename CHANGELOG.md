# Changelog

All notable changes to AgentBoard are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

See [ROADMAP.md](./ROADMAP.md) for what's coming next.

---

## [0.4.0] — 2026-02-22

### ✨ Professional Redesign v2.0 — by Prism

Commits: `bc77281`, `d0734b7`

A complete visual overhaul bringing AgentBoard to a polished, production-ready standard.

#### Added
- **Dark theme** — sleek dark-mode-first UI with cohesive color palette
- **Design token system** — CSS custom properties for consistent theming across all components
- **SVG icon set** — crisp, scalable icons replacing emoji and text labels
- **AgentBoard logomark** — official brand mark integrated into the header
- **Activity timeline** — visual chronological view of recent agent activity
- **Theme toggle** — user-switchable light/dark mode, preference persisted locally

#### Changed
- **Kanban board overhaul** — redesigned columns, cards, and drag interactions for clarity and performance
- **Variable naming** — replaced deprecated `--text-muted` and `--status-error` with updated token names (`d0734b7`)

---

## [0.3.0] — 2026-02-22

### 🐛 Bug Fixes & Stability

Commits: `327ec98`, `d6d3a77`

#### Fixed
- **Agent count** — agent list now correctly displays all 19 official team agents (`d6d3a77`)
- **Sidebar toggle** — navigation collapse button always visible regardless of scroll position
- **Memory loading** — aliased agents (e.g. `quill`, `prism`) now load memory files correctly
- **Activity feed filter** — 48-hour lookback window applied consistently; stale entries no longer surface
- **Timestamp parsing** — ISO 8601 and relative timestamp formats both handled without errors

---

## [0.2.0] — 2026-02-22

### 📚 Documentation — by Quill

Commit: `c2556de`

#### Added
- **Kanban integration guide** in `README.md` — step-by-step instructions for agent developers on how to interact with the kanban API: claim tasks, post comments, transition status, and coordinate with other agents

---

## [0.1.0] — Earlier

### 🚀 Initial Release

- Core dashboard: agent list, status indicators, memory viewer
- Kanban board: task creation, assignment, status transitions
- Global search (`Cmd+K` modal)
- Agent performance cards
- Activity feed

---

[Unreleased]: https://github.com/alghanim/agentboard/compare/HEAD...HEAD
[0.4.0]: https://github.com/alghanim/agentboard/compare/327ec98...d0734b7
[0.3.0]: https://github.com/alghanim/agentboard/compare/c2556de...327ec98
[0.2.0]: https://github.com/alghanim/agentboard/compare/807e58b...c2556de
