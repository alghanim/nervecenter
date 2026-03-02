/* AgentBoard — Gateway Health Page */

window.Pages = window.Pages || {};

Pages.health = {
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div id="healthStatus" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="card" style="text-align:center;padding:32px 16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:12px">Gateway Status</div>
          <div id="healthIndicator" style="width:64px;height:64px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;background:#666">?</div>
          <div id="healthLabel" style="font-size:18px;font-weight:600;color:var(--text-primary)">Checking…</div>
        </div>
        <div class="card" style="text-align:center;padding:32px 16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:12px">Response Time</div>
          <div id="healthResponseTime" style="font-size:36px;font-weight:700;color:var(--text-primary)">—</div>
          <div style="font-size:12px;color:var(--text-tertiary)">ms</div>
        </div>
        <div class="card" style="text-align:center;padding:32px 16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:12px">Uptime</div>
          <div id="healthUptime" style="font-size:36px;font-weight:700;color:var(--text-primary)">—</div>
        </div>
        <div class="card" style="text-align:center;padding:32px 16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:12px">Last Checked</div>
          <div id="healthLastChecked" style="font-size:36px;font-weight:700;color:var(--text-primary)">—</div>
        </div>
      </div>
      <div class="card" style="padding:24px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:16px">Response Time History (last 60 checks)</div>
        <div id="healthChart" style="display:flex;align-items:flex-end;gap:3px;height:120px"></div>
      </div>
      <style>
        @keyframes healthPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        .health-pulse { animation: healthPulse 2s ease-in-out infinite; }
      </style>
    `;
    await this._refresh();
    this._refreshTimer = setInterval(() => this._refresh(), 15000);
  },

  async _refresh() {
    try {
      const resp = await fetch('/api/gateway/health');
      if (!resp.ok) throw new Error('fetch failed');
      const data = await resp.json();

      const isUp = data.status === 'up';
      const color = isUp ? '#C5D92E' : '#E53935';
      const label = isUp ? 'UP' : 'DOWN';

      const indicator = document.getElementById('healthIndicator');
      if (indicator) {
        indicator.style.background = color;
        indicator.textContent = isUp ? '✓' : '✗';
        indicator.className = 'health-pulse';
      }
      const labelEl = document.getElementById('healthLabel');
      if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }

      const rtEl = document.getElementById('healthResponseTime');
      if (rtEl) rtEl.textContent = data.responseTimeMs ?? '—';

      const upEl = document.getElementById('healthUptime');
      if (upEl) upEl.textContent = this._formatUptime(data.uptimeSeconds || 0);

      const lcEl = document.getElementById('healthLastChecked');
      if (lcEl) lcEl.textContent = this._timeAgo(data.lastChecked);

      // Chart
      const chart = document.getElementById('healthChart');
      if (chart && data.history) {
        const maxMs = Math.max(1, ...data.history.map(p => p.responseTimeMs));
        chart.innerHTML = data.history.map(p => {
          const pct = Math.max(4, (p.responseTimeMs / maxMs) * 100);
          const c = p.status === 'up' ? '#C5D92E' : '#E53935';
          return `<div title="${p.responseTimeMs}ms" style="flex:1;min-width:2px;height:${pct}%;background:${c};border-radius:2px 2px 0 0"></div>`;
        }).join('');
      }
    } catch (e) {
      console.error('Health fetch error:', e);
    }
  },

  _formatUptime(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm';
    return seconds + 's';
  },

  _timeAgo(isoStr) {
    if (!isoStr) return '—';
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
  },

  destroy() {
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  }
};
