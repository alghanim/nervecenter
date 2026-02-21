# AgentBoard Design Spec v2.0 — Professional Redesign

**Goal:** Transform AgentBoard from an internal tool into a premium, commercial-grade SaaS product.  
**Aesthetic reference:** Linear, Vercel Dashboard, Raycast, Resend — clean, minimal, dense, premium.  
**Architecture:** Vanilla JS + CSS custom properties (no framework change). All changes are CSS + JS template updates.

---

## 1. Color Palette

### Dark Theme (Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#09090B` | Page background (zinc-950) |
| `--bg-surface` | `#111113` | Cards, panels, sidebar |
| `--bg-surface-hover` | `#18181B` | Hover states on surfaces |
| `--bg-elevated` | `#1C1C22` | Modals, dropdowns, popovers |
| `--bg-inset` | `#0C0C0E` | Inset areas (code blocks, tab content bg) |
| `--border-default` | `#1F1F28` | Default borders (very subtle) |
| `--border-hover` | `#2A2A35` | Borders on hover |
| `--border-active` | `#3A3A48` | Active/focus borders |
| `--text-primary` | `#ECECF1` | Headings, primary content |
| `--text-secondary` | `#8B8BA3` | Descriptions, metadata |
| `--text-tertiary` | `#52525B` | Disabled, timestamps |
| `--text-inverse` | `#09090B` | Text on accent buttons |
| `--accent` | `#6366F1` | Primary accent (indigo-500) |
| `--accent-hover` | `#818CF8` | Accent hover (indigo-400) |
| `--accent-muted` | `rgba(99,102,241,0.10)` | Accent tint for backgrounds |
| `--accent-glow` | `rgba(99,102,241,0.15)` | Subtle glow effects |
| `--success` | `#10B981` | Online, healthy, success (emerald-500) |
| `--success-muted` | `rgba(16,185,129,0.10)` | Success bg tint |
| `--warning` | `#F59E0B` | Busy, caution (amber-500) |
| `--warning-muted` | `rgba(245,158,11,0.10)` | Warning bg tint |
| `--danger` | `#EF4444` | Error, critical (red-500) |
| `--danger-muted` | `rgba(239,68,68,0.10)` | Danger bg tint |
| `--neutral` | `#52525B` | Offline, inactive (zinc-600) |

### Light Theme

| Token | Hex |
|-------|-----|
| `--bg-base` | `#FAFAFA` |
| `--bg-surface` | `#FFFFFF` |
| `--bg-surface-hover` | `#F4F4F5` |
| `--bg-elevated` | `#FFFFFF` |
| `--bg-inset` | `#F4F4F5` |
| `--border-default` | `#E4E4E7` |
| `--border-hover` | `#D4D4D8` |
| `--border-active` | `#A1A1AA` |
| `--text-primary` | `#09090B` |
| `--text-secondary` | `#52525B` |
| `--text-tertiary` | `#A1A1AA` |

Accent colors stay the same in both themes.

---

## 2. Typography

