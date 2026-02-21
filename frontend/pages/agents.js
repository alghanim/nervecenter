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
      return `
        <div class="agent-card${isSelected ? ' agent-card--selected' : ''}" style="position:relative" data-agent-id="${Utils.esc(agentId)}">
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
      Pages.activity._renderFeed(el, agentId);
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

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    this._selected = new Set();
  }
};
