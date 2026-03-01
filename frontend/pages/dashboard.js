/* AgentBoard — Dashboard Page */

window.Pages = window.Pages || {};

Pages.dashboard = {
  _wsHandlers: [],
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="stats-grid" id="metricCards">
        <div class="stat-card animate-fade-in">
          <div class="stat-label">TASKS / DAY</div>
          <div class="stat-number">47</div>
          <div class="stat-trend stat-trend--up">↑ 12%</div>
        </div>
        <div class="stat-card animate-fade-in">
          <div class="stat-label">ACTIVE AGENTS</div>
          <div class="stat-number" id="metricActiveAgents">—</div>
        </div>
        <div class="stat-card animate-fade-in">
          <div class="stat-label">ERROR RATE</div>
          <div class="stat-number">0.3%</div>
          <div class="stat-trend stat-trend--up" style="color:var(--success)">↓ improved</div>
        </div>
      </div>

      <div class="stats-grid" id="statsGrid">
        ${[...Array(5)].map((_, i) => `<div class="stat-card animate-fade-in animate-fade-in-delay-${i+1}"><div class="skeleton skeleton-text skeleton-text--short" style="margin-bottom:12px"></div><div class="skeleton skeleton-text" style="width:50%;height:28px"></div></div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card animate-fade-in">
          <div class="section-header"><div class="section-title">Tasks This Week</div></div>
          <div style="display:flex;align-items:flex-end;gap:8px;height:120px;padding-top:8px">
            ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i) => {
              const h = [45,72,58,90,65,40,30][i];
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:${h}%;background:var(--accent);border-radius:4px 4px 0 0;min-height:4px"></div><span style="font-size:10px;color:var(--text-tertiary)">${d}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div class="card animate-fade-in">
          <div class="section-header"><div class="section-title">Task Status</div></div>
          <div style="display:flex;align-items:center;gap:16px;margin-top:12px">
            <div style="width:80px;height:80px;border-radius:50%;background:conic-gradient(var(--accent) 0% 40%,var(--warning) 40% 65%,var(--success) 65% 85%,var(--bg-inset) 85% 100%);position:relative;flex-shrink:0"><div style="position:absolute;inset:16px;background:var(--bg-surface);border-radius:50%"></div></div>
            <div style="font-size:12px;line-height:2;color:var(--text-secondary)">
              <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--accent);margin-right:4px;vertical-align:middle"></span>Done 40%</div>
              <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--warning);margin-right:4px;vertical-align:middle"></span>In Progress 25%</div>
              <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--success);margin-right:4px;vertical-align:middle"></span>Review 20%</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card animate-fade-in">
          <div class="section-header">
            <div class="section-title">Recent Activity</div>
            <button class="section-link" onclick="App.navigate('activity')">View all →</button>
          </div>
          <div class="activity-feed terminal-bg" id="dashActivityFeed" style="padding:12px;border:none;border-radius:var(--radius-md)">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
        </div>
        <div class="card animate-fade-in">
          <div class="section-header">
            <div class="section-title">Agents by Status</div>
            <button class="section-link" onclick="App.navigate('agents')">View all →</button>
          </div>
          <div id="dashAgentList">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
        </div>
      </div>`;

    await this._load();

    // Real-time update via WS
    const handler = () => this._load();
    WS.on('agent_status_update', handler);
    this._wsHandlers.push(['agent_status_update', handler]);

    // Auto-refresh every 30s
    this._refreshTimer = setInterval(() => this._load(), 30000);
  },

  async _load() {
    try {
      const [stats, agents, stream, stuckTasks] = await Promise.all([
        API.getStats(),
        API.getAgents(),
        API.getStream(10),
        API.getStuckTasks().catch(() => []),
      ]);
      this._renderStats(stats, agents, stuckTasks);
      this._renderAgents(agents);
      this._renderActivity(stream);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  },

  _renderStats(stats, agents, stuckTasks) {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;

    const activeCount = agents.filter(a => a.status === 'active').length;
    const stuckCount = Array.isArray(stuckTasks) ? stuckTasks.length : 0;

    const items = [
      { num: stats.totalAgents || agents.length, label: 'Agents', style: '' },
      { num: activeCount, label: 'Online Now', style: '' },
      { num: stats.idleAgents || 0, label: 'Idle', style: '' },
      { num: stats.offlineAgents || 0, label: 'Offline', style: '' },
    ];

    const stuckCard = stuckCount > 0
      ? `<div class="stat-card" style="border-color:var(--warning)">
          <div class="stat-label" style="color:var(--warning)">Stuck Tasks</div>
          <div class="stat-number" style="color:var(--warning)">${stuckCount}</div>
        </div>`
      : `<div class="stat-card">
          <div class="stat-label" style="color:var(--text-tertiary)">All Clear</div>
          <div class="stat-number" style="color:var(--success)">✓</div>
        </div>`;

    const metricEl = document.getElementById('metricActiveAgents');
    if (metricEl) metricEl.textContent = activeCount;

    grid.innerHTML = items.map(({ num, label }, i) => `
      <div class="stat-card animate-fade-in animate-fade-in-delay-${i+1}">
        <div class="stat-label">${label}</div>
        <div class="stat-number">${num}</div>
      </div>`).join('') + stuckCard;

  },

  _renderAgents(agents) {
    const el = document.getElementById('dashAgentList');
    if (!el) return;

    if (!agents || agents.length === 0) {
      el.innerHTML = '<div class="empty-state-desc" style="padding:16px;color:var(--text-tertiary)">No agents configured</div>';
      return;
    }

    const sorted = [...agents].sort((a, b) => {
      const order = { active: 0, idle: 1, offline: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    el.innerHTML = `<div class="mini-agent-list">
      ${sorted.slice(0, 12).map(a => `
        <div class="mini-agent-item" onclick="App.navigate('agents/${Utils.esc(a.id || a.name)}')">
          <span class="mini-agent-emoji">${Utils.esc(a.emoji || '🤖')}</span>
          <span class="mini-agent-name">${Utils.esc(a.name || a.displayName || a.id)}</span>
          ${Utils.statusPill(a.status)}
        </div>`).join('')}
    </div>`;
  },

  _stripMarkdown(text) {
    return (text || '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*{1,3}([^*]*)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]*)_{1,3}/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  _renderActivity(stream) {
    const el = document.getElementById('dashActivityFeed');
    if (!el) return;

    if (!stream || stream.length === 0) {
      el.innerHTML = '<div class="empty-state-desc" style="padding:16px;color:var(--text-tertiary)">No recent activity</div>';
      return;
    }

    el.innerHTML = stream.slice(0, 10).map(item => {
      const typeLabel = item.type === 'command' ? `ran <code>${Utils.esc(item.toolName)}</code>`
        : item.type === 'response' ? 'sent a response'
        : item.type === 'result' ? 'got a result'
        : Utils.esc(item.type ?? 'unknown');
      const cleanContent = this._stripMarkdown(item.content);
      return `
        <div class="activity-item activity-item--compact">
          <div class="activity-item__avatar">${Utils.esc(item.emoji || '🤖')}</div>
          <div class="activity-item__body">
            <div class="activity-item__header">
              <span class="agent-name">${Utils.esc(item.agent)}</span> ${typeLabel}
            </div>
            <div class="activity-item__detail">${Utils.esc(Utils.truncate(cleanContent, 80))}</div>
          </div>
          <div class="activity-item__time">${Utils.esc(item.timeStr || Utils.relTime(item.timestamp))}</div>
        </div>`;
    }).join('');
  },

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }
};
