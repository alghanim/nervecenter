# AgentBoard Cloud-Hosted Mode — Strategy & Business Model

**Author:** Maven (Strategy & Business)  
**Date:** February 22, 2026  
**Status:** Draft — foundational planning, no code yet

---

## 1. Executive Summary

AgentBoard today runs locally — users clone the repo, spin up Docker, and manage everything on their own machine. A **cloud-hosted SaaS mode** removes that friction entirely: sign up, connect your agents, and go. This document covers architecture, pricing, data boundaries, onboarding, and go-to-market positioning.

---

## 2. Why Cloud-Hosted?

| Local-only limitation | Cloud unlock |
|---|---|
| Requires Docker, technical setup | Zero-install, works in browser |
| Single-machine, single-user | Team collaboration, shared views |
| No uptime guarantee | Always-on dashboard, webhooks, alerts |
| Hard to monetize | Recurring SaaS revenue |
| Manual updates | Continuous delivery, instant patches |

**Target users for cloud:** teams running 3+ agents who want visibility without DevOps overhead, agencies managing AI fleets for clients, and non-technical stakeholders who need a read-only view.

---

## 3. Hosting Architecture

### 3.1 Multi-Tenant Architecture (Recommended for V1)

```
┌──────────────────────────────────────────────┐
│              AgentBoard Cloud                │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Frontend │  │ API GW / │  │ WebSocket  │  │
│  │ (CDN)    │  │ Auth     │  │ Broker     │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │              │         │
│  ┌────┴──────────────┴──────────────┴──────┐  │
│  │          Shared Backend (Go)            │  │
│  │   tenant isolation via org_id FK        │  │
│  └────────────────┬────────────────────────┘  │
│              ┌────┴────┐                      │
│              │ Postgres │ (RLS per tenant)     │
│              └─────────┘                      │
└──────────────────────────────────────────────┘
         ▲               ▲
         │ HTTPS/WSS     │ Agent Gateway
    ┌────┴────┐    ┌─────┴──────┐
    │ Browser │    │ OpenClaw   │
    │  User   │    │ Agents     │
    └─────────┘    └────────────┘
```

**Key design decisions:**

- **Row-level security (RLS)** in Postgres — every table gets an `org_id` column. Tenants can never see each other's data.
- **Shared compute** — single backend deployment serves all tenants. Cost-efficient, simpler ops.
- **Agent Gateway** — agents connect outbound (no port-forwarding required) via persistent WebSocket or polling. This is the critical bridge between local agent runtime and cloud dashboard.

### 3.2 Future: Dedicated Tier

For enterprise customers (>50 agents, compliance needs):
- Isolated Postgres instance per tenant
- Dedicated backend pods (Kubernetes namespace isolation)
- Custom domain (e.g., `acme.agentboard.io`)
- SOC 2 / data residency options

### 3.3 Infrastructure Stack

| Component | Technology | Why |
|---|---|---|
| Compute | Fly.io or Railway (V1), AWS ECS (scale) | Fast deploy, low ops burden initially |
| Database | Managed Postgres (Supabase / Neon / RDS) | Native RLS, familiar, battle-tested |
| CDN/Frontend | Cloudflare Pages or Vercel | Edge-cached React app |
| WebSocket | Fly.io (built-in) or dedicated Soketi/Centrifugo | Real-time task updates |
| Auth | Clerk or Auth0 | OAuth, SSO, team management out of the box |
| Agent Gateway | Custom Go service (thin relay) | Bridges local agents ↔ cloud board |
| Object Storage | S3 / R2 | Agent soul files, attachments |

---

## 4. Data Boundaries — What Stays Local vs. Cloud

This is the most important trust decision. Users run AI agents with potentially sensitive data. Clear boundaries are essential.

### Cloud-Stored (Required for SaaS to function)

| Data | Rationale |
|---|---|
| Tasks (title, description, status, assignee) | Core product — the kanban |
| Comments on tasks | Collaboration feature |
| Agent metadata (name, role, team, avatar) | Display in dashboard |
| Activity feed events | Analytics & timeline |
| User accounts, billing, org membership | SaaS infrastructure |

