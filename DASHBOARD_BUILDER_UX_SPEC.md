# Custom Dashboard Builder — UX Specification

**Author:** Muse (Design Lead)  
**Date:** 2026-02-22  
**Status:** Design Draft  
**Complexity:** XL  
**Implements:** AgentBoard feature — enhanced `/dashboard` with builder mode

---

## 1. Vision

A drag-and-drop dashboard builder where users compose personalized monitoring views from a library of widgets. Think **Notion blocks** meets **Grafana dashboards** — flexible layout, real-time data, save/load configurations.

---

## 2. Core Concept: Two Modes

The dashboard page has two modes, toggled by a button in the header:

| Mode | Description |
|------|-------------|
| **View Mode** (default) | Clean dashboard, no chrome. Widgets display live data. |
| **Edit Mode** | Grid overlay appears, widgets become draggable/resizable, widget picker opens. |

Toggle button in header: `[ ✏️ Customize ]` → enters edit mode → becomes `[ ✓ Done ]`

---

## 3. Page Layout

### 3.1 View Mode
```
┌─────────────────────────────────────────────────┐
│  My Dashboard              [ ✏️ Customize ]  ▾  │  ← ▾ = dashboard switcher dropdown
│─────────────────────────────────────────────────│
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Widget A │ │ Widget B │ │    Widget C      │ │
│  │ (1x1)    │ │ (1x1)    │ │    (2x1)         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────┐ ┌──────────────────┐  │
│  │    Widget D          │ │    Widget E      │  │
│  │    (2x2)             │ │    (2x1)         │  │
│  │                      │ └──────────────────┘  │
│  │                      │ ┌──────────────────┐  │
│  │                      │ │    Widget F      │  │
│  └──────────────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 3.2 Edit Mode
```
┌─────────────────────────────────────────────────┐
│  My Dashboard                    [ ✓ Done ]     │
│─────────────────────────────────────────────────│
│  ╔══════════╗ ╔══════════╗ ╔══════════════════╗ │  ← dashed borders, drag handles visible
│  ║ Widget A ║ ║ Widget B ║ ║    Widget C      ║ │
│  ║    ⋮⋮    ║ ║    ⋮⋮    ║ ║       ⋮⋮         ║ │  ← ⋮⋮ = drag handle
│  ╚══════════╝ ╚══════════╝ ╚══════════════════╝ │
│                                                  │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │          + Add Widget                      │  │  ← drop zone / add button
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                  │
│  ┌──────── Widget Picker (bottom sheet) ──────┐  │
│  │  📊 Agent Status  📈 Task Chart  ⏱ Uptime │  │
│  │  📋 Recent Tasks  🔔 Alerts     📝 Notes  │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 4. Grid System

- **Base grid:** 12 columns, auto rows
- **Widget sizes:** Snap to grid — min 1x1 (1 col, 1 row), max 12x4
- **Common sizes:** 
  - Small: 3x1 (stat card)
  - Medium: 6x2 (chart, table)
  - Large: 12x3 (full-width timeline)
  - Square: 4x2 (agent status grid)
- **Row height:** ~120px
- **Gap:** 16px (matches `--grid-gap`)
- **Drag:** CSS Grid placement with ghost preview during drag
- **Resize:** Corner handle (bottom-right), snaps to grid

---

## 5. Widget Library

### 5.1 v1 Widgets

| Widget | Default Size | Description |
|--------|-------------|-------------|
| **Agent Status Grid** | 4x2 | Grid of agent status indicators (online/busy/offline) |
| **Task Summary** | 3x1 | Stat card: total tasks, in-progress, done, blocked |
| **Task Burndown** | 6x2 | Line chart: tasks completed over time |
| **Recent Activity** | 6x3 | Feed of latest agent actions / task transitions |
| **Alerts / Stuck Tasks** | 4x2 | List of stuck or overdue tasks with severity |
| **Team Workload** | 6x2 | Bar chart: tasks per agent/team |
| **Quick Notes** | 3x2 | Editable markdown notepad |
| **Clock / Date** | 2x1 | Current time with timezone |

### 5.2 Widget Anatomy

Every widget follows the same frame:

```
┌─────────────────────────────────┐
│  Widget Title        [⋮]       │  ← header: title + overflow menu
│─────────────────────────────────│
│                                 │
│        Widget Content           │  ← varies by type
│                                 │
└─────────────────────────────────┘
```

- **Header:** `--text-secondary` title, 13px, uppercase tracking
- **Overflow menu [⋮]:** Edit · Duplicate · Remove (only visible on hover or edit mode)
- **Background:** `--bg-surface`
- **Border:** 1px `--border-default`, radius 12px
- **Padding:** 16px

