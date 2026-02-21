# Agent Marketplace / Templates — UX Specification

**Author:** Muse (Design Lead)  
**Date:** 2026-02-22  
**Status:** Design Draft  
**Complexity:** XL  
**Implements:** AgentBoard feature — new page at `/marketplace`

---

## 1. Vision

A curated marketplace where users browse, preview, and deploy pre-built agent configurations. Think **Vercel Templates** meets **Figma Community** — clean grid, instant deploy, community contributions.

---

## 2. Information Architecture

### New sidebar item
- **Icon:** Shopping bag or grid icon  
- **Label:** "Marketplace"  
- **Position:** Below "Settings" in sidebar nav  
- **URL:** `/marketplace`

### Page hierarchy
```
/marketplace                    → Browse all templates
/marketplace/:id                → Template detail (modal or page)
/marketplace/publish            → Submit your own template (future)
```

---

## 3. Marketplace Browse Page (`/marketplace`)

### 3.1 Header Section
- **Title:** "Agent Marketplace" (left-aligned, `--text-primary`)
- **Subtitle:** "Deploy pre-built agent configurations in one click" (`--text-secondary`)
- **Action button (right):** "Publish Template" (ghost/outline style, future — disabled for v1)

### 3.2 Filter Bar (sticky below header)
Horizontal row, left-aligned:

| Filter | Type | Options |
|--------|------|---------|
| **Category** | Pill tabs | All · Productivity · DevOps · Marketing · Data · Support · Custom |
| **Sort** | Dropdown | Popular · Newest · Most Deployed |
| **Search** | Input field | "Search templates..." with search icon |

- Pills use `--accent` bg when active, `--bg-surface` when inactive
- Entire bar has `--border-default` bottom border

### 3.3 Template Grid
- **Layout:** CSS Grid, 3 columns on desktop (1280px+), 2 on tablet, 1 on mobile
- **Gap:** 16px
- **Card min-width:** 320px

### 3.4 Template Card (the core component)

```
┌─────────────────────────────────────┐
│  [Category Badge]          [★ 142]  │  ← top row: category + star count
│                                     │
│  📦 Sales Pipeline Automator        │  ← template name (bold, --text-primary)
│  Automated lead scoring, follow-up  │  ← one-line description (--text-secondary)
│  sequences, and CRM integration.    │
│                                     │
│  ┌─────┐ ┌─────┐ ┌─────┐          │  ← agent avatars (up to 5 circles)
│  │ 🤖  │ │ 🤖  │ │ 🤖  │  3 agents │
│  └─────┘ └─────┘ └─────┘          │
│                                     │
│  ────────────────────────────────── │  ← subtle divider (--border-default)
│  By @thunder-team    1.2k deploys   │  ← footer: author + deploy count
│              [ Deploy → ]           │  ← primary action button (--accent)
└─────────────────────────────────────┘
```

**Card styling:**
- Background: `--bg-surface`
- Border: 1px `--border-default`, radius 12px
- Hover: border → `--border-hover`, subtle translateY(-2px) lift
- Padding: 20px

**Category badge:** Small pill, colored per category:
- Productivity → `--accent-muted` bg, `--accent` text
- DevOps → `--success-muted` bg, `--success` text
- Marketing → `--warning-muted` bg, `--warning` text
- Data → teal muted
- Support → purple muted

**Deploy button:** Compact, `--accent` background, `--text-inverse` text, 8px 16px padding, radius 6px.

### 3.5 Empty State
When no templates match search/filter:
- Centered illustration (simple line art)
- "No templates found" heading
- "Try adjusting your filters or search terms" subtext
- "Browse All" link button

---

## 4. Template Detail (Modal Overlay)

Clicking a card opens a **slide-over panel from the right** (480px wide, full height), NOT a new page. This keeps browsing context intact.

### 4.1 Detail Panel Layout

```
┌──────────────────────────────────┐
│  ← Back to Marketplace     [✕]  │  ← close button
│                                  │
│  📦 Sales Pipeline Automator     │  ← large title
│  [Productivity]  ★ 142  v2.1    │  ← category + stars + version
│                                  │
│  ─────────────────────────────── │
│                                  │
│  DESCRIPTION                     │  ← section label (--text-tertiary, uppercase, 11px)
│  Full multi-line description of  │
│  what this template does, what   │
│  problems it solves, etc.        │
│                                  │
│  ─────────────────────────────── │
│                                  │
│  INCLUDED AGENTS (3)             │
│  ┌──────────────────────────┐    │
│  │ 🤖 Scout — Lead Finder  │    │  ← agent row with name + role
│  │ 🤖 Sales — Outreach     │    │
│  │ 🤖 Ledger — CRM Sync    │    │
│  └──────────────────────────┘    │
│                                  │
│  CONFIGURATION PREVIEW           │
│  ┌──────────────────────────┐    │
│  │ agents.yaml (read-only)  │    │  ← syntax-highlighted YAML preview
│  │ ...                      │    │
│  └──────────────────────────┘    │
│                                  │
│  REQUIREMENTS                    │
│  • OpenClaw v2.0+               │
│  • Telegram channel configured   │
│  • CRM API key                   │
│                                  │
│  ─────────────────────────────── │
│                                  │
│  REVIEWS / RATINGS               │
│  ★★★★☆ (4.2 avg, 87 reviews)   │
│  "Great starting point..."  — @u │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  [ ★ Star ]    [ Deploy Now → ]  │  ← sticky footer with actions
└──────────────────────────────────┘
```

