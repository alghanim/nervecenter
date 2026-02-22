/* AgentBoard — Dashboard Page */

window.Pages = window.Pages || {};

Pages.dashboard = {
  _wsHandlers: [],
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="stats-grid" id="statsGrid">
        ${[...Array(5)].map((_, i) => `<div class="stat-card animate-fade-in animate-fade-in-delay-${i+1}"><div class="skeleton skeleton-text skeleton-text--short" style="margin-bottom:12px"></div><div class="skeleton skeleton-text" style="width:50%;height:28px"></div></div>`).join('')}
      </div>

      <div id="dashNodeGraph" class="card animate-fade-in" style="margin-bottom:16px;padding:0;overflow:hidden;height:180px;position:relative">
        <canvas id="nodeGraphCanvas" style="width:100%;height:100%"></canvas>
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

    grid.innerHTML = items.map(({ num, label }, i) => `
      <div class="stat-card animate-fade-in animate-fade-in-delay-${i+1}">
        <div class="stat-label">${label}</div>
        <div class="stat-number">${num}</div>
      </div>`).join('') + stuckCard;

    // Render mini node graph
    this._renderNodeGraph();
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

  _renderNodeGraph() {
    const canvas = document.getElementById('nodeGraphCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width, h = rect.height;
    const nodes = [];
    const numNodes = 18;

    for (let i = 0; i < numNodes; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 2 + Math.random() * 3,
      });
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const lineColor = isLight ? 'rgba(8, 145, 178, 0.12)' : 'rgba(34, 211, 238, 0.08)';
    const nodeColor = isLight ? 'rgba(8, 145, 178, 0.4)' : 'rgba(34, 211, 238, 0.5)';
    const glowColor = isLight ? 'rgba(8, 145, 178, 0.15)' : 'rgba(34, 211, 238, 0.2)';

    let animId;
    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      // Update positions
      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = 1 - dist / 150;
            ctx.beginPath();
            ctx.strokeStyle = lineColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 0.5;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw nodes
      nodes.forEach(n => {
        // Glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();
        // Node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
      });

      animId = requestAnimationFrame(animate);
    };

    animate();
    this._nodeGraphAnim = animId;
  },

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    if (this._nodeGraphAnim) cancelAnimationFrame(this._nodeGraphAnim);
    this._nodeGraphAnim = null;
  }
};
