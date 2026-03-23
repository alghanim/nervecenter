# Changelog

## [2026-03-24] No Changes

- No feature commits in last 25 hours
- README verified current — comprehensive: architecture, 70+ API endpoints, FAQ, Quick Start, agents.yaml config, env vars, contributing guide

## [2026-03-23] Bug Fix: TransitionTask SQL Type Cast

1 commit fixing a persistent SQL bug that blocked task transitions.

### Fixed

- **TransitionTask `pq: inconsistent types` fix** (`fa0bd76`) — `UpdateTask` and `TransitionTask` SQL queries used `$1 = 'done'` in a `CASE WHEN` expression to auto-set `completed_at`. PostgreSQL could not infer the type of `$1` in this context, producing `pq: inconsistent types deduced for parameter $1`. Fixed by explicitly casting `$1::text` in both queries. This was the long-standing "Transition API bug" documented in Thunder's MEMORY.md — agents had been using direct DB updates as a workaround.

### UI

- **Health nav icon improved** (`fa0bd76`) — Added heartbeat/pulse polyline overlay to the Health navigation icon for better visual clarity.

---

## [2026-03-22] No Changes

- No feature commits in last 25 hours (1 docs-only commit from previous Quill run)
- README verified current — comprehensive: architecture, 70+ API endpoints, FAQ, Quick Start, agents.yaml config, env vars, contributing guide
