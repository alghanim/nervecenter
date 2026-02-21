/* AgentBoard — Custom Dashboard Builder */

window.Pages = window.Pages || {};

Pages.dashboardBuilder = {
  _editing: false,
  _dashboards: [],
  _activeDash: null,
  _dragState: null,
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="db-builder">
        <div class="db-header">
          <div class="db-tabs" id="dbTabs"></div>
          <div class="db-header-actions">
            <button class="btn btn-sm btn-outline" id="dbNewBtn" title="New Dashboard">+ New</button>
            <button class="btn btn-sm btn-primary" id="dbEditToggle">✏️ Customize</button>
          </div>
        </div>
        <div class="db-grid-container" id="dbGridContainer">
          <div class="db-grid" id="dbGrid"></div>
        </div>
        <div class="db-widget-picker" id="dbWidgetPicker" style="display:none">
          <div class="db-picker-header">
            <span>Add Widget</span>
            <button class="db-picker-close" id="dbPickerClose">✕</button>
          </div>
          <div class="db-picker-items" id="dbPickerItems"></div>
        </div>
      </div>`;

    this._injectStyles();
    await this._loadDashboards();
    this._bindEvents();
    this._refreshTimer = setInterval(() => this._renderWidgetContents(), 30000);
  },

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
  },

  // ── Data ──

  async _loadDashboards() {
    try {
      this._dashboards = await API.getDashboards();
    } catch (e) {
      this._dashboards = [];
    }
    if (this._dashboards.length === 0) {
      // Create default
      try {
        await API.createDashboard('My Dashboard', []);
        this._dashboards = await API.getDashboards();
      } catch (_) {}
    }
    this._activeDash = this._dashboards[0] || null;
    this._renderTabs();
    this._renderGrid();
  },

  // ── Tabs ──

  _renderTabs() {
    const el = document.getElementById('dbTabs');
    if (!el) return;
    el.innerHTML = this._dashboards.map(d => `
      <button class="db-tab ${d.id === (this._activeDash?.id) ? 'active' : ''}" data-id="${d.id}">
        ${Utils.esc(d.name)}
        ${this._editing ? `<span class="db-tab-delete" data-delete="${d.id}" title="Delete">✕</span>` : ''}
      </button>
    `).join('');

    el.querySelectorAll('.db-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.dataset.delete) {
          e.stopPropagation();
          this._deleteDashboard(e.target.dataset.delete);
          return;
        }
        const id = btn.dataset.id;
        this._activeDash = this._dashboards.find(d => d.id === id) || this._activeDash;
        this._renderTabs();
        this._renderGrid();
      });
    });
  },

  // ── Grid ──

  _renderGrid() {
    const grid = document.getElementById('dbGrid');
    const container = document.getElementById('dbGridContainer');
    if (!grid || !this._activeDash) return;

    container.classList.toggle('editing', this._editing);

    const widgets = this._activeDash.widgets || [];
    grid.innerHTML = widgets.map(w => `
      <div class="db-widget" data-wid="${w.id}"
           style="grid-column: ${w.x + 1} / span ${w.w}; grid-row: ${w.y + 1} / span ${w.h};">
        <div class="db-widget-header">
          <span class="db-widget-title">${this._widgetLabel(w.type)}</span>
          ${this._editing ? `
            <div class="db-widget-actions">
              <button class="db-widget-btn" data-config="${w.id}" title="Configure">⚙</button>
              <button class="db-widget-btn" data-remove="${w.id}" title="Remove">✕</button>
            </div>
          ` : ''}
        </div>
        <div class="db-widget-body" id="wbody-${w.id}"></div>
        ${this._editing ? '<div class="db-widget-drag-handle">⋮⋮</div>' : ''}
      </div>
    `).join('');

    if (this._editing) {
      grid.innerHTML += `
        <div class="db-add-zone" id="dbAddZone" style="grid-column: 1 / -1;">
          <button class="btn btn-outline" id="dbAddWidgetBtn">+ Add Widget</button>
        </div>`;
      document.getElementById('dbAddWidgetBtn')?.addEventListener('click', () => this._togglePicker(true));
    }

    // Bind widget actions
    grid.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => this._removeWidget(btn.dataset.remove));
    });
    grid.querySelectorAll('[data-config]').forEach(btn => {
      btn.addEventListener('click', () => this._showConfig(btn.dataset.config));
    });

    // Drag
    if (this._editing) this._initDrag();

    this._renderWidgetContents();
  },

  // ── Widget Contents ──

  async _renderWidgetContents() {
    if (!this._activeDash) return;
    for (const w of (this._activeDash.widgets || [])) {
      const el = document.getElementById(`wbody-${w.id}`);
      if (!el) continue;
      try {
        await this._fillWidget(el, w);
      } catch (e) {
        el.innerHTML = `<div class="text-secondary" style="padding:8px;font-size:12px;">Error loading data</div>`;
      }
    }
  },

  async _fillWidget(el, w) {
    switch (w.type) {
      case 'agent-status': {
        const agents = await API.getAgents();
        el.innerHTML = `<div class="db-agent-pills">${agents.map(a => `
          <span class="db-pill db-pill-${a.status || 'offline'}">${Utils.esc(a.name || a.id)}</span>
        `).join('')}</div>`;
        break;
      }
      case 'task-summary': {
        const tasks = await API.getTasks();
        const counts = { todo: 0, 'in-progress': 0, done: 0 };
        (Array.isArray(tasks) ? tasks : []).forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
        el.innerHTML = `<div class="db-mini-stats">
          <div class="db-mini-stat"><span class="db-stat-num">${counts.todo}</span><span class="db-stat-lbl">Todo</span></div>
          <div class="db-mini-stat"><span class="db-stat-num">${counts['in-progress']}</span><span class="db-stat-lbl">In Progress</span></div>
          <div class="db-mini-stat"><span class="db-stat-num">${counts.done}</span><span class="db-stat-lbl">Done</span></div>
        </div>`;
        break;
      }
      case 'activity-feed': {
        const limit = (w.config && w.config.limit) || 10;
        const items = await API.getStream(limit);
        const arr = Array.isArray(items) ? items.slice(0, 10) : [];
        el.innerHTML = arr.length ? `<div class="db-activity-list">${arr.map(a => `
          <div class="db-activity-item">
            <span class="db-activity-agent">${Utils.esc(a.agent || a.agent_id || '')}</span>
            <span class="db-activity-text">${Utils.esc(a.summary || a.action || a.message || '')}</span>
            <span class="db-activity-time">${Utils.timeAgo ? Utils.timeAgo(a.timestamp || a.created_at) : ''}</span>
          </div>
        `).join('')}</div>` : '<div class="text-secondary" style="padding:8px">No recent activity</div>';
        break;
      }
      case 'alerts': {
        try {
          const rules = await apiFetch('/api/alerts/rules');
          const arr = Array.isArray(rules) ? rules : [];
          const active = arr.filter(r => r.enabled !== false);
          el.innerHTML = `<div class="db-alerts-summary">
            <div class="db-stat-num">${active.length}</div>
            <div class="db-stat-lbl">Active Alert Rules</div>
          </div>
          <div class="db-alerts-list">${active.slice(0, 5).map(r => `
            <div class="db-alert-row">${Utils.esc(r.name || r.metric || 'Alert')}</div>
          `).join('')}</div>`;
        } catch (_) {
          el.innerHTML = '<div class="text-secondary" style="padding:8px">No alerts configured</div>';
        }
        break;
      }
      case 'cost-overview': {
        try {
          const cost = await apiFetch('/api/analytics/cost/summary');
          el.innerHTML = `<div class="db-mini-stats">
            <div class="db-mini-stat"><span class="db-stat-num">$${(cost.today || 0).toFixed(2)}</span><span class="db-stat-lbl">Today</span></div>
            <div class="db-mini-stat"><span class="db-stat-num">$${(cost.projected_monthly || cost.month || 0).toFixed(2)}</span><span class="db-stat-lbl">Projected/mo</span></div>
          </div>`;
        } catch (_) {
          el.innerHTML = '<div class="db-mini-stats"><div class="db-mini-stat"><span class="db-stat-num">—</span><span class="db-stat-lbl">No cost data</span></div></div>';
        }
        break;
      }
      case 'agent-card': {
        const agentName = (w.config && w.config.agent) || '';
        if (!agentName) {
          el.innerHTML = '<div class="text-secondary" style="padding:12px">Configure an agent to display</div>';
          break;
        }
        try {
          const agents = await API.getAgents();
          const agent = agents.find(a => (a.name || a.id) === agentName);
          if (agent) {
            el.innerHTML = `<div class="db-agent-card-detail">
              <div class="db-agent-card-name">${Utils.esc(agent.name || agent.id)}</div>
              <span class="db-pill db-pill-${agent.status || 'offline'}">${agent.status || 'offline'}</span>
              <div class="db-agent-card-meta">${agent.last_seen ? 'Last seen: ' + Utils.timeAgo(agent.last_seen) : ''}</div>
            </div>`;
          } else {
            el.innerHTML = `<div class="text-secondary" style="padding:8px">Agent "${Utils.esc(agentName)}" not found</div>`;
          }
        } catch (_) {
          el.innerHTML = '<div class="text-secondary" style="padding:8px">Error</div>';
        }
        break;
      }
      default:
        el.innerHTML = `<div class="text-secondary" style="padding:12px">Unknown widget: ${Utils.esc(w.type)}</div>`;
    }
  },

  // ── Widget Picker ──

  _widgetTypes: [
    { type: 'agent-status', icon: '📊', label: 'Agent Status', w: 6, h: 2 },
    { type: 'task-summary', icon: '📈', label: 'Task Summary', w: 3, h: 1 },
    { type: 'activity-feed', icon: '📋', label: 'Activity Feed', w: 6, h: 3 },
    { type: 'alerts', icon: '🔔', label: 'Alerts', w: 4, h: 2 },
    { type: 'cost-overview', icon: '💰', label: 'Cost Overview', w: 3, h: 1 },
    { type: 'agent-card', icon: '🤖', label: 'Agent Card', w: 3, h: 2 },
  ],

  _widgetLabel(type) {
    const t = this._widgetTypes.find(w => w.type === type);
    return t ? `${t.icon} ${t.label}` : type;
  },

  _togglePicker(show) {
    const picker = document.getElementById('dbWidgetPicker');
    if (!picker) return;
    picker.style.display = show ? 'block' : 'none';
    if (show) {
      const items = document.getElementById('dbPickerItems');
      items.innerHTML = this._widgetTypes.map(t => `
        <button class="db-picker-item" data-type="${t.type}">
          <span class="db-picker-icon">${t.icon}</span>
          <span class="db-picker-label">${t.label}</span>
        </button>
      `).join('');
      items.querySelectorAll('.db-picker-item').forEach(btn => {
        btn.addEventListener('click', () => {
          this._addWidget(btn.dataset.type);
          this._togglePicker(false);
        });
      });
    }
  },

  _addWidget(type) {
    const def = this._widgetTypes.find(t => t.type === type) || { w: 3, h: 1 };
    // Find next Y position
    const widgets = this._activeDash.widgets || [];
    let maxY = 0;
    widgets.forEach(w => { maxY = Math.max(maxY, w.y + w.h); });
    const widget = {
      id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type,
      x: 0,
      y: maxY,
      w: def.w,
      h: def.h,
      config: {}
    };
    this._activeDash.widgets = [...widgets, widget];
    this._renderGrid();
  },

  _removeWidget(wid) {
    this._activeDash.widgets = (this._activeDash.widgets || []).filter(w => w.id !== wid);
    this._renderGrid();
  },

  // ── Config Popover ──

  _showConfig(wid) {
    const w = (this._activeDash.widgets || []).find(x => x.id === wid);
    if (!w) return;

    // Remove existing popover
    document.querySelector('.db-config-popover')?.remove();

    const widgetEl = document.querySelector(`[data-wid="${wid}"]`);
    if (!widgetEl) return;

    const popover = document.createElement('div');
    popover.className = 'db-config-popover';

    let fields = '';
    if (w.type === 'agent-card') {
      fields = `<label class="db-config-label">Agent Name<input class="input" id="cfgAgent" value="${Utils.esc((w.config && w.config.agent) || '')}"></label>`;
    } else if (w.type === 'activity-feed') {
      fields = `<label class="db-config-label">Limit<input class="input" id="cfgLimit" type="number" value="${(w.config && w.config.limit) || 10}"></label>`;
    }

    fields += `
      <label class="db-config-label">Width (1-12)<input class="input" id="cfgW" type="number" min="1" max="12" value="${w.w}"></label>
      <label class="db-config-label">Height (1-4)<input class="input" id="cfgH" type="number" min="1" max="4" value="${w.h}"></label>
    `;

    popover.innerHTML = `
      <div class="db-config-title">Configure: ${this._widgetLabel(w.type)}</div>
      ${fields}
      <div class="db-config-actions">
        <button class="btn btn-sm btn-outline" id="cfgCancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="cfgSave">Save</button>
      </div>
    `;

    widgetEl.appendChild(popover);

    document.getElementById('cfgCancel').addEventListener('click', () => popover.remove());
    document.getElementById('cfgSave').addEventListener('click', () => {
      w.w = Math.max(1, Math.min(12, parseInt(document.getElementById('cfgW').value) || w.w));
      w.h = Math.max(1, Math.min(4, parseInt(document.getElementById('cfgH').value) || w.h));
      if (w.type === 'agent-card') {
        w.config = { ...w.config, agent: document.getElementById('cfgAgent').value.trim() };
      } else if (w.type === 'activity-feed') {
        w.config = { ...w.config, limit: parseInt(document.getElementById('cfgLimit').value) || 10 };
      }
      popover.remove();
      this._renderGrid();
    });
  },

  // ── Drag & Drop ──

  _initDrag() {
    const grid = document.getElementById('dbGrid');
    if (!grid) return;

    grid.querySelectorAll('.db-widget-drag-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const widgetEl = handle.closest('.db-widget');
        const wid = widgetEl.dataset.wid;
        const rect = grid.getBoundingClientRect();
        const colW = rect.width / 12;
        const rowH = 120;

        widgetEl.classList.add('dragging');

        const ghost = document.createElement('div');
        ghost.className = 'db-drag-ghost';
        grid.appendChild(ghost);

        const w = (this._activeDash.widgets || []).find(x => x.id === wid);
        if (!w) return;

        const onMove = (ev) => {
          const relX = ev.clientX - rect.left;
          const relY = ev.clientY - rect.top + grid.scrollTop;
          const newX = Math.max(0, Math.min(12 - w.w, Math.round(relX / colW)));
          const newY = Math.max(0, Math.round(relY / rowH));

          ghost.style.gridColumn = `${newX + 1} / span ${w.w}`;
          ghost.style.gridRow = `${newY + 1} / span ${w.h}`;
          ghost.style.display = 'block';

          this._dragState = { wid, newX, newY };
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          widgetEl.classList.remove('dragging');
          ghost.remove();

          if (this._dragState && w) {
            w.x = this._dragState.newX;
            w.y = this._dragState.newY;
            this._dragState = null;
            this._renderGrid();
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  },

  // ── Events ──

  _bindEvents() {
    document.getElementById('dbEditToggle')?.addEventListener('click', async () => {
      if (this._editing) {
        // Save
        if (this._activeDash) {
          try {
            await API.updateDashboard(this._activeDash.id, {
              name: this._activeDash.name,
              widgets: this._activeDash.widgets
            });
          } catch (e) {
            console.error('Save failed', e);
          }
        }
        this._editing = false;
        this._togglePicker(false);
      } else {
        this._editing = true;
      }
      const btn = document.getElementById('dbEditToggle');
      if (btn) btn.innerHTML = this._editing ? '✓ Done' : '✏️ Customize';
      this._renderTabs();
      this._renderGrid();
    });

    document.getElementById('dbNewBtn')?.addEventListener('click', async () => {
      const name = prompt('Dashboard name:');
      if (!name) return;
      try {
        const d = await API.createDashboard(name, []);
        this._dashboards.push(d);
        this._activeDash = d;
        this._renderTabs();
        this._renderGrid();
      } catch (e) { console.error(e); }
    });

    document.getElementById('dbPickerClose')?.addEventListener('click', () => this._togglePicker(false));
  },

  async _deleteDashboard(id) {
    if (!confirm('Delete this dashboard?')) return;
    try {
      await API.deleteDashboard(id);
      this._dashboards = this._dashboards.filter(d => d.id !== id);
      if (this._activeDash?.id === id) {
        this._activeDash = this._dashboards[0] || null;
      }
      this._renderTabs();
      this._renderGrid();
    } catch (e) { console.error(e); }
  },

  // ── Styles ──

  _injectStyles() {
    if (document.getElementById('db-builder-styles')) return;
    const style = document.createElement('style');
    style.id = 'db-builder-styles';
    style.textContent = `
      .db-builder { display: flex; flex-direction: column; height: 100%; }

      /* Header */
      .db-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 0; border-bottom: 1px solid var(--border-default);
        margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
      }
      .db-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
      .db-tab {
        padding: 6px 16px; border-radius: 8px; border: 1px solid var(--border-default);
        background: transparent; color: var(--text-secondary); cursor: pointer;
        font-size: 13px; position: relative; transition: all .15s;
      }
      .db-tab:hover { background: var(--bg-surface-hover); }
      .db-tab.active { background: var(--bg-surface); color: var(--text-primary); border-color: var(--accent); }
      .db-tab-delete {
        margin-left: 6px; opacity: 0.5; cursor: pointer; font-size: 11px;
      }
      .db-tab-delete:hover { opacity: 1; color: var(--status-error, #ef4444); }
      .db-header-actions { display: flex; gap: 8px; }

      /* Grid */
      .db-grid-container { flex: 1; overflow-y: auto; position: relative; }
      .db-grid-container.editing { background-image:
        repeating-linear-gradient(90deg, var(--border-default) 0, var(--border-default) 1px, transparent 1px, transparent calc(100%/12));
        background-size: 100% 100%;
      }
      .db-grid {
        display: grid; grid-template-columns: repeat(12, 1fr);
        grid-auto-rows: 120px; gap: 16px; padding: 4px 0;
      }

      /* Widget */
      .db-widget {
        background: var(--bg-surface); border: 1px solid var(--border-default);
        border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
        transition: box-shadow .2s, transform .2s;
      }
      .db-grid-container.editing .db-widget {
        border-style: dashed; border-color: var(--accent, #6366f1);
        cursor: default;
      }
      .db-widget.dragging { opacity: 0.4; }
      .db-widget-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px 6px; min-height: 32px;
      }
      .db-widget-title {
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-secondary);
      }
      .db-widget-actions { display: flex; gap: 4px; }
      .db-widget-btn {
        width: 24px; height: 24px; border: none; background: var(--bg-surface-hover);
        border-radius: 6px; cursor: pointer; color: var(--text-secondary);
        display: flex; align-items: center; justify-content: center; font-size: 13px;
      }
      .db-widget-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
      .db-widget-body { flex: 1; overflow: auto; padding: 0 14px 10px; }
      .db-widget-drag-handle {
        text-align: center; padding: 2px; cursor: grab;
        color: var(--text-secondary); font-size: 14px; letter-spacing: 2px;
        user-select: none;
      }
      .db-widget-drag-handle:active { cursor: grabbing; }

      /* Drag Ghost */
      .db-drag-ghost {
        background: var(--accent, #6366f1); opacity: 0.15; border-radius: 12px;
        border: 2px dashed var(--accent, #6366f1); display: none; pointer-events: none;
      }

      /* Add zone */
      .db-add-zone {
        display: flex; align-items: center; justify-content: center;
        min-height: 80px; border: 2px dashed var(--border-default);
        border-radius: 12px; margin-top: 8px;
      }

      /* Widget Picker */
      .db-widget-picker {
        position: fixed; bottom: 0; left: 0; right: 0;
        background: var(--bg-elevated); border-top: 1px solid var(--border-default);
        padding: 16px 24px; z-index: 100; max-height: 320px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
      }
      .db-picker-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; font-weight: 600; color: var(--text-primary);
      }
      .db-picker-close {
        background: none; border: none; color: var(--text-secondary);
        font-size: 18px; cursor: pointer;
      }
      .db-picker-items { display: flex; gap: 12px; flex-wrap: wrap; }
      .db-picker-item {
        display: flex; flex-direction: column; align-items: center;
        padding: 16px 20px; border-radius: 12px; border: 1px solid var(--border-default);
        background: var(--bg-surface); cursor: pointer; gap: 6px;
        transition: all .15s; min-width: 100px;
      }
      .db-picker-item:hover { border-color: var(--accent); background: var(--bg-surface-hover); }
      .db-picker-icon { font-size: 24px; }
      .db-picker-label { font-size: 12px; color: var(--text-secondary); }

      /* Config Popover */
      .db-config-popover {
        position: absolute; top: 40px; right: 8px; z-index: 50;
        background: var(--bg-elevated); border: 1px solid var(--border-default);
        border-radius: 12px; padding: 16px; min-width: 240px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .db-config-title { font-weight: 600; margin-bottom: 12px; font-size: 13px; }
      .db-config-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
      .db-config-label input { display: block; width: 100%; margin-top: 4px; }
      .db-config-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }

      /* Widget content styles */
      .db-agent-pills { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }
      .db-pill {
        padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
        background: var(--bg-surface-hover); color: var(--text-secondary);
      }
      .db-pill-online { background: rgba(34,197,94,0.15); color: #22c55e; }
      .db-pill-busy { background: rgba(234,179,8,0.15); color: #eab308; }
      .db-pill-offline { background: rgba(107,114,128,0.15); color: #6b7280; }

      .db-mini-stats { display: flex; gap: 16px; padding: 8px 0; }
      .db-mini-stat { display: flex; flex-direction: column; align-items: center; }
      .db-stat-num { font-size: 24px; font-weight: 700; color: var(--text-primary); }
      .db-stat-lbl { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; }

      .db-activity-list { display: flex; flex-direction: column; gap: 6px; }
      .db-activity-item { display: flex; gap: 8px; font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--border-default); }
      .db-activity-agent { font-weight: 600; color: var(--accent); white-space: nowrap; }
      .db-activity-text { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .db-activity-time { color: var(--text-secondary); opacity: 0.6; white-space: nowrap; font-size: 11px; }

      .db-alerts-summary { text-align: center; padding: 8px 0; }
      .db-alerts-list { display: flex; flex-direction: column; gap: 4px; }
      .db-alert-row { font-size: 12px; padding: 4px 8px; background: var(--bg-surface-hover); border-radius: 6px; color: var(--text-secondary); }

      .db-agent-card-detail { padding: 8px 0; }
      .db-agent-card-name { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
      .db-agent-card-meta { margin-top: 8px; font-size: 12px; color: var(--text-secondary); }
    `;
    document.head.appendChild(style);
  }
};
