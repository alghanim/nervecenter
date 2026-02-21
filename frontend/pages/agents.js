/* AgentBoard — Agents Grid + Detail Page */

window.Pages = window.Pages || {};

Pages.agents = {
  _agents: [],
  _wsHandlers: [],
  _refreshTimer: null,
  _currentAgentId: null,
  _currentTab: 'soul',

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
    container.innerHTML = `
      <div class="agents-grid" id="agentsGrid">
        <div class="loading-state"><div class="spinner"></div><span>Loading agents...</span></div>
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

    grid.innerHTML = this._agents.map(a => {
      const teamStyle = Utils.teamBadgeStyle(a);
      const team = a.team || '';
      const model = Utils.formatModel(a.currentModel || a.model);
      const agentId = a.id || a.name;
      return `
        <div class="agent-card" onclick="App.navigate('agents/${Utils.esc(agentId)}')">
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
        </div>`;
    }).join('');
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

    Utils.showLoading(el, 'Loading...');

    try {
      const soul = await API.getAgentSoul(agentId);

      let fileData = null;
      let fileName = '';
      let emptyMsg = '';

      if (tab === 'soul') {
        fileData = soul.soul;
        fileName = 'SOUL.md';
        emptyMsg = 'No soul file found';
      } else if (tab === 'memory') {
        fileData = soul.memory;
        fileName = 'MEMORY.md';
        emptyMsg = 'No memory file yet';
      } else if (tab === 'heartbeat') {
        fileData = soul.heartbeat;
        fileName = 'HEARTBEAT.md';
        emptyMsg = 'No heartbeat configured';
      } else if (tab === 'agents_md') {
        fileData = soul.agents;
        fileName = 'AGENTS.md';
        emptyMsg = 'No AGENTS.md found';
      }

      if (!fileData) {
        Utils.showEmpty(el, '📄', emptyMsg, fileName + ' not available for this agent');
        return;
      }

      const html = DOMPurify.sanitize(marked.parse(fileData.content || ''));
      const modTime = fileData.modified ? new Date(fileData.modified) : null;

      el.innerHTML = `
        <div class="markdown-body" id="mdBody_${tab}">${html}</div>
        <div class="content-timestamp">
          <span class="content-timestamp-text" id="tsText_${tab}" title="${modTime ? Utils.absTime(fileData.modified) : ''}">
            ${modTime ? 'Updated ' + Utils.relTime(fileData.modified) : ''}
          </span>
          <button class="content-timestamp-refresh" onclick=\"Pages.agents._loadTab('${tab}', '${agentId}')\" title="Refresh" aria-label="Refresh">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6A4.5 4.5 0 106 1.5a4.5 4.5 0 00-3.2 1.3L1.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 1.5V4H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`;
    } catch (e) {
      Utils.showEmpty(el, '⚠️', 'Failed to load data', e.message);
    }
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

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }
};