**Fonts (no change):**
- Display / Mono: `'JetBrains Mono', monospace`
- Body / UI: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`

**Scale (tightened):**

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | `11px` | 500 | Badges, micro-labels |
| `--text-sm` | `12px` | 400 | Metadata, timestamps |
| `--text-base` | `13px` | 400 | Body text, descriptions |
| `--text-md` | `14px` | 500 | Nav items, table cells |
| `--text-lg` | `16px` | 600 | Section headers |
| `--text-xl` | `20px` | 600 | Page titles |
| `--text-2xl` | `24px` | 700 | Dashboard hero numbers |

**Line heights:** 1.4 for body, 1.2 for headings, 1.0 for stat numbers.

**Letter spacing:** `-0.01em` for headings, `0.01em` for xs/badges, normal for body.

---

## 3. Spacing & Layout

- **Base unit:** `4px` — all spacing in multiples of 4
- **Border radius:** `6px` default, `8px` for cards, `12px` for modals, `9999px` for pills/badges
- **Sidebar width:** `240px` expanded, `56px` collapsed
- **Content max-width:** `1400px` centered with `24px` padding
- **Card padding:** `16px` (compact) or `20px` (standard)
- **Gap between cards:** `16px`

---

## 4. Component Specs

### 4.1 Sidebar

**Structure:**
```
┌──────────────────┐
│ ▣ AgentBoard  ‹  │  ← Logo + title + collapse toggle
│                  │
│ ▸ Dashboard      │  ← Nav items with SVG icons (not emoji)
│   Agents         │
│   Org Chart      │
│   Kanban         │
│   Activity       │
│   Reports        │
│                  │
│ ─────────────── │
│   Settings       │
│   ● v2.0.0       │  ← Version badge at bottom
└──────────────────┘
```

**Key changes:**
- Replace ALL emoji nav icons with **custom SVG icons** (16×16, 1.5px stroke, currentColor). Use Lucide icon set style.
  - Dashboard → `LayoutGrid`
  - Agents → `Users`
  - Org Chart → `GitBranch`
  - Kanban → `Columns`
  - Activity → `Activity` (pulse line)
  - Reports → `BarChart3`
  - Settings → `Settings` (gear)
- **Logo:** Replace 🤖 emoji with a proper SVG logomark — a stylized "A" inside a rounded square, or a hexagonal agent icon. Use accent color (`#6366F1`).
- **Active state:** Left 2px accent border + `--bg-surface-hover` bg + `--text-primary` text color
- **Hover state:** `--bg-surface-hover` bg, 150ms ease transition
- **Collapsed state:** Show only icons, centered. Tooltip on hover showing label.
- **Collapse animation:** `width` transition 200ms `cubic-bezier(0.4, 0, 0.2, 1)`, labels fade out with `opacity` 150ms
- **Divider:** 1px `--border-default`, `margin: 8px 16px`
- **Version badge:** `font-size: 11px`, `color: var(--text-tertiary)`, bottom of sidebar

### 4.2 Header

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  Dashboard                              🌙  🔍  ●  │
│  Overview of your agent fleet                       │
└─────────────────────────────────────────────────────┘
```

**Key changes:**
- **Page title:** `--text-xl`, weight 600, `--text-primary`
- **Subtitle/description:** `--text-base`, `--text-secondary`, shown below title (each page has a static subtitle)
- **Right actions:** Theme toggle (sun/moon SVG, not emoji), search button (magnifying glass SVG), connection indicator (green dot when WS connected)
- **No border-bottom.** Use subtle `box-shadow: inset 0 -1px 0 var(--border-default)` instead
- **Height:** `56px`, padding `0 24px`
- **Breadcrumb:** When in agent detail: `Agents / Agent Name` with clickable "Agents"

**Page subtitles:**
- Dashboard: "Overview of your agent fleet"
- Agents: "All configured agents and their status"
- Org Chart: "Team structure and reporting lines"
- Kanban: "Task management and workflow"
- Activity: "Real-time agent activity stream"
- Reports: "Analytics and performance insights"
- Settings: "Configuration and preferences"

### 4.3 Stat Cards (Dashboard)

**Current:** Plain boxes with big numbers.  
**New design:**

```
┌──────────────────┐
│  Total Agents    │  ← label on top, text-sm, text-secondary
│  22              │  ← number, text-2xl, font-display, text-primary
│  ↑ 3 this week   │  ← optional trend line, text-xs, success/danger color
└──────────────────┘
```

- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`
- Border-radius: `8px`
- Padding: `16px 20px`
- No box-shadow by default; on hover: `--border-hover` border + subtle translateY(-1px) with 200ms ease
- Grid: `repeat(auto-fit, minmax(180px, 1fr))` with `gap: 12px`
- "Stuck Tasks" card: When count > 0, border color `--warning`, label icon ⚠ replaced with SVG `AlertTriangle`

### 4.4 Agent Cards (Grid)

**Current:** Basic cards with emoji + name + status dot.  
**New design:**

```
┌──────────────────────────┐
│  🤖  Thunder             │  ← emoji stays (it's agent identity), name bold
│  Orchestrator            │  ← role, text-sm, text-secondary
│                          │
│  ● Online · claude-4     │  ← status pill + model badge
│  Engineering             │  ← team badge (colored pill)
└──────────────────────────┘
```

- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`
- **Hover:** border → `--border-hover`, bg → `--bg-surface-hover`, `transform: translateY(-2px)`, `box-shadow: 0 4px 12px rgba(0,0,0,0.15)` — all 200ms ease
- **Status indicator:** Replace raw dot with a **status pill**: small rounded rect with tinted background
  - Online: `--success-muted` bg, `--success` text, `--success` 6px dot with subtle CSS pulse
  - Busy: `--warning-muted` bg, `--warning` text
  - Offline: transparent bg, `--text-tertiary` text, no dot animation
- **Model badge:** `font-family: var(--font-display)`, `font-size: 11px`, `color: var(--text-tertiary)`, `background: var(--bg-inset)`, `border-radius: 4px`, `padding: 2px 6px`
- **Team badge:** Small pill with team color bg at 10% opacity, team color text
- Remove "View →" text — the whole card is clickable (cursor: pointer is enough)
- Grid: `repeat(auto-fill, minmax(260px, 1fr))` with `gap: 12px`

### 4.5 Agent Detail View

**Header redesign:**
```
┌─────────────────────────────────────────────────┐
│  ← Agents                                       │
│                                                  │
│  🤖  Thunder                    ● Online         │
│  Orchestrator · Engineering · claude-opus-4       │
│                                                  │
│  ┌─────┬────────┬───────────┬──────────┬──────┐  │
│  │Soul │ Memory │ Heartbeat │ Agents.md│Skills│  │
│  └─────┴────────┴───────────┴──────────┴──────┘  │
└─────────────────────────────────────────────────┘
```

- **Back link:** `text-sm`, `--text-secondary`, hover `--text-primary`, no button styling — just text with ← arrow
- **Name:** `text-xl`, weight 700
- **Meta row:** pipe-separated, all `text-sm`, `--text-secondary`
- **Tab bar redesign:**
  - Horizontal, flush with content
  - Each tab: `text-sm`, weight 500, `--text-secondary`, `padding: 8px 16px`
  - Active tab: `--text-primary` color, `border-bottom: 2px solid var(--accent)` — border animates with `transform: scaleX` transition
  - Hover: `--text-primary`, `background: var(--bg-surface-hover)`, `border-radius: 6px 6px 0 0`
  - Tab bar bottom border: `1px solid var(--border-default)` full width
  - Add "Activity" tab to tabs

### 4.6 Markdown Content Panels (Soul/Memory/Heartbeat/Agents.md)

**Style like a documentation reader:**
- Container: `background: var(--bg-inset)`, `border: 1px solid var(--border-default)`, `border-radius: 8px`, `padding: 24px 28px`
- Max-width: `720px` within the panel (readable line length)
- **Typography inside:**
  - `h1`: `text-lg`, weight 700, `margin-top: 32px`, `--text-primary`
  - `h2`: `text-md`, weight 600, `margin-top: 24px`, `--text-primary`
  - `h3`: `text-base`, weight 600, `--text-secondary`
  - `p`: `text-base`, `--text-secondary`, `line-height: 1.6`
  - `code`: `font-family: var(--font-display)`, `font-size: 12px`, `background: var(--bg-surface)`, `padding: 2px 6px`, `border-radius: 4px`, `color: var(--accent)`
  - `pre`: `background: var(--bg-surface)`, `border: 1px solid var(--border-default)`, `border-radius: 6px`, `padding: 16px`, `overflow-x: auto`
  - `a`: `color: var(--accent)`, underline on hover only
  - Lists: `padding-left: 20px`, custom bullet color `--text-tertiary`
- **Timestamp footer:** Right-aligned, `text-xs`, `--text-tertiary`, refresh icon as SVG `RotateCw`

### 4.7 Activity Feed

**Timeline-style redesign:**

```
  ●──── 2 min ago ──────────────────────────────
  │  🤖 Thunder ran `sessions_spawn`
  │  Spawned task: Deploy frontend fixes
  │
  ●──── 5 min ago ──────────────────────────────
  │  ⚡ Forge sent a response
  │  Build completed successfully
