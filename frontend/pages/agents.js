/* AgentBoard — Agents Grid + Detail Page */

window.Pages = window.Pages || {};

Pages.agents = {
  _agents: [],
  _wsHandlers: [],
  _refreshTimer: null,
  _currentAgentId: null,
  _currentTab: 'soul',
  _selected: new Set(),

  async render(container, subView) {
    this._currentAgentId = subView || null;

    if (this._currentAgentId) {
      await this._renderDetail(container, this._currentAgentId);
    } else {
      await this._renderGrid(container);
    }
  },

  /* ─── Grid View ─── */
  async _renderGrid(container) {
    this._selected = new Set();
    container.innerHTML = `
      <div id="agentsPageWrapper" style="position:relative;padding-bottom:72px">
        <div id="agentsGridToolbar" style="display:none;align-items:center;gap:12px;margin-bottom:12px;padding:8px 0">
          <button class="btn-secondary" id="agentsSelectAllBtn" onclick="Pages.agents._toggleSelectAll()" style="font-size:12px;padding:4px 10px">Select All</button>
          <span id="agentsSelectCount" style="font-size:13px;color:var(--text-secondary)"></span>
        </div>
        <div class="agents-grid" id="agentsGrid">
          <div class="loading-state"><div class="spinner"></div><span>Loading agents...</span></div>
        </div>
      </div>
      <div id="bulkActionBar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-width,220px);right:0;z-index:100;background:var(--bg-surface);border-top:1px solid var(--border-default);padding:12px 24px;display:none;align-items:center;gap:12px;box-shadow:0 -2px 12px rgba(0,0,0,0.15)">
        <span id="bulkSelectedCount" style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1"></span>
        <span id="bulkProgress" style="font-size:12px;color:var(--text-tertiary);display:none"></span>
        <button class="btn-secondary" onclick="Pages.agents._bulkPause()" style="font-size:13px;padding:5px 14px">⏸️ Pause Selected</button>
        <button class="btn-secondary" onclick="Pages.agents._bulkResume()" style="font-size:13px;padding:5px 14px;color:var(--success,#22c55e)">▶️ Resume Selected</button>
        <button class="btn-secondary" onclick="Pages.agents._bulkKill()" style="font-size:13px;padding:5px 14px;color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)">💀 Kill Selected</button>
        <button class="btn-secondary" onclick="Pages.agents._clearSelection()" style="font-size:12px;padding:4px 8px;color:var(--text-tertiary)" title="Clear selection">✕</button>
      </div>`;

    try {
      this._agents = await API.getAgents();
      this._paintGrid();
    } catch (e) {
      Utils.showEmpty(document.getElementById('agentsGrid'), '⚠️', 'Failed to load agents', e.message);
    }

    // WS live status
    const handler = (agents) => {
      if (Array.isArray(agents)) {
        // Merge new statuses
        agents.forEach(updated => {
          const idx = this._agents.findIndex(a => a.id === updated.id || a.name === updated.name);
          if (idx >= 0) Object.assign(this._agents[idx], updated);
        });
        this._paintGrid();
      }
    };
    WS.on('agent_status_update', handler);
    this._wsHandlers.push(['agent_status_update', handler]);

    this._refreshTimer = setInterval(async () => {
      try {
        this._agents = await API.getAgents();
        this._paintGrid();
      } catch (_) {}
    }, 30000);
  },

  _paintGrid() {
    const grid = document.getElementById('agentsGrid');
    if (!grid) return;

    if (!this._agents || this._agents.length === 0) {
      Utils.showEmpty(grid, '👥', 'No agents found', 'Configure agents in agents.yaml');
      return;
    }

    // Show toolbar
    const toolbar = document.getElementById('agentsGridToolbar');
    if (toolbar) toolbar.style.display = 'flex';

    grid.innerHTML = this._agents.map(a => {
      const teamStyle = Utils.teamBadgeStyle(a);
      const team = a.team || '';
      const model = Utils.formatModel(a.currentModel || a.model);
      const agentId = a.id || a.name;
      const isSelected = this._selected.has(agentId);
      const isOnline = a.status === 'active' || a.status === 'online';
      return `
        <div class="agent-card${isSelected ? ' agent-card--selected' : ''}${isOnline ? ' agent-card--online' : ''} animate-fade-in" style="position:relative" data-agent-id="${Utils.esc(agentId)}">
          <div class="agent-card__checkbox" style="position:absolute;top:8px;left:8px;z-index:2"
               onclick="event.stopPropagation(); Pages.agents._toggleSelect('${Utils.esc(agentId)}')">
            <input type="checkbox" ${isSelected ? 'checked' : ''}
                   onclick="event.stopPropagation()"
                   style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent,#6366f1)">
          </div>
          <div onclick="App.navigate('agents/${Utils.esc(agentId)}')" style="cursor:pointer;padding-left:20px">
            <div class="agent-card__header">
              <div class="agent-card__name-row">
                <span class="agent-card__emoji">${Utils.esc(a.emoji || '🤖')}</span>
                <span class="agent-card__name">${Utils.esc(a.name || a.displayName || agentId)}</span>
              </div>
              ${Utils.statusPill(a.status)}
            </div>
            <div class="agent-card__role">${Utils.esc(a.role || '')}</div>
            ${(a.skills || a.capabilities || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${(a.skills || a.capabilities || []).map(s => `<span style="font-size:10px;padding:2px 6px;border-radius:var(--radius-pill);background:var(--accent-muted);color:var(--accent)">${Utils.esc(typeof s === 'string' ? s : s.name || '')}</span>`).join('')}</div>` : ''}
            <div class="agent-card__footer">
              <span class="agent-card__model">${Utils.esc(model)}</span>
              ${team ? `<span class="badge" style="${teamStyle}">${Utils.esc(team)}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    this._updateBulkBar();
  },

  /* ─── Detail View ─── */
  async _renderDetail(container, agentId) {
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Loading agent...</span></div>`;

    let agent;
    try {
      const agents = await API.getAgents();
      agent = agents.find(a => a.id === agentId || a.name === agentId);
    } catch (e) {
      Utils.showEmpty(container, '⚠️', 'Agent not found');
      return;
    }

    if (!agent) {
      Utils.showEmpty(container, '🔍', `Agent "${agentId}" not found`);
      return;
    }

    const teamStyle = agent.team ? `style="${Utils.teamBadgeStyle(agent)}"` : '';

    const actionBtns = this._buildActionButtons(agent.status, agentId);

    container.innerHTML = `
      <div class="agent-detail-header">
        <button class="agent-detail-back" onclick="App.navigate('agents')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0"><path d="M9 11L5 7L9 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Agents
        </button>
        <div class="agent-detail-title">
          <span class="agent-detail-emoji">${Utils.esc(agent.emoji || '🤖')}</span>
          <span class="agent-detail-name">${Utils.esc(agent.name || agent.displayName || agentId)}</span>
          <div class="agent-detail-status" id="agentStatusPill">
            ${Utils.statusPill(agent.status)}
          </div>
        </div>
        <div class="agent-detail-meta">
          <span>${Utils.esc(agent.role || '')}</span>
          ${agent.team ? `<span style="color:var(--text-tertiary)">·</span><span class="badge" ${teamStyle}>${Utils.esc(agent.team)}</span>` : ''}
          ${agent.currentModel ? `<span style="color:var(--text-tertiary)">·</span><span class="model-badge">${Utils.esc(agent.currentModel)}</span>` : ''}
        </div>
        <div class="agent-detail-actions" id="agentActionBtns" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${actionBtns}
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab active" data-tab="soul" onclick=\"Pages.agents._switchTab('soul', '${agentId}')\">Soul</button>
        <button class="tab" data-tab="memory" onclick=\"Pages.agents._switchTab('memory', '${agentId}')\">Memory</button>
        <button class="tab" data-tab="heartbeat" onclick=\"Pages.agents._switchTab('heartbeat', '${agentId}')\">Heartbeat</button>
        <button class="tab" data-tab="agents_md" onclick=\"Pages.agents._switchTab('agents_md', '${agentId}')\">Agents.md</button>
        <button class="tab" data-tab="skills" onclick=\"Pages.agents._switchTab('skills', '${agentId}')\">Skills</button>
        <button class="tab" data-tab="activity" onclick=\"Pages.agents._switchTab('activity', '${agentId}')\">Activity</button>
        <button class="tab" data-tab="timeline" onclick=\"Pages.agents._switchTab('timeline', '${agentId}')\">Timeline</button>
        <button class="tab" data-tab="notes" onclick=\"Pages.agents._switchTab('notes', '${agentId}')\">📝 Notes</button>
        <button class="tab" data-tab="health" onclick=\"Pages.agents._switchTab('health', '${agentId}')\">🏥 Health</button>
        <button class="tab" data-tab="snapshots" onclick=\"Pages.agents._switchTab('snapshots', '${agentId}')\">📸 Snapshots</button>
        <button class="tab" data-tab="scorecard" onclick=\"Pages.agents._switchTab('scorecard', '${agentId}')\">📊 Scorecard</button>
      </div>

      <div id="agentTabContent"></div>`;

    this._currentTab = 'soul';
    this._loadTab('soul', agentId);
  },

  _switchTab(tab, agentId) {
    this._currentTab = tab;
    document.querySelectorAll('.tab-bar .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    this._loadTab(tab, agentId);
  },

  async _loadTab(tab, agentId) {
    const el = document.getElementById('agentTabContent');
    if (!el) return;

    if (tab === 'activity') {
      // Wrap in a container so we can append commits below
      el.innerHTML = `
        <div id="agentActivityFeed"></div>
        <div id="agentCommitsSection" style="margin-top:24px"></div>`;
      Pages.activity._renderFeed(document.getElementById('agentActivityFeed'), agentId);
      Pages.agents._loadCommitsSection(document.getElementById('agentCommitsSection'), agentId);
      return;
    }

    if (tab === 'skills') {
      await this._loadSkillsTab(el, agentId);
      return;
    }

    if (tab === 'timeline') {
      await this._loadTimelineTab(el, agentId);
      return;
    }

    if (tab === 'notes') {
      await this._loadNotesTab(el, agentId);
      return;
    }

    if (tab === 'health') {
      await this._loadHealthTab(el, agentId);
      return;
    }

    if (tab === 'snapshots') {
      await this._loadSnapshotsTab(el, agentId);
      return;
    }
    if (tab === 'scorecard') {
      await this._loadScorecard(el, agentId);
      return;
    }

    Utils.showLoading(el, 'Loading...');

    try {
      const soul = await API.getAgentSoul(agentId);

      let fileData = null;
      let fileName = '';
      let fileKey = '';
      let emptyMsg = '';

      if (tab === 'soul') {
        fileData = soul.soul;
        fileName = 'SOUL.md';
        fileKey = 'soul';
        emptyMsg = 'No soul file found';
      } else if (tab === 'memory') {
        fileData = soul.memory;
        fileName = 'MEMORY.md';
        fileKey = 'memory';
        emptyMsg = 'No memory file yet';
      } else if (tab === 'heartbeat') {
        fileData = soul.heartbeat;
        fileName = 'HEARTBEAT.md';
        fileKey = 'heartbeat';
        emptyMsg = 'No heartbeat configured';
      } else if (tab === 'agents_md') {
        fileData = soul.agents;
        fileName = 'AGENTS.md';
        fileKey = 'agents';
        emptyMsg = 'No AGENTS.md found';
      }

      if (!fileData) {
        Utils.showEmpty(el, '📄', emptyMsg, fileName + ' not available for this agent');
        return;
      }

      const rawContent = fileData.content || '';
      const html = DOMPurify.sanitize(marked.parse(rawContent));
      const modTime = fileData.modified ? new Date(fileData.modified) : null;

      el.innerHTML = `
        <div style="position:relative">
          <div style="position:absolute;top:0;right:0;display:flex;gap:6px;z-index:10">
            <button class="btn-icon" id="editBtn_${tab}" onclick="Pages.agents._startEdit('${tab}','${agentId}','${fileKey}')" title="Edit ${fileName}" aria-label="Edit">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="markdown-body" id="mdBody_${tab}">${html}</div>
        </div>
        <div class="content-timestamp">
          <span class="content-timestamp-text" id="tsText_${tab}" title="${modTime ? Utils.absTime(fileData.modified) : ''}">
            ${modTime ? 'Updated ' + Utils.relTime(fileData.modified) : ''}
          </span>
          <button class="content-timestamp-refresh" onclick="Pages.agents._loadTab('${tab}', '${agentId}')" title="Refresh" aria-label="Refresh">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6A4.5 4.5 0 106 1.5a4.5 4.5 0 00-3.2 1.3L1.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 1.5V4H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`;

      // Store raw content for edit mode
      el.dataset.rawContent = rawContent;
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load data', e.message);
    }
  },

  _startEdit(tab, agentId, fileKey) {
    const el = document.getElementById('agentTabContent');
    if (!el) return;
    const rawContent = el.dataset.rawContent || '';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">Editing ${fileKey.toUpperCase()}.md</span>
          <div style="display:flex;gap:8px">
            <button class="btn-secondary" onclick="Pages.agents._cancelEdit('${tab}','${agentId}')" style="font-size:13px;padding:5px 12px">Cancel</button>
            <button class="btn-primary" id="saveBtn_${tab}" onclick="Pages.agents._saveEdit('${tab}','${agentId}','${fileKey}')" style="font-size:13px;padding:5px 12px">💾 Save</button>
          </div>
        </div>
        <textarea id="editArea_${tab}" style="width:100%;min-height:500px;font-family:var(--font-mono,monospace);font-size:13px;line-height:1.6;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:12px;color:var(--text-primary);resize:vertical;box-sizing:border-box;outline:none" spellcheck="false"></textarea>
      </div>`;

    const ta = document.getElementById(`editArea_${tab}`);
    if (ta) ta.value = rawContent;
  },

  _cancelEdit(tab, agentId) {
    this._loadTab(tab, agentId);
  },

  async _saveEdit(tab, agentId, fileKey) {
    const ta = document.getElementById(`editArea_${tab}`);
    const saveBtn = document.getElementById(`saveBtn_${tab}`);
    if (!ta || !saveBtn) return;

    const content = ta.value;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await API.updateAgentSoul(agentId, fileKey, content);
      this._showToast('✅ Saved successfully', 'success');
      this._loadTab(tab, agentId);
    } catch (e) {
      this._showToast('❌ Save failed: ' + e.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save';
    }
  },

  _showToast(message, type = 'success') {
    const existing = document.getElementById('agentToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'agentToast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:12px 18px;border-radius:8px;font-size:14px;font-weight:500;
      background:${type === 'success' ? 'var(--success,#22c55e)' : 'var(--danger,#ef4444)'};
      color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.25);
      animation:slideInToast 0.2s ease;pointer-events:none;
    `;
    toast.textContent = message;

    // Add animation keyframes if not already present
    if (!document.getElementById('toastStyles')) {
      const style = document.createElement('style');
      style.id = 'toastStyles';
      style.textContent = '@keyframes slideInToast{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  async _loadTimelineTab(el, agentId, hours) {
    const h = hours || parseInt(el.dataset.timelineHours || '24', 10);
    el.dataset.timelineHours = h;
    Utils.showLoading(el, 'Loading timeline...');

    let events;
    try {
      events = await API.getAgentTimeline(agentId, h);
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load timeline', e.message);
      return;
    }

    if (!events || events.length === 0) {
      Utils.showEmpty(el, '🕐', 'No timeline events', 'No activity found in the last 24 hours');
      return;
    }

    const typeConfig = {
      response:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  label: 'Response', icon: '💬' },
      tool_call: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   label: 'Tool',     icon: '🔧' },
      error:     { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Error',    icon: '❌' },
      task:      { color: '#a855f7', bg: 'rgba(168,85,247,0.1)',  label: 'Task',     icon: '📋' },
    };

    const now = Date.now();

    function relTime(isoStr) {
      const ms = now - new Date(isoStr).getTime();
      const s = Math.floor(ms / 1000);
      if (s < 60) return 'just now';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    function absTime(isoStr) {
      return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const reversedEvents = [...events].reverse(); // most recent first

    const rows = reversedEvents.map((ev, i) => {
      const cfg = typeConfig[ev.type] || typeConfig.response;
      const safeTitle = Utils.esc(ev.title || '');
      const safeDetail = Utils.esc(ev.detail || '');
      const rel = relTime(ev.timestamp);
      const abs = absTime(ev.timestamp);
      return `
        <div class="tl-event" data-idx="${i}" style="display:flex;gap:16px;padding:10px 0;cursor:pointer;align-items:flex-start" onclick="Pages.agents._toggleTimelineEvent(this)">
          <div style="display:flex;flex-direction:column;align-items:center;min-width:52px;padding-top:2px">
            <span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap" title="${Utils.esc(ev.timestamp)}">${rel}</span>
            <span style="font-size:10px;color:var(--text-tertiary);opacity:0.7">${abs}</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0">
            <div style="width:2px;background:${cfg.color};border-radius:2px;min-height:40px;flex-shrink:0;margin-top:4px;opacity:0.6"></div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:12px;background:${cfg.bg};color:${cfg.color};text-transform:uppercase;letter-spacing:0.05em">${cfg.label}</span>
                <span style="font-size:13px;color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${safeTitle}</span>
              </div>
              <div class="tl-detail" style="display:none;margin-top:6px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:6px;font-size:12px;color:var(--text-secondary);font-family:var(--font-mono,monospace);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto">${safeDetail}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div style="padding:4px 0 0 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:13px;color:var(--text-secondary)">${events.length} events</span>
            <select id="timelineHoursSelect" style="font-size:12px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:6px;color:var(--text-secondary);padding:3px 8px;cursor:pointer" onchange="Pages.agents._loadTimelineTab(document.getElementById('agentTabContent'),'${Utils.esc(agentId)}',parseInt(this.value))">
              ${[6,12,24,48,72].map(n => `<option value="${n}" ${n===h?'selected':''}>${n}h</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${Object.entries(typeConfig).map(([k,v]) => `<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:${v.bg};color:${v.color};font-weight:600">${v.icon} ${v.label}</span>`).join('')}
          </div>
        </div>
        <div style="border-left:2px solid var(--border-default);padding-left:0;margin-left:52px">
          ${rows}
        </div>
      </div>`;
  },

  _toggleTimelineEvent(el) {
    const detail = el.querySelector('.tl-detail');
    if (!detail) return;
    const isVisible = detail.style.display !== 'none';
    detail.style.display = isVisible ? 'none' : 'block';
  },

  async _loadSkillsTab(el, agentId) {
    Utils.showLoading(el, 'Loading skills...');
    try {
      const [skills, soul] = await Promise.all([
        API.getAgentSkills(agentId),
        API.getAgentSoul(agentId)
      ]);

      let html = '';

      // Render TOOLS.md if present
      if (soul.tools && soul.tools.content) {
        const toolsHtml = DOMPurify.sanitize(marked.parse(soul.tools.content));
        html += `<div class="markdown-body" style="margin-bottom:24px">${toolsHtml}</div>`;
      }

      // Render skills list
      if (skills && skills.length > 0) {
        html += `<h3 style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em">Available Skills</h3>`;
        html += `<div style="display:flex;flex-direction:column;gap:8px">`;
        skills.forEach(skill => {
          html += `
            <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:12px 16px;display:flex;align-items:baseline;gap:12px">
              <span style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);min-width:160px">${Utils.esc(skill.name)}</span>
              <span style="font-size:13px;color:var(--text-secondary)">${Utils.esc(skill.description || 'No description')}</span>
            </div>`;
        });
        html += `</div>`;
      } else if (!soul.tools) {
        Utils.showEmpty(el, '🛠️', 'No skills found', 'No skills directory or TOOLS.md found for this agent');
        return;
      }

      el.innerHTML = html;
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load skills', e.message);
    }
  },

  async _loadNotesTab(el, agentId) {
    Utils.showLoading(el, 'Loading notes...');
    let annotations = [];
    try {
      annotations = await API.getAnnotations(agentId);
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load notes', e.message);
      return;
    }

    const renderAnnotations = (anns) => {
      if (!anns || anns.length === 0) {
        return `<div style="color:var(--text-tertiary);font-size:13px;padding:16px 0;text-align:center">No notes yet. Add the first one below.</div>`;
      }
      return anns.map(ann => {
        const mdHtml = DOMPurify.sanitize(marked.parse(ann.content || ''));
        const ts = Utils.relTime ? Utils.relTime(ann.created_at) : new Date(ann.created_at).toLocaleString();
        const tsAbs = Utils.absTime ? Utils.absTime(ann.created_at) : new Date(ann.created_at).toISOString();
        const isOwn = ann.author === 'ali';
        return `
          <div class="annotation-item" data-id="${Utils.esc(ann.id)}" style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:12px;font-weight:600;color:var(--accent,#6366f1)">@${Utils.esc(ann.author)}</span>
                <span style="font-size:11px;color:var(--text-tertiary)" title="${Utils.esc(tsAbs)}">${Utils.esc(ts)}</span>
              </div>
              ${isOwn ? `<button onclick="Pages.agents._deleteAnnotation('${Utils.esc(agentId)}','${Utils.esc(ann.id)}')" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);padding:2px 6px;border-radius:4px;font-size:12px;transition:color 0.15s" onmouseover="this.style.color='var(--danger,#ef4444)'" onmouseout="this.style.color='var(--text-tertiary)'" title="Delete note">🗑️</button>` : ''}
            </div>
            <div class="markdown-body" style="font-size:13px;line-height:1.6">${mdHtml}</div>
          </div>`;
      }).join('');
    };

    el.innerHTML = `
      <div style="max-width:720px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary)">Notes</span>
          <span style="font-size:12px;color:var(--text-tertiary)">${annotations.length} note${annotations.length !== 1 ? 's' : ''}</span>
        </div>
        <div id="annotationsList">
          ${renderAnnotations(annotations)}
        </div>
        <div style="margin-top:20px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:14px 16px">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Add a note — supports Markdown. <kbd style="font-size:10px;padding:1px 5px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:3px">Shift+Enter</kbd> to submit</div>
          <textarea id="annotationInput" placeholder="Write a note..." style="width:100%;min-height:80px;box-sizing:border-box;font-size:13px;font-family:var(--font-body);background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 10px;color:var(--text-primary);resize:vertical;outline:none;line-height:1.6"></textarea>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span style="font-size:11px;color:var(--text-tertiary)">as <strong>ali</strong></span>
            <button id="annotationSubmitBtn" onclick="Pages.agents._submitAnnotation('${Utils.esc(agentId)}')" class="btn-primary" style="font-size:13px;padding:5px 14px">Add Note</button>
          </div>
        </div>
      </div>`;

    // Bind Shift+Enter shortcut
    const ta = document.getElementById('annotationInput');
    if (ta) {
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          Pages.agents._submitAnnotation(agentId);
        }
      });
    }
  },

  async _submitAnnotation(agentId) {
    const ta = document.getElementById('annotationInput');
    const btn = document.getElementById('annotationSubmitBtn');
    if (!ta || !btn) return;
    const content = ta.value.trim();
    if (!content) return;

    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      await API.addAnnotation(agentId, content, 'ali');
      ta.value = '';
      // Reload the notes tab
      const el = document.getElementById('agentTabContent');
      if (el) await this._loadNotesTab(el, agentId);
    } catch (e) {
      alert('Failed to add note: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Add Note';
    }
  },

  async _deleteAnnotation(agentId, annId) {
    if (!confirm('Delete this note?')) return;
    try {
      await API.deleteAnnotation(agentId, annId);
      const el = document.getElementById('agentTabContent');
      if (el) await this._loadNotesTab(el, agentId);
    } catch (e) {
      alert('Failed to delete note: ' + e.message);
    }
  },

  async _loadCommitsSection(el, agentId) {
    if (!el) return;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
      <span style="font-size:12px;color:var(--text-tertiary)">Loading commits…</span>
    </div>`;

    let commits = [];
    try {
      commits = await API.getAgentCommits(agentId, 15);
    } catch (_) {}

    if (!commits || commits.length === 0) {
      el.innerHTML = '';
      return;
    }

    function relTime(isoStr) {
      const ms = Date.now() - new Date(isoStr).getTime();
      const s = Math.floor(ms / 1000);
      if (s < 60) return 'just now';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    const rows = commits.map(c => `
      <div class="activity-item" style="align-items:center">
        <div class="activity-item__avatar" style="background:rgba(34,197,94,0.12);color:#22c55e;font-size:14px;display:flex;align-items:center;justify-content:center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="2.5" stroke="#22c55e" stroke-width="1.5"/>
            <line x1="7" y1="1" x2="7" y2="4.5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="7" y1="9.5" x2="7" y2="13" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="activity-item__body">
          <div class="activity-item__header" style="gap:8px;flex-wrap:wrap">
            <code style="font-family:var(--font-mono,monospace);font-size:11px;background:rgba(34,197,94,0.12);color:#22c55e;padding:1px 6px;border-radius:4px;flex-shrink:0">${Utils.esc(c.hash)}</code>
            <span style="color:var(--text-primary);font-size:13px">${Utils.esc(c.message)}</span>
          </div>
          <div class="activity-item__detail" style="margin-top:2px">
            <span style="font-size:11px;color:var(--text-tertiary);background:var(--bg-surface);border:1px solid var(--border-default);padding:0 5px;border-radius:3px">${Utils.esc(c.repo)}</span>
          </div>
        </div>
        <div class="activity-item__time">${Utils.esc(relTime(c.date))}</div>
      </div>`).join('');

    el.innerHTML = `
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="2.5" stroke="#22c55e" stroke-width="1.5"/>
          <line x1="7" y1="1" x2="7" y2="4.5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="9.5" x2="7" y2="13" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em">Recent Commits</span>
      </div>
      <div class="activity-list">${rows}</div>`;
  },

  async _loadHealthTab(el, agentId) {
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Checking health...</span></div>';

    let health;
    try {
      health = await API.getAgentHealth(agentId);
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load health', e.message);
      return;
    }

    const statusConfig = {
      online:   { icon: '✅', label: 'Healthy',   color: '#22c55e' },
      busy:     { icon: '✅', label: 'Healthy',   color: '#22c55e' },
      idle:     { icon: '✅', label: 'Healthy',   color: '#22c55e' },
      degraded: { icon: '⚠️', label: 'Degraded',  color: '#f59e0b' },
      offline:  { icon: '❌', label: 'Unhealthy', color: '#ef4444' },
      killed:   { icon: '❌', label: 'Unhealthy', color: '#ef4444' },
      paused:   { icon: '⚠️', label: 'Paused',    color: '#9ca3af' },
      unknown:  { icon: '❓', label: 'Unknown',   color: '#6b7280' },
    };
    const sc = statusConfig[health.status] || statusConfig.unknown;
    const lastSeenText = health.last_seen
      ? Utils.relTime(health.last_seen) + ' (' + Utils.absTime(health.last_seen) + ')'
      : 'Never';

    const checksHTML = (health.checks || []).map(c => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-default,#2a2a3a);">
        <span style="font-size:16px;flex-shrink:0;margin-top:1px">${c.passed ? '✅' : '❌'}</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);text-transform:capitalize">${Utils.esc(c.name.replace(/_/g,' '))}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${Utils.esc(c.message)}</div>
        </div>
      </div>`).join('');

    const autoRestartChecked = health.auto_restart ? 'checked' : '';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px;padding-top:4px">

        <!-- Overall Status Card -->
        <div class="chart-card" style="padding:20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <div style="font-size:48px;line-height:1">${sc.icon}</div>
          <div style="flex:1;min-width:160px">
            <div style="font-size:22px;font-weight:700;color:${sc.color}">${sc.label}</div>
            <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px">Status: <strong style="color:var(--text-primary)">${Utils.esc(health.status)}</strong></div>
            <div style="font-size:13px;color:var(--text-tertiary);margin-top:2px">Last seen: <strong style="color:var(--text-primary)">${Utils.esc(lastSeenText)}</strong></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-end">
            <button id="forceHealthCheckBtn" class="btn-secondary"
              onclick="Pages.agents._forceHealthCheck('${Utils.esc(agentId)}')"
              style="font-size:13px;padding:6px 14px;white-space:nowrap">
              🔄 Force Health Check
            </button>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
              <div style="position:relative;display:inline-block;width:36px;height:20px">
                <input type="checkbox" id="autoRestartToggle" ${autoRestartChecked}
                  onchange="Pages.agents._setAutoRestart('${Utils.esc(agentId)}', this.checked)"
                  style="opacity:0;width:0;height:0;position:absolute">
                <span id="autoRestartSlider" style="
                  position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
                  border-radius:20px;transition:0.2s;
                  background:${health.auto_restart ? 'var(--accent,#B5CC18)' : 'var(--border-default,#e2e8f0)'};
                ">
                  <span style="
                    position:absolute;content:'';height:14px;width:14px;
                    left:${health.auto_restart ? '19px' : '3px'};bottom:3px;
                    background:white;border-radius:50%;transition:0.2s;
                    display:block;
                  "></span>
                </span>
              </div>
              Auto-Restart
            </label>
          </div>
        </div>

        <!-- Individual Checks -->
        <div class="chart-card" style="padding:20px">
          <div class="chart-card__title" style="margin-bottom:8px">Health Checks</div>
          ${checksHTML || '<div style="color:var(--text-tertiary);font-size:13px;padding:12px 0">No checks available</div>'}
        </div>

      </div>`;

    // Animate the toggle slider properly
    const toggle = document.getElementById('autoRestartToggle');
    if (toggle) {
      toggle.addEventListener('change', function() {
        const slider = document.getElementById('autoRestartSlider');
        if (slider) {
          slider.style.background = this.checked ? 'var(--accent,#B5CC18)' : 'var(--border-default,#e2e8f0)';
          const knob = slider.querySelector('span');
          if (knob) knob.style.left = this.checked ? '19px' : '3px';
        }
      });
    }
  },

  async _forceHealthCheck(agentId) {
    const btn = document.getElementById('forceHealthCheckBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking...'; }
    try {
      await API.forceHealthCheck(agentId);
      // Reload the health tab with fresh data
      const el = document.getElementById('agentTabContent');
      if (el) await this._loadHealthTab(el, agentId);
    } catch (e) {
      alert('Health check failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Force Health Check'; }
    }
  },

  async _setAutoRestart(agentId, enabled) {
    try {
      await API.setAutoRestart(agentId, enabled);
    } catch (e) {
      alert('Failed to update auto-restart: ' + e.message);
      // Revert the toggle
      const toggle = document.getElementById('autoRestartToggle');
      if (toggle) toggle.checked = !enabled;
    }
  },

  _buildActionButtons(status, agentId) {
    const id = Utils.esc(agentId);
    let btns = '';
    const canPause  = ['online', 'busy', 'idle'].includes(status);
    const canResume = status === 'paused';
    const canKill   = status !== 'killed';

    if (canPause) {
      btns += `<button class="btn-secondary" onclick="Pages.agents._doAgentAction('pause','${id}')" title="Pause agent" style="font-size:13px;padding:5px 12px">⏸️ Pause</button>`;
    }
    if (canResume) {
      btns += `<button class="btn-secondary" onclick="Pages.agents._doAgentAction('resume','${id}')" title="Resume agent" style="font-size:13px;padding:5px 12px;color:var(--success,#22c55e)">▶️ Resume</button>`;
    }
    if (canKill) {
      btns += `<button class="btn-secondary" onclick="Pages.agents._doAgentAction('kill','${id}')" title="Kill agent" style="font-size:13px;padding:5px 12px;color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)">💀 Kill</button>`;
    }
    return btns;
  },

  async _doAgentAction(action, agentId) {
    if (action === 'kill') {
      if (!confirm(`Are you sure you want to kill agent "${agentId}"? This cannot be undone.`)) return;
    }

    const btnContainer = document.getElementById('agentActionBtns');
    if (btnContainer) btnContainer.innerHTML = `<span style="font-size:13px;color:var(--text-tertiary)">Processing...</span>`;

    try {
      if (action === 'pause')  await API.pauseAgent(agentId);
      if (action === 'resume') await API.resumeAgent(agentId);
      if (action === 'kill')   await API.killAgent(agentId);

      // Reload agent to get updated status
      const agents = await API.getAgents();
      const updated = agents.find(a => a.id === agentId || a.name === agentId);
      if (updated) {
        const pill = document.getElementById('agentStatusPill');
        if (pill) pill.innerHTML = Utils.statusPill(updated.status);
        if (btnContainer) btnContainer.innerHTML = this._buildActionButtons(updated.status, agentId);
      }
    } catch (e) {
      if (btnContainer) {
        const agents = await API.getAgents().catch(() => []);
        const current = agents.find(a => a.id === agentId || a.name === agentId);
        btnContainer.innerHTML = this._buildActionButtons(current ? current.status : 'offline', agentId);
      }
      alert(`Failed to ${action} agent: ${e.message}`);
    }
  },

  /* ─── Bulk Selection ─── */

  _toggleSelect(agentId) {
    if (this._selected.has(agentId)) {
      this._selected.delete(agentId);
    } else {
      this._selected.add(agentId);
    }
    // Update checkbox and card styling without full repaint
    const card = document.querySelector(`[data-agent-id="${CSS.escape(agentId)}"]`);
    if (card) {
      const chk = card.querySelector('input[type="checkbox"]');
      if (chk) chk.checked = this._selected.has(agentId);
      card.classList.toggle('agent-card--selected', this._selected.has(agentId));
    }
    this._updateBulkBar();
  },

  _toggleSelectAll() {
    const btn = document.getElementById('agentsSelectAllBtn');
    if (this._selected.size === this._agents.length) {
      // Deselect all
      this._selected.clear();
      if (btn) btn.textContent = 'Select All';
    } else {
      // Select all
      this._agents.forEach(a => this._selected.add(a.id || a.name));
      if (btn) btn.textContent = 'Deselect All';
    }
    this._paintGrid();
  },

  _clearSelection() {
    this._selected.clear();
    const btn = document.getElementById('agentsSelectAllBtn');
    if (btn) btn.textContent = 'Select All';
    this._paintGrid();
  },

  _updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const selectCountEl = document.getElementById('agentsSelectCount');
    const selectAllBtn = document.getElementById('agentsSelectAllBtn');
    const n = this._selected.size;

    if (bar) {
      bar.style.display = n > 0 ? 'flex' : 'none';
    }
    if (countEl) {
      countEl.textContent = `${n} agent${n !== 1 ? 's' : ''} selected`;
    }
    if (selectCountEl) {
      selectCountEl.textContent = n > 0 ? `${n} selected` : '';
    }
    if (selectAllBtn) {
      selectAllBtn.textContent = (n === this._agents.length && n > 0) ? 'Deselect All' : 'Select All';
    }
  },

  async _bulkAction(action) {
    const ids = Array.from(this._selected);
    if (ids.length === 0) return;

    const progressEl = document.getElementById('bulkProgress');
    if (progressEl) { progressEl.style.display = 'inline'; progressEl.textContent = ''; }

    let done = 0;
    const errors = [];

    for (const id of ids) {
      try {
        if (action === 'pause')  await API.pauseAgent(id);
        if (action === 'resume') await API.resumeAgent(id);
        if (action === 'kill')   await API.killAgent(id);
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
      done++;
      if (progressEl) progressEl.textContent = `${done}/${ids.length}`;
    }

    if (progressEl) progressEl.style.display = 'none';

    if (errors.length > 0) {
      alert(`Some actions failed:\n${errors.join('\n')}`);
    }

    // Refresh agent list
    try {
      this._agents = await API.getAgents();
    } catch (_) {}
    this._selected.clear();
    this._paintGrid();
  },

  async _bulkPause() {
    await this._bulkAction('pause');
  },

  async _bulkResume() {
    await this._bulkAction('resume');
  },

  async _bulkKill() {
    const n = this._selected.size;
    if (!confirm(`Kill ${n} agent${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    await this._bulkAction('kill');
  },

  /* ─── Snapshots Tab ─── */

  async _loadSnapshotsTab(el, agentId) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Configuration Snapshots</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">Versioned backups of SOUL.md, MEMORY.md, HEARTBEAT.md and other config files</div>
        </div>
        <button class="btn-primary" id="createSnapBtn" onclick="Pages.agents._createSnapshot('${Utils.esc(agentId)}')" style="font-size:13px;padding:6px 14px">
          📸 Create Snapshot
        </button>
      </div>
      <div id="snapshotsList"><div class="loading-state"><div class="spinner"></div><span>Loading snapshots…</span></div></div>`;

    await this._refreshSnapshotsList(el, agentId);
  },

  async _refreshSnapshotsList(tabEl, agentId) {
    const listEl = tabEl ? tabEl.querySelector('#snapshotsList') : document.getElementById('snapshotsList');
    if (!listEl) return;

    try {
      const snaps = await API.getSnapshots(agentId);

      if (!snaps || snaps.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding:32px 0">
            <div class="empty-state-icon" style="font-size:32px">📸</div>
            <div class="empty-state-title">No snapshots yet</div>
            <div class="empty-state-desc">Click "Create Snapshot" to save the current config state. Snapshots are also created automatically before any file save.</div>
          </div>`;
        return;
      }

      function formatBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(2) + ' MB';
      }

      function absTime(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      function relTime(iso) {
        const ms = Date.now() - new Date(iso).getTime();
        const s = Math.floor(ms / 1000);
        if (s < 60) return 'just now';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.floor(h / 24) + 'd ago';
      }

      listEl.innerHTML = snaps.map((snap, i) => {
        const label = snap.label ? `<span style="font-size:11px;background:var(--accent-muted);color:var(--accent);padding:1px 7px;border-radius:10px;margin-left:6px">${Utils.esc(snap.label)}</span>` : '';
        const files = (snap.files || []).map(f =>
          `<span style="font-size:11px;font-family:var(--font-mono,monospace);background:var(--bg-base);border:1px solid var(--border-default);padding:1px 6px;border-radius:4px;color:var(--text-tertiary)">${Utils.esc(f)}</span>`
        ).join(' ');

        return `
          <div class="activity-item" style="align-items:flex-start;gap:12px;padding:14px 16px" id="snap-row-${i}">
            <div style="display:flex;flex-direction:column;align-items:center;min-width:48px;padding-top:2px;gap:1px">
              <span style="font-size:18px">📸</span>
              <span style="font-size:10px;color:var(--text-tertiary)">${Utils.esc(relTime(snap.created_at))}</span>
            </div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-family:var(--font-mono,monospace);font-size:12px;font-weight:600;color:var(--text-primary)">${Utils.esc(snap.id)}</span>
                ${label}
                <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">${Utils.esc(formatBytes(snap.size_bytes || 0))} · ${Utils.esc(absTime(snap.created_at))}</span>
              </div>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${files}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;align-self:center">
              <button class="btn-secondary"
                      onclick="Pages.agents._previewSnapshot('${Utils.esc(agentId)}', '${Utils.esc(snap.id)}', ${i})"
                      style="font-size:12px;padding:4px 10px"
                      title="Preview diff">
                👁 Preview
              </button>
              <button class="btn-secondary"
                      onclick="Pages.agents._restoreSnapshot('${Utils.esc(agentId)}', '${Utils.esc(snap.id)}')"
                      style="font-size:12px;padding:4px 10px;color:var(--accent);border-color:var(--accent)"
                      title="Restore this snapshot">
                ↩ Restore
              </button>
            </div>
          </div>
          <div id="snap-diff-${i}" style="display:none;margin:0 16px 12px;border:1px solid var(--border-default);border-radius:8px;overflow:hidden"></div>`;
      }).join('');

    } catch (e) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding:24px 0">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Failed to load snapshots</div>
          <div class="empty-state-desc">${Utils.esc(e.message)}</div>
        </div>`;
    }
  },

  async _createSnapshot(agentId) {
    const btn = document.getElementById('createSnapBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating…'; }

    try {
      const label = prompt('Snapshot label (optional):', '') || '';
      if (label === null) { // user cancelled
        if (btn) { btn.disabled = false; btn.textContent = '📸 Create Snapshot'; }
        return;
      }
      await API.createSnapshot(agentId, label);
      this._showToast('✅ Snapshot created', 'success');
      // Reload the tab
      const el = document.getElementById('agentTabContent');
      if (el) await this._refreshSnapshotsList(null, agentId);
    } catch (e) {
      this._showToast('❌ Failed: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📸 Create Snapshot'; }
    }
  },

  async _restoreSnapshot(agentId, snapshotId) {
    if (!confirm(`Restore snapshot "${snapshotId}"?\n\nThis will overwrite current config files. A pre-restore backup will be created automatically.`)) return;

    try {
      const result = await API.restoreSnapshot(agentId, snapshotId);
      const files = (result.restored_files || []).join(', ');
      this._showToast(`✅ Restored: ${files}`, 'success');
      // Reload the tab
      const el = document.getElementById('agentTabContent');
      if (el) await this._refreshSnapshotsList(null, agentId);
    } catch (e) {
      this._showToast('❌ Restore failed: ' + e.message, 'error');
    }
  },

  async _previewSnapshot(agentId, snapshotId, rowIdx) {
    const diffEl = document.getElementById(`snap-diff-${rowIdx}`);
    if (!diffEl) return;

    // Toggle if already open
    if (diffEl.style.display !== 'none') {
      diffEl.style.display = 'none';
      return;
    }

    diffEl.style.display = 'block';
    diffEl.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-tertiary)">Loading diff preview…</div>`;

    try {
      // Load current soul content and snapshot content in parallel
      const [currentSoul] = await Promise.all([
        API.getAgentSoul(agentId),
      ]);

      // We can compare current MEMORY.md / SOUL.md with snapshot files
      // Since we can't read snapshot files directly from the frontend,
      // we show what files the snapshot contains vs current sizes.
      const files = ['SOUL.md', 'MEMORY.md', 'HEARTBEAT.md', 'AGENTS.md'];
      const currentContents = {
        'SOUL.md':      (currentSoul.soul      || {}).content || '',
        'MEMORY.md':    (currentSoul.memory    || {}).content || '',
        'HEARTBEAT.md': (currentSoul.heartbeat || {}).content || '',
        'AGENTS.md':    (currentSoul.agents    || {}).content || '',
      };

      // Build a simple stats comparison
      const rows = files.map(fname => {
        const currentLen = currentContents[fname].length;
        const currentLines = currentContents[fname].split('\n').length;
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid var(--border-default)">
            <span style="font-family:var(--font-mono,monospace);font-size:12px;font-weight:600;min-width:120px;color:var(--text-primary)">${Utils.esc(fname)}</span>
            <span style="font-size:11px;color:var(--text-tertiary)">Current: ${currentLines} lines, ${currentLen} chars</span>
            <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">→ Snapshot from <code style="font-family:var(--font-mono,monospace)">${Utils.esc(snapshotId)}</code></span>
          </div>`;
      }).join('');

      diffEl.innerHTML = `
        <div style="background:var(--bg-surface);padding:8px 14px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">Snapshot Preview: ${Utils.esc(snapshotId)}</span>
          <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">Restoring will overwrite these files</span>
          <button onclick="document.getElementById('snap-diff-${rowIdx}').style.display='none'" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:14px;padding:0 4px">✕</button>
        </div>
        ${rows}
        <div style="padding:8px 14px;font-size:11px;color:var(--text-tertiary)">
          ℹ️ Full diff view coming soon. Use Restore to apply this snapshot.
        </div>`;

    } catch (e) {
      diffEl.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--danger,#ef4444)">Failed to load preview: ${Utils.esc(e.message)}</div>`;
    }
  },


  async _loadScorecard(el, agentId) {
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading scorecard…</span></div>';

    let scorecard = null;
    let timeline = [];

    try {
      const [scRes, tlRes] = await Promise.allSettled([
        fetch(`/api/agents/${encodeURIComponent(agentId)}/scorecard`).then(r => r.ok ? r.json() : null),
        fetch(`/api/agents/${encodeURIComponent(agentId)}/performance/timeline`).then(r => r.ok ? r.json() : [])
      ]);
      scorecard = scRes.status === 'fulfilled' ? scRes.value : null;
      timeline = (tlRes.status === 'fulfilled' && Array.isArray(tlRes.value)) ? tlRes.value : [];
    } catch (e) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Failed to load scorecard</div><div class="empty-state-desc">' + (e.message || '') + '</div></div>';
      return;
    }

    if (!scorecard) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">No scorecard data</div><div class="empty-state-desc">No performance data available for this agent yet.</div></div>';
      return;
    }

    const fmt = (v, suffix) => v != null && v !== '' ? (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) + (suffix || '') : v) : '—';
    const pct = v => v != null ? (v * (v <= 1 ? 100 : 1)).toFixed(1) + '%' : '—';

    const kpis = [
      { label: 'Completion Rate', value: pct(scorecard.completion_rate), color: '#22c55e' },
      { label: 'Avg Time to Done', value: fmt(scorecard.avg_time_to_done_hours, 'h'), color: '#6366f1' },
      { label: 'Failure Rate', value: pct(scorecard.failure_rate), color: '#ef4444' },
      { label: 'Total Cost', value: scorecard.total_cost_usd != null ? '$' + scorecard.total_cost_usd.toFixed(2) : '—', color: '#f59e0b' },
      { label: 'Cost / Task', value: scorecard.cost_per_task != null ? '$' + scorecard.cost_per_task.toFixed(2) : '—', color: '#f59e0b' },
      { label: 'Quality Score', value: fmt(scorecard.avg_quality_score), color: '#8b5cf6' }
    ];

    const kpiHtml = kpis.map(k => `
      <div style="flex:1;min-width:140px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${k.label}</div>
        <div style="font-size:24px;font-weight:700;color:${k.color}">${k.value}</div>
      </div>`).join('');

    const taskSummary = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
        <span style="font-size:13px;color:var(--text-secondary)">📋 Total: <strong style="color:var(--text-primary)">${scorecard.tasks_total || 0}</strong></span>
        <span style="font-size:13px;color:var(--text-secondary)">✅ Done: <strong style="color:#22c55e">${scorecard.tasks_completed || 0}</strong></span>
        <span style="font-size:13px;color:var(--text-secondary)">🔄 In Progress: <strong style="color:#6366f1">${scorecard.tasks_in_progress || 0}</strong></span>
        <span style="font-size:13px;color:var(--text-secondary)">❌ Failed: <strong style="color:#ef4444">${scorecard.tasks_failed || 0}</strong></span>
        <span style="font-size:13px;color:var(--text-secondary)">🔍 Evaluations: <strong style="color:var(--text-primary)">${scorecard.evaluation_count || 0}</strong></span>
      </div>`;

    // Build timeline SVG
    let timelineSvg = '';
    if (timeline.length > 0) {
      const W = 600, H = 200, pad = 40;
      const maxVal = Math.max(1, ...timeline.map(d => Math.max(d.tasks_completed || 0, d.tasks_failed || 0)));
      const barW = Math.max(4, Math.min(24, (W - pad * 2) / timeline.length - 4));
      const scaleY = v => H - pad - ((v / maxVal) * (H - pad * 2));
      const xStep = (W - pad * 2) / Math.max(1, timeline.length);

      let bars = '';
      timeline.forEach((d, i) => {
        const x = pad + i * xStep;
        const hC = ((d.tasks_completed || 0) / maxVal) * (H - pad * 2);
        const hF = ((d.tasks_failed || 0) / maxVal) * (H - pad * 2);
        bars += `<rect x="${x}" y="${H - pad - hC}" width="${barW}" height="${hC}" fill="#22c55e" rx="2" opacity="0.85"><title>${d.date}: ${d.tasks_completed || 0} completed</title></rect>`;
        bars += `<rect x="${x + barW + 1}" y="${H - pad - hF}" width="${barW}" height="${hF}" fill="#ef4444" rx="2" opacity="0.85"><title>${d.date}: ${d.tasks_failed || 0} failed</title></rect>`;
      });

      // X-axis labels (show ~5)
      let labels = '';
      const step = Math.max(1, Math.floor(timeline.length / 5));
      for (let i = 0; i < timeline.length; i += step) {
        const x = pad + i * xStep + barW;
        const label = (timeline[i].date || '').slice(5); // MM-DD
        labels += `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${label}</text>`;
      }

      timelineSvg = `
        <div style="margin-top:24px">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Performance Timeline</div>
          <div style="overflow-x:auto">
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
              <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--border)" stroke-width="1"/>
              ${bars}
              ${labels}
              <circle cx="${W - 100}" cy="14" r="5" fill="#22c55e"/><text x="${W - 92}" y="18" fill="var(--text-secondary)" font-size="10">Completed</text>
              <circle cx="${W - 40}" cy="14" r="5" fill="#ef4444"/><text x="${W - 32}" y="18" fill="var(--text-secondary)" font-size="10">Failed</text>
            </svg>
          </div>
        </div>`;
    }

    // Quality trend sparkline
    let qualityTrendHtml = '';
    const qt = scorecard.quality_trend;
    if (qt && qt.length > 1) {
      const qW = 200, qH = 40;
      const qMax = Math.max(1, ...qt.map(v => typeof v === 'number' ? v : v.score || 0));
      const qMin = Math.min(...qt.map(v => typeof v === 'number' ? v : v.score || 0));
      const range = Math.max(0.1, qMax - qMin);
      const points = qt.map((v, i) => {
        const val = typeof v === 'number' ? v : v.score || 0;
        const x = (i / (qt.length - 1)) * qW;
        const y = qH - ((val - qMin) / range) * (qH - 4) - 2;
        return `${x},${y}`;
      }).join(' ');

      qualityTrendHtml = `
        <div style="margin-top:24px">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Quality Trend</div>
          <svg width="${qW}" height="${qH}" viewBox="0 0 ${qW} ${qH}" style="background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border);padding:4px">
            <polyline points="${points}" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>`;
    }

    el.innerHTML = `
      <div style="padding:4px 0">
        <div style="display:flex;flex-wrap:wrap;gap:12px">${kpiHtml}</div>
        ${taskSummary}
        ${timelineSvg}
        ${qualityTrendHtml}
      </div>`;
  },
  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    this._selected = new Set();
  }
};