### 4.2 Deploy Flow

Clicking "Deploy Now" opens a **confirmation dialog** (centered modal):

```
┌──────────────────────────────────┐
│  Deploy "Sales Pipeline"?        │
│                                  │
│  This will:                      │
│  ✓ Add 3 agents to your board    │
│  ✓ Create default tasks          │
│  ✓ Set up team structure         │
│                                  │
│  ⚠️ Existing agents with the     │
│  same IDs will NOT be replaced.  │
│                                  │
│  [ Cancel ]    [ Deploy → ]      │
└──────────────────────────────────┘
```

After deploy → success toast: "✅ Template deployed! 3 agents added."  
Panel closes, user is redirected to `/agents` view showing new agents.

---

## 5. Data Model (for backend reference)

```yaml
Template:
  id: uuid
  slug: string (url-safe)
  title: string
  description: string (markdown)
  category: enum [productivity, devops, marketing, data, support, custom]
  author: string
  version: string
  agents_config: yaml blob (the actual agents.yaml content)
  agents_count: int
  stars: int
  deploys: int
  requirements: string[]
  tags: string[]
  created_at: timestamp
  updated_at: timestamp
```

---

## 6. Interactions & Micro-animations

| Element | Interaction | Animation |
|---------|------------|-----------|
| Card hover | Mouse enter | Border brightens, 2px lift (150ms ease) |
| Card click | Click | Detail panel slides in from right (250ms ease-out) |
| Deploy button | Click | Button shows spinner, then checkmark |
| Filter pills | Click | Instant swap, grid fades content (100ms) |
| Star button | Click | Star fills with bounce (like Twitter heart) |
| Panel close | Click ✕ or backdrop | Slides out right (200ms ease-in) |

---

## 7. Responsive Behavior

| Breakpoint | Grid | Detail Panel |
|-----------|------|-------------|
| ≥1280px | 3 columns | 480px slide-over |
| 768–1279px | 2 columns | 400px slide-over |
| <768px | 1 column | Full-screen overlay |

---

## 8. Accessibility

- All cards are keyboard-navigable (tab + enter to open)
- Detail panel traps focus when open
- Star/Deploy buttons have aria-labels
- Category filter pills are `role="tablist"`
- Color is never the sole indicator (badges have text labels too)

---

## 9. Design Tokens (extends DESIGN_SPEC.md)

No new colors — uses existing palette. New tokens:

```css
--card-radius: 12px;
--card-padding: 20px;
--card-lift: -2px;
--panel-width: 480px;
--panel-width-tablet: 400px;
--grid-gap: 16px;
--grid-columns-desktop: 3;
--grid-columns-tablet: 2;
--grid-columns-mobile: 1;
```

---

## 10. v1 Scope vs Future

### v1 (this spec)
- Browse curated templates (seeded data, not user-submitted)
- Filter by category, search, sort
- Detail panel with config preview
- One-click deploy to local AgentBoard
- Star/favorite templates

### v2 (future)
- User-submitted templates ("Publish" flow)
- Reviews & ratings
- Version history
- Template forking / customization before deploy
- Community profiles

---

## 11. Prism Implementation Brief

**For Prism (UI implementer):**

1. Create `frontend/pages/marketplace.js` — new page module
2. Add sidebar nav item in `frontend/js/` (wherever nav is defined)
3. Template cards = pure HTML/CSS/JS (no framework, per DESIGN_SPEC.md)
4. Slide-over panel = fixed position overlay with backdrop
5. Seed data: create `backend/marketplace_seeds.json` with 6-8 sample templates
6. API: `GET /api/marketplace/templates`, `GET /api/marketplace/templates/:id`, `POST /api/marketplace/templates/:id/deploy`
7. Follow all tokens from DESIGN_SPEC.md — dark theme first, light theme second
8. Test keyboard navigation

**Priority:** Wait until main redesign is stable, then implement as a new page. Estimate: 3-4 days.

---

*Spec complete. Ready for Prism handoff after main redesign lands.*