### Local-Only (Never uploaded by default)

| Data | Rationale |
|---|---|
| SOUL.md, MEMORY.md, AGENTS.md | Agent identity — deeply personal, potentially contains secrets |
| Agent workspace files | Could contain credentials, API keys, private data |
| Conversation logs / session history | Privacy-sensitive |
| Tool configurations (TOOLS.md) | Infrastructure details |

### Optional Sync (User opts in)

| Data | Rationale |
|---|---|
| SOUL.md (read-only view) | "Soul Viewer" feature — opt-in per agent |
| HEARTBEAT.md | Useful for monitoring, but optional |
| Aggregated analytics (token usage, costs) | Budgeting — numbers only, no content |

**Principle:** The cloud dashboard is a *control plane*, not a *data plane*. Agent workspaces stay on user machines. The cloud sees tasks, status, and metadata — never raw agent memory or conversations.

---

## 5. Pricing Tiers

### Free — "Starter"
- **1 organization, up to 3 agents**
- Kanban board (full CRUD)
- Activity feed (7-day retention)
- Community support
- AgentBoard branding on dashboard
- *Goal: frictionless onboarding, convert to paid*

### Pro — $29/mo per org
- **Up to 15 agents**
- 90-day activity retention
- Analytics dashboard (token costs, task velocity)
- Custom branding / theming
- Webhook integrations (Slack, Discord, email alerts)
- Priority email support
- *Goal: solo developers and small teams*

### Team — $79/mo per org
- **Up to 50 agents**
- Unlimited activity retention
- Multi-user access (up to 10 seats, $8/seat additional)
- Role-based access control (admin, editor, viewer)
- Soul Viewer (opt-in agent identity display)
- SSO (Google, GitHub)
- API access for custom integrations
- *Goal: growing teams, agencies*

### Enterprise — Custom pricing
- **Unlimited agents**
- Dedicated infrastructure
- Custom domain
- SOC 2 compliance
- Data residency options (EU, US, etc.)
- SLA with uptime guarantee
- Dedicated support / onboarding
- Audit logs
- *Goal: large orgs, regulated industries*

### Usage-Based Add-ons
- Extra agents beyond tier limit: $3/agent/mo
- Extra seats beyond tier limit: $8/seat/mo
- Extended retention (1yr+): $10/mo

---

## 6. Onboarding Flow

### Step 1: Sign Up (30 seconds)
```
agentboard.io → "Get Started Free"
  → Sign up with GitHub / Google / email
  → Create organization name
  → Dashboard is immediately live (empty board)
```

### Step 2: Connect Your Agents (2 minutes)
```
Dashboard shows: "No agents connected yet"
  → Click "Connect Agents"
  → Shown a one-liner to add to agents.yaml:

    gateway:
      url: wss://gateway.agentboard.io
      token: ab_live_xxxxxxxxxxxx

  → Or environment variable:
    AGENTBOARD_GATEWAY=wss://gateway.agentboard.io
    AGENTBOARD_TOKEN=ab_live_xxxxxxxxxxxx

  → Agent pings gateway → appears in dashboard ✅
```

### Step 3: First Task (1 minute)
```
Dashboard shows: "Your agents are connected! Create your first task."
  → Guided task creation
  → Agent picks it up → user sees real-time status change
  → "🎉 Your first task is complete!" celebration moment
```

### Step 4: Invite Team (Optional)
```
Settings → Team → Invite by email
  → Viewer / Editor / Admin roles
```

**Total time to value: under 5 minutes.**

The key insight: the user's agents are already running locally via OpenClaw. AgentBoard Cloud is just a *window* into that existing system. No migration, no re-architecture — just connect and see.

---

## 7. Agent Gateway — The Bridge

The most critical technical component. How local agents talk to the cloud board.

### Design Principles
1. **Agents connect outbound** — no firewall/port-forwarding needed
2. **Lightweight** — small addition to existing OpenClaw agent loop
3. **Resilient** — reconnects automatically, queues events during disconnects
4. **Secure** — TLS, token-authenticated, org-scoped

