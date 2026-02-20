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
      document.getElementById('agentsGrid').innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Failed to load agents</div><div class="empty-state-desc">${Utils.esc(e.message)}</div></div>`;
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
      const statusClass = Utils.statusClass(a.status);
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
            <div class="agent-card__status">
              <span class="status-dot status-dot--${statusClass}${statusClass === 'online' ? ' status-dot--pulse' : ''}"></span>
              <span>${Utils.statusLabel(a.status)}</span>
            </div>
          </div>
          <div class="agent-card__role">${Utils.esc(a.role || '')}</div>
          ${team ? `<span class="badge" style="${teamStyle}">${Utils.esc(team)}</span>` : ''}
          <div class="agent-card__footer">
            <span class="agent-card__model">${Utils.esc(model)}</span>
            <span class="agent-card__view">View →</span>
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
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Agent not found</div></div>`;
      return;
    }

    if (!agent) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Agent "${agentId}" not found</div></div>`;
      return;
    }

    const statusClass = Utils.statusClass(agent.status);
    const teamStyle = agent.team ? `style="${Utils.teamBadgeStyle(agent)}"` : '';

    container.innerHTML = `
      <div class="agent-detail-header">
        <button class="agent-detail-back" onclick="App.navigate('agents')">
          ← Back to Agents
        </button>
        <div class="agent-detail-title">
          <span class="agent-detail-emoji">${Utils.esc(agent.emoji || '🤖')}</span>
          <span class="agent-detail-name">${Utils.esc(agent.name || agent.displayName || agentId)}</span>
          <div class="agent-detail-status">
            <span class="status-dot status-dot--${statusClass}${statusClass === 'online' ? ' status-dot--pulse' : ''}"></span>
            <span>${Utils.statusLabel(agent.status)}</span>
          </div>
        </div>
        <div class="agent-detail-meta">
          <span>${Utils.esc(agent.role || '')}</span>
          ${agent.team ? `<span>·</span><span class="badge" ${teamStyle}>${Utils.esc(agent.team)}</span>` : ''}
          ${agent.currentModel ? `<span>·</span><span style="font-family:var(--font-display);font-size:12px;color:var(--text-tertiary)">${Utils.esc(agent.currentModel)}</span>` : ''}
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab active" data-tab="soul" onclick="Pages.agents._switchTab('soul', ${JSON.stringify(agentId)})">Soul</button>
        <button class="tab" data-tab="memory" onclick="Pages.agents._switchTab('memory', ${JSON.stringify(agentId)})">Memory</button>
        <button class="tab" data-tab="heartbeat" onclick="Pages.agents._switchTab('heartbeat', ${JSON.stringify(agentId)})">Heartbeat</button>
        <button class="tab" data-tab="agents_md" onclick="Pages.agents._switchTab('agents_md', ${JSON.stringify(agentId)})">Agents.md</button>
        <button class="tab" data-tab="skills" onclick="Pages.agents._switchTab('skills', ${JSON.stringify(agentId)})">Skills</button>
        <button class="tab" data-tab="activity" onclick="Pages.agents._switchTab('activity', ${JSON.stringify(agentId)})">Activity</button>
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
          <button class="content-timestamp-refresh" onclick="Pages.agents._loadTab(${JSON.stringify(tab)}, ${JSON.stringify(agentId)})" title="Refresh">↻</button>
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
            <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:8px;padding:12px 16px;display:flex;align-items:baseline;gap:12px">
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

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }
};