```

- **Timeline line:** 2px vertical line, `--border-default`, left side at 12px from edge
- **Timeline dot:** 8px circle, `--border-active` border, `--bg-surface` fill. For different event types:
  - `command` → `--accent` dot
  - `response` → `--success` dot
  - `result` → `--text-tertiary` dot
- Each item: `padding-left: 32px`, `margin-bottom: 0` (use `gap: 2px`)
- **Agent name:** weight 600, `--text-primary`
- **Action text:** weight 400, `--text-secondary`
- **Code in actions:** inline code style (monospace, subtle bg)
- **Content preview:** `text-sm`, `--text-tertiary`, single line truncated
- **Timestamp:** Right-aligned, `text-xs`, `--text-tertiary`
- **Hover:** Entire item gets `background: var(--bg-surface-hover)`, `border-radius: 6px`, 150ms ease

### 4.8 Kanban Board

**Premium project management feel:**

**Column header:**
```
┌──────────────────────┐
│  To Do          (5)  │  ← title + count badge
└──────────────────────┘
```
- Title: `text-sm`, weight 600, `text-transform: uppercase`, `letter-spacing: 0.05em`, `--text-secondary`
- Count: `text-xs`, `--text-tertiary`, `background: var(--bg-inset)`, pill shape
- Column bg: transparent (no column background — cards float on page bg)
- Column min-width: `300px`

**Task card:**
```
┌──────────────────────────┐
│  Fix auth timeout issue  │  ← title, weight 500
│                          │
│  🔧 Forge · Engineering  │  ← assignee + team
│  ▲ High · 3 comments     │  ← priority + comment count
└──────────────────────────┘
```

- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`
- Border-radius: `8px`
- Padding: `14px 16px`
- **Hover:** same as agent cards (lift + border change)
- **Priority indicators:**
  - Critical: left 3px border `--danger`
  - High: left 3px border `--warning`
  - Medium: left 3px border `--accent`
  - Low: no left border
- **Drag state:** `opacity: 0.5`, `box-shadow: var(--shadow-lg)`, `transform: rotate(2deg)`
- **Drop zone:** dashed border `--accent`, `--accent-muted` background
- Card gap: `8px`

### 4.9 Empty States

**Consistent pattern for all empty states:**
```
┌─────────────────────────────┐
│                             │
│         [SVG Icon]          │  ← 48px, --text-tertiary, line-style icon
│                             │
│    No agents configured     │  ← text-md, weight 500, --text-secondary
│    Add agents via           │  ← text-sm, --text-tertiary
│    agents.yaml to begin     │
│                             │
└─────────────────────────────┘
```

- Centered vertically and horizontally
- Icon: SVG outline style, 48×48, `stroke: var(--text-tertiary)`, `stroke-width: 1.5`
- No emoji icons in empty states — use SVG
- Padding: `48px`

---

## 5. Interaction Patterns

### Transitions
- **Default duration:** `150ms` for color/opacity, `200ms` for transform/shadow
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (Material ease-out) for most, `cubic-bezier(0.16, 1, 0.3, 1)` for entrance animations
- **Apply to:** `transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)` on interactive elements

### Hover States
- **Cards:** `translateY(-2px)` + border color change + subtle shadow
- **Nav items:** Background tint + text color change
- **Buttons:** Opacity 0.9 or background lighten
- **Links:** Underline appears

### Focus States
- All interactive elements: `outline: 2px solid var(--accent)`, `outline-offset: 2px`
- Visible only on `keyboard` focus (`:focus-visible`)

### Loading States
- **Spinner:** Replace current spinner with a minimal one — 16px circle, 2px border, `--accent` color, rotating. CSS only.
- **Skeleton loading (future):** For cards, use pulsing rectangles with `--bg-surface-hover` → `--bg-elevated` animation

### Page Transitions
- Content area: `opacity 0 → 1` on page change, `150ms` ease
- Optional: slight `translateY(8px) → 0` for content entrance

---

## 6. SVG Icon System

Replace ALL emoji in the UI chrome (not agent emojis — those stay) with inline SVGs.