### Protocol Options

| Option | Pros | Cons |
|---|---|---|
| **WebSocket (recommended)** | Real-time, bidirectional, low latency | Persistent connection management |
| HTTP Polling | Simple, stateless | Latency, wasteful |
| gRPC | Efficient, typed | Heavier dependency |

### Gateway Flow
```
Agent (local) ──WSS──→ Gateway (cloud) ──→ Backend ──→ Postgres
                                          ↓
                                    WebSocket Broker ──→ Browser
```

**Events from agent → cloud:**
- Task status transitions
- New comments
- Agent heartbeat (online/offline status)
- Analytics data (opt-in)

**Events from cloud → agent:**
- New task assigned
- Comment added to agent's task
- Configuration changes

---

## 8. Competitive Positioning

| | AgentBoard Cloud | Crew.ai Dashboard | LangSmith | Custom Grafana |
|---|---|---|---|---|
| AI-native kanban | ✅ | ❌ (code-first) | ❌ (traces) | ❌ |
| Agent identity (souls) | ✅ | ❌ | ❌ | ❌ |
| Framework-agnostic | ✅ (OpenClaw) | ❌ (CrewAI only) | Partial | ✅ |
| Zero-install cloud | ✅ | ✅ | ✅ | ❌ |
| Team collaboration | ✅ | Limited | Limited | ❌ |
| Self-host option | ✅ (OSS core) | ❌ | ❌ | ✅ |

**Positioning:** "The team dashboard your AI agents deserve. See what they're doing, assign work, track costs — without touching a terminal."

---

## 9. Open-Source + Cloud Strategy

Follow the **open-core model:**

- **Open source (free forever):** Core kanban, agent integration, local dashboard, API, WebSocket streaming
- **Cloud-only (paid):** Multi-user auth, SSO, analytics, retention, webhook integrations, Soul Viewer, custom branding, SLA

This keeps the community invested while creating clear value in the paid tier. Users who outgrow local hosting naturally upgrade.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Users don't trust cloud with agent data | Low adoption | Strict data boundaries, transparency, opt-in only |
| Self-hosted is "good enough" | No conversion | Cloud-only features (collab, analytics, SSO) |
| Pricing too high for indie devs | Churn | Generous free tier, usage-based scaling |
| Gateway reliability | User frustration | Queue + retry, graceful degradation, status page |
| Competition from framework vendors | Market share | Stay framework-agnostic, focus on UX |

---

## 11. Roadmap

### Phase 1 — Foundation (Months 1-2)
- Agent Gateway service (Go, WebSocket)
- Multi-tenant Postgres schema with RLS
- Auth (Clerk/Auth0 integration)
- Deploy to Fly.io / Railway
- Free tier live

### Phase 2 — Monetization (Months 3-4)
- Stripe billing integration
- Pro + Team tiers
- Analytics dashboard
- Webhook integrations

### Phase 3 — Growth (Months 5-6)
- Soul Viewer (opt-in)
- SSO
- Custom domains
- Public launch + Product Hunt

### Phase 4 — Enterprise (Months 7+)
- Dedicated infrastructure option
- Audit logs
- SOC 2 compliance
- Data residency

---

## 12. Success Metrics

| Metric | Target (6 months) |
|---|---|
| Free signups | 500+ |
| Paid conversions | 5-8% of free |
| MRR | $5,000+ |
| Agents connected | 2,000+ |
| Churn (monthly) | <5% |
| Time to value (signup → first task) | <5 minutes |

---

## 13. Summary

AgentBoard Cloud is the natural evolution: keep the open-source core for builders who want control, add a hosted layer for teams who want convenience. The moat is the **agent-native UX** — no one else treats AI agents as first-class team members with identities, kanban tasks, and collaboration tools.

Start lean (Fly.io, shared Postgres, generous free tier), prove demand, then scale infrastructure and features with revenue.

---

*This document is a living strategy brief. Update as architecture decisions are made and market feedback arrives.*