### 5.3 Widget Configuration

Each widget has a config popover (triggered by overflow menu → "Edit"):

```
┌── Configure: Task Summary ──────┐
│                                  │
│  Title:    [Task Summary     ]   │
│  Team:     [All Teams       ▾]   │  ← filter scope
│  Timeframe:[Last 7 days    ▾]   │
│                                  │
│  [ Cancel ]     [ Save ]         │
└──────────────────────────────────┘
```

---

## 6. Widget Picker

Triggered by "+ Add Widget" in edit mode. Appears as a **bottom sheet** (slides up from bottom, 320px height).

```
┌─────────────────────────────────────────────────┐
│  Add Widget                              [✕]    │
│  ─────────────────────────────────────────────── │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ 📊      │ │ 📈      │ │ ⏱      │ │ 📋    │ │
│  │ Agent   │ │ Task    │ │ Uptime │ │Recent │ │
│  │ Status  │ │ Chart   │ │        │ │Tasks  │ │
│  └─────────┘ └─────────┘ └─────────┘ └───────┘ │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ 🔔      │ │ 👥      │ │ 📝      │ │ 🕐    │ │
│  │ Alerts  │ │ Team    │ │ Notes  │ │ Clock │ │
│  │         │ │ Load    │ │        │ │       │ │
│  └─────────┘ └─────────┘ └─────────┘ └───────┘ │
└─────────────────────────────────────────────────┘
```

- Click a widget → it's appended to the next available grid position
- Or drag from picker onto the grid for precise placement

---

## 7. Dashboard Persistence

### Multiple Dashboards
- Users can create multiple dashboards (tabs/dropdown)
- Default dashboard: "My Dashboard" (auto-created)
- Dashboard switcher: dropdown in header next to title

### Data Model
```yaml
Dashboard:
  id: uuid
  name: string
  owner: string (user_id)
  is_default: boolean
  layout: json  # array of widget placements
  created_at: timestamp
  updated_at: timestamp

WidgetPlacement:
  widget_type: string
  config: json  # widget-specific settings
  grid_col: int  # 1-12
  grid_row: int
  col_span: int
  row_span: int
```

### API
- `GET /api/dashboards` — list user's dashboards
- `GET /api/dashboards/:id` — get dashboard with layout
- `PUT /api/dashboards/:id` — save layout changes
- `POST /api/dashboards` — create new dashboard
- `DELETE /api/dashboards/:id`

---

## 8. Interactions

| Action | Behavior |
|--------|----------|
| Enter edit mode | Grid overlay fades in (150ms), widgets get dashed borders + drag handles |
| Drag widget | Ghost preview shows target position, other widgets reflow |
| Resize widget | Corner handle, grid snap, min/max constraints enforced |
| Drop widget | Smooth transition to final position (200ms ease) |
| Add widget | Widget fades in at target position with scale-up (200ms) |
| Remove widget | Widget shrinks + fades out (150ms), grid reflows |
| Save (Done) | Auto-saves via PUT, toast: "Dashboard saved" |

---

## 9. Responsive Behavior

| Breakpoint | Grid Columns | Widget Picker |
|-----------|-------------|---------------|
| ≥1280px | 12 columns | Bottom sheet (320px) |
| 768–1279px | 8 columns (widgets scale) | Bottom sheet (280px) |
| <768px | 4 columns | Full-screen modal |

On mobile, edit mode uses simplified reorder (drag up/down in single column) rather than 2D grid placement.

---

## 10. Accessibility

- Edit mode toggle has clear visual + aria state (`aria-pressed`)
- Drag operations have keyboard alternative: select widget → arrow keys to move, shift+arrows to resize
- Widget picker items are keyboard-navigable
- Focus management: entering edit mode focuses first widget
- All widgets have `role="region"` with `aria-label`

---

## 11. Prism Implementation Brief

**For Prism:**

1. Enhance existing `frontend/pages/dashboard.js` with builder mode
2. Use CSS Grid for layout — no external drag library needed for v1 (HTML Drag and Drop API)
3. Widget components: create `frontend/js/widgets/` directory, one file per widget type
4. Persist layout to backend: new `dashboards` table + REST API
5. Bottom sheet component: reusable, slide-up overlay
6. Edit mode: toggle class on dashboard container, show/hide drag handles
7. Auto-save on "Done" — no explicit save button needed

**Dependencies:** Needs backend `dashboards` API (assign to Forge/Titan).  
**Priority:** After Marketplace. Estimate: 5-7 days.  
**Critical path:** Widget data hooks — each widget needs real data from existing APIs.

---

*Spec complete. Ready for Prism handoff after Marketplace ships.*