**Icon specs:**
- Size: `16×16` for nav, `20×20` for headers, `48×48` for empty states
- Stroke: `currentColor`, `stroke-width: 1.5`
- Fill: `none`
- Style: Lucide-compatible

**Required icons (provide as inline SVG in JS templates):**

| Name | Usage | Path |
|------|-------|------|
| `layout-grid` | Dashboard nav | 4 rounded rects in grid |
| `users` | Agents nav | Two person silhouettes |
| `git-branch` | Org Chart nav | Branch lines |
| `columns` | Kanban nav | 3 vertical columns |
| `activity` | Activity nav | Pulse/heartbeat line |
| `bar-chart` | Reports nav | 3 ascending bars |
| `settings` | Settings nav | Gear |
| `sun` | Light theme | Sun with rays |
| `moon` | Dark theme | Crescent moon |
| `search` | Search | Magnifying glass |
| `arrow-left` | Back navigation | Left arrow |
| `refresh-cw` | Refresh button | Circular arrows |
| `alert-triangle` | Warning/stuck | Triangle with ! |
| `chevron-left` | Collapse sidebar | Left chevron |
| `chevron-right` | Expand sidebar | Right chevron |
| `inbox` | Empty activity | Inbox tray |
| `file-text` | Empty markdown | Document |
| `layers` | Empty kanban | Stacked layers |

---

## 7. Specific File Changes

### `variables.css`
- Replace entire `:root` block with new palette (Section 1)
- Replace light theme overrides
- Update typography scale (Section 2)
- Add new tokens: `--bg-base`, `--bg-inset`, `--border-hover`, `--border-active`, `--accent-glow`, all status-muted variants

### `layout.css`
- Update sidebar styles per Section 4.1
- Update header per Section 4.2
- Add collapse animation keyframes
- Update content area padding

### `components.css`
- Restyle `.agent-card` per Section 4.4
- Restyle `.stat-card` per Section 4.3
- Restyle `.activity-item` per Section 4.7
- Restyle `.tab-bar`, `.tab` per Section 4.5
- Restyle `.markdown-body` per Section 4.6
- Add kanban premium styles per Section 4.8
- Restyle `.empty-state` per Section 4.9
- Add transition utilities
- Restyle `.status-dot` → status pill component

### `index.html`
- Replace emoji nav icons with SVG (Section 6)
- Replace emoji theme toggle with SVG
- Add logomark SVG
- Add version badge in sidebar footer
- Update mobile bottom nav with SVGs

### All `pages/*.js`
- Update HTML templates to use new class names and SVG icons
- Remove "View →" from agent cards
- Add page subtitles to header rendering
- Update empty state markup to use SVG icons

---

## 8. Logo Mark

AgentBoard logomark: A stylized **hexagonal** shape with an abstract "circuit node" inside — representing an AI agent hub.

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5L12 2Z" stroke="#6366F1" stroke-width="1.5" fill="rgba(99,102,241,0.1)"/>
  <circle cx="12" cy="12" r="3" fill="#6366F1"/>
  <line x1="12" y1="9" x2="12" y2="5" stroke="#6366F1" stroke-width="1.5"/>
  <line x1="14.6" y1="13.5" x2="18" y2="15.5" stroke="#6366F1" stroke-width="1.5"/>
  <line x1="9.4" y1="13.5" x2="6" y2="15.5" stroke="#6366F1" stroke-width="1.5"/>
</svg>
```

---

## 9. Implementation Priority

1. **Phase 1 — Foundation:** Color palette, typography, variables.css overhaul
2. **Phase 2 — Chrome:** Sidebar, header, SVG icons, logo
3. **Phase 3 — Components:** Stat cards, agent cards, status pills
4. **Phase 4 — Content:** Tab bar, markdown panels, activity feed
5. **Phase 5 — Kanban:** Column and card restyling
6. **Phase 6 — Polish:** Empty states, transitions, hover effects, page transitions

All phases can be done in a single pass since it's CSS + template changes.

---

*This spec is the source of truth for the AgentBoard redesign. Prism implements; Muse approves.*
