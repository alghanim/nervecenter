/* AgentBoard — My Dashboard (Agent Profile) */

window.Pages = window.Pages || {};

Pages.dashboardBuilder = {
  _agentId: null,
  _refreshTimer: null,
  _LS_KEY: 'nc_my_agent_id',

  async render(container) {
    this._agentId = localStorage.getItem(this._LS_KEY) || '';

    container.innerHTML = `
      <div id="myDashRoot" style="max-width:900px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="margin:0;font-size:20px;font-weight:700;color:var(--text-primary)">My Dashboard</h2>
            <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary)">Your personal task stats and recent activity</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:12px;color:var(--text-secondary)">Viewing as:</label>
            <select id="myAgentSelect" style="
              background:var(--bg-elevated);border:1px solid var(--border-default);
              border-radius:8px;padding:6px 12px;color:var(--text-primary);
              font-size:13px;cursor:pointer;min-width:140px;outline:none
            ">
              <option value="">— Select agent —</option>
            </select>
          </div>
        </div>

        <div id="myDashContent">
          <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
        </div>
      </div>`;

    this._injectStyles();
    await this._populateAgentSelect();
    this._bindEvents();
    if (this._agentId) await this._loadData();
  },

  async _populateAgentSelect() {
    const sel = document.getElementById('myAgentSelect');
    if (!sel) return;
    try {
      const agents = await API.getAgents();
      const sorted = [...agents].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      sorted.forEach(ag => {
        const opt = document.createElement('option');
        opt.value = ag.id || ag.name;
        opt.textContent = ag.name || ag.id;
        if (opt.value === this._agentId) opt.selected = true;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.error('Failed to load agents', e);
    }
  },

  _bindEvents() {
    document.getElementById('myAgentSelect')?.addEventListener('change', async (e) => {
      this._agentId = e.target.value;
      localStorage.setItem(this._LS_KEY, this._agentId);
      await this._loadData();
    });
  },

  async _loadData() {
    const content = document.getElementById('myDashContent');
    if (!content) return;

    if (!this._agentId) {
      content.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-secondary)">
          <div style="font-size:48px;margin-bottom:16px">👤</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Select your agent</div>
          <div style="font-size:13px">Choose an agent from the dropdown above to see your personal dashboard</div>
        </div>`;
      return;
    }

    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Loading your stats…</span></div>`;

    try {
      const [allTasks, agents, activityRaw] = await Promise.all([
        API.getTasks({ assignee: this._agentId }),
        API.getAgents(),
        API.getStreamFiltered(this._agentId, 20).catch(() => []),
      ]);

      const tasks = Array.isArray(allTasks) ? allTasks : [];
      const agent = agents.find(a => (a.id || a.name) === this._agentId) || { id: this._agentId, name: this._agentId };

      const stats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        todo: tasks.filter(t => t.status === 'todo').length,
      };

      const recentTasks = [...tasks]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 8);

      const activity = Array.isArray(activityRaw) ? activityRaw.slice(0, 10) : [];

      const statusDot = (status) => {
        const colors = { active: '#22c55e', online: '#22c55e', idle: '#eab308', offline: '#6b7280', busy: '#f97316' };
        const c = colors[status] || '#6b7280';
        return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px"></span>`;
      };

      const priorityBadge = (p) => {
        const styles = {
          high: 'background:rgba(239,68,68,0.15);color:#ef4444',
          medium: 'background:rgba(234,179,8,0.15);color:#eab308',
          low: 'background:rgba(107,114,128,0.15);color:#9ca3af',
        };
        const s = styles[p] || styles.low;
        return `<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;${s}">${Utils.esc(p || 'low')}</span>`;
      };

      const statusBadge = (s) => {
        const styles = {
          'done': 'background:rgba(34,197,94,0.15);color:#22c55e',
          'in-progress': 'background:rgba(34,211,238,0.15);color:#22d3ee',
          'todo': 'background:rgba(107,114,128,0.15);color:#9ca3af',
          'blocked': 'background:rgba(239,68,68,0.15);color:#ef4444',
        };
        const style = styles[s] || styles.todo;
        const label = s === 'in-progress' ? 'In Progress' : s === 'todo' ? 'Todo' : s === 'done' ? 'Done' : Utils.esc(s);
        return `<span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;${style}">${label}</span>`;
      };

      const relTime = (ts) => {
        if (!ts) return '';
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
      };

      const completionPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

      content.innerHTML = `
        <!-- Agent Header -->
        <div class="myd-agent-header">
          <div class="myd-avatar">${Utils.esc((agent.name || agent.id || '?')[0].toUpperCase())}</div>
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${Utils.esc(agent.name || agent.id)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:3px">
              ${statusDot(agent.status || 'offline')}${Utils.esc(agent.status || 'offline')}
              ${agent.team ? `<span style="margin-left:12px;opacity:0.6">·</span> <span style="margin-left:6px">${Utils.esc(agent.team)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="myd-stats-row">
          <div class="myd-stat-card">
            <div class="myd-stat-num">${stats.total}</div>
            <div class="myd-stat-lbl">Total Tasks</div>
          </div>
          <div class="myd-stat-card myd-stat-done">
            <div class="myd-stat-num">${stats.done}</div>
            <div class="myd-stat-lbl">Completed</div>
          </div>
          <div class="myd-stat-card myd-stat-inprogress">
            <div class="myd-stat-num">${stats.inProgress}</div>
            <div class="myd-stat-lbl">In Progress</div>
          </div>
          <div class="myd-stat-card">
            <div class="myd-stat-num">${stats.todo}</div>
            <div class="myd-stat-lbl">Pending</div>
          </div>
        </div>

        <!-- Progress bar -->
        ${stats.total > 0 ? `
        <div class="card" style="margin-bottom:16px;padding:16px 20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Completion Rate</span>
            <span style="font-size:13px;font-weight:700;color:#22d3ee">${completionPct}%</span>
          </div>
          <div style="height:6px;background:var(--bg-surface-hover);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${completionPct}%;background:linear-gradient(90deg,#06b6d4,#22d3ee);border-radius:99px;transition:width .6s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--text-secondary)">
            <span>${stats.done} done</span>
            <span>${stats.total - stats.done} remaining</span>
          </div>
        </div>` : ''}

        <!-- Two-column layout: recent tasks + activity -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

          <!-- Recent Tasks -->
          <div class="card">
            <div class="section-header" style="margin-bottom:12px">
              <div class="section-title">My Tasks</div>
              <button class="section-link" onclick="App.navigate('kanban')">View kanban →</button>
            </div>
            ${recentTasks.length === 0 ? `
              <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px">
                No tasks assigned yet
              </div>` : `
              <div class="myd-task-list">
                ${recentTasks.map(t => `
                  <div class="myd-task-row">
                    <div style="display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0">
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;color:var(--text-primary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${Utils.esc(t.title)}">
                          ${Utils.esc(t.title || '(untitled)')}
                        </div>
                        <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                          ${statusBadge(t.status)}
                          ${priorityBadge(t.priority)}
                        </div>
                      </div>
                      <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0">${relTime(t.updated_at)}</div>
                    </div>
                  </div>`).join('')}
              </div>`}
          </div>

          <!-- Recent Activity -->
          <div class="card">
            <div class="section-header" style="margin-bottom:12px">
              <div class="section-title">Recent Activity</div>
              <button class="section-link" onclick="App.navigate('activity')">View all →</button>
            </div>
            ${activity.length === 0 ? `
              <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px">
                No recent activity
              </div>` : `
              <div class="myd-activity-list">
                ${activity.map(item => {
                  const typeLabel = item.type === 'task' ? 'updated a task'
                    : item.type === 'comment' ? 'left a comment'
                    : item.type === 'response' ? 'sent a response'
                    : item.type === 'result' ? 'got a result'
                    : Utils.esc(item.type || item.action || 'acted');
                  const text = item.content || item.summary || item.message || item.details || '';
                  return `
                    <div class="myd-activity-row">
                      <div class="myd-activity-icon">${item.emoji || '⚡'}</div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;color:var(--text-secondary)">${typeLabel}</div>
                        ${text ? `<div style="font-size:12px;color:var(--text-primary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${Utils.esc(text)}">${Utils.esc(text.slice(0, 70))}${text.length > 70 ? '…' : ''}</div>` : ''}
                      </div>
                      <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0">${relTime(item.timestamp || item.created_at)}</div>
                    </div>`;
                }).join('')}
              </div>`}
          </div>

        </div>`;

    } catch (e) {
      console.error('My Dashboard error:', e);
      const content = document.getElementById('myDashContent');
      if (content) content.innerHTML = `<div class="error-state">Failed to load dashboard data. <button class="section-link" onclick="Pages.dashboardBuilder._loadData()">Retry</button></div>`;
    }
  },

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  },

  _injectStyles() {
    if (document.getElementById('myd-styles')) return;
    const style = document.createElement('style');
    style.id = 'myd-styles';
    style.textContent = `
      .myd-agent-header {
        display: flex; align-items: center; gap: 16px;
        padding: 20px; background: var(--bg-surface); border: 1px solid var(--border-default);
        border-radius: 12px; margin-bottom: 16px;
        border-left: 3px solid #22d3ee;
      }
      .myd-avatar {
        width: 52px; height: 52px; border-radius: 50%;
        background: linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.3));
        border: 2px solid rgba(34,211,238,0.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; font-weight: 700; color: #22d3ee;
        flex-shrink: 0;
      }
      .myd-stats-row {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 12px; margin-bottom: 16px;
      }
      @media (max-width: 640px) {
        .myd-stats-row { grid-template-columns: repeat(2, 1fr); }
      }
      .myd-stat-card {
        background: var(--bg-surface); border: 1px solid var(--border-default);
        border-radius: 12px; padding: 16px; text-align: center;
        transition: border-color .2s;
      }
      .myd-stat-card:hover { border-color: rgba(34,211,238,0.3); }
      .myd-stat-done { border-color: rgba(34,197,94,0.2); }
      .myd-stat-done .myd-stat-num { color: #22c55e; }
      .myd-stat-inprogress { border-color: rgba(34,211,238,0.2); }
      .myd-stat-inprogress .myd-stat-num { color: #22d3ee; }
      .myd-stat-num {
        font-size: 32px; font-weight: 800; color: var(--text-primary);
        line-height: 1;
      }
      .myd-stat-lbl {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.06em; color: var(--text-secondary); margin-top: 6px;
      }
      .myd-task-list { display: flex; flex-direction: column; }
      .myd-task-row {
        display: flex; align-items: center; padding: 10px 0;
        border-bottom: 1px solid var(--border-default);
      }
      .myd-task-row:last-child { border-bottom: none; }
      .myd-activity-list { display: flex; flex-direction: column; }
      .myd-activity-row {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 8px 0; border-bottom: 1px solid var(--border-default);
      }
      .myd-activity-row:last-child { border-bottom: none; }
      .myd-activity-icon {
        width: 28px; height: 28px; border-radius: 50%;
        background: var(--bg-surface-hover); display: flex; align-items: center;
        justify-content: center; font-size: 14px; flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }
};
