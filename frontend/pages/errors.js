/* AgentBoard — Error Dashboard Page */

window.Pages = window.Pages || {};

Pages.errors = {
  _errors: [],
  _agents: [],
  _filterAgent: '',
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="errors-page">
        <div style="display:flex;gap:8px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
          <select class="select" id="errorsAgentFilter" onchange="Pages.errors._onFilter(this.value)" style="min-width:160px">
            <option value="">All agents</option>
          </select>
          <button class="btn-secondary" onclick="Pages.errors._refresh()" id="errorsRefreshBtn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:4px" aria-hidden="true">
              <path d="M13 2v4H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M1 12v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M11.6 5A6 6 0 1 0 12 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Refresh
          </button>
          <span id="errorsLastUpdated" style="color:var(--text-tertiary);font-size:12px;margin-left:4px"></span>
        </div>

        <div id="errorsContent">
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Scanning agent sessions for errors...</span>
          </div>
        </div>
      </div>`;

    await this._loadAgentFilter();
    await this._refresh();

    // Auto-refresh every 60s
    this._refreshTimer = setInterval(() => this._refresh(), 60000);
  },

  async _loadAgentFilter() {
    try {
      const agents = await API.getAgents();
      this._agents = agents || [];
      const sel = document.getElementById('errorsAgentFilter');
      if (!sel) return;
      const currentVal = sel.value;
      // Keep "All agents" option, then add agents
      while (sel.options.length > 1) sel.remove(1);
      for (const a of this._agents) {
        const opt = document.createElement('option');
        opt.value = a.id || a.name || '';
        opt.textContent = a.name || a.id || '?';
        sel.appendChild(opt);
      }
      if (currentVal) sel.value = currentVal;
    } catch (_) {
      // Non-fatal: agent filter may stay empty
    }
  },

  _onFilter(agentId) {
    this._filterAgent = agentId;
    this._renderList();
  },

  async _refresh() {
    const btn = document.getElementById('errorsRefreshBtn');
    if (btn) btn.disabled = true;
    try {
      const qs = this._filterAgent ? `?agent_id=${encodeURIComponent(this._filterAgent)}` : '';
      this._errors = await apiFetch(`/api/errors${qs}`);
      this._renderList();
      const ts = document.getElementById('errorsLastUpdated');
      if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (e) {
      const content = document.getElementById('errorsContent');
      if (content) {
        content.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <path d="M24 8L43 40H5L24 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="24" y1="22" x2="24" y2="32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="24" cy="37" r="1.5" fill="currentColor"/>
              </svg>
            </div>
            <div class="empty-state-title">Failed to load errors</div>
            <div class="empty-state-desc">${Utils.esc(e.message)}</div>
          </div>`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  _renderList() {
    const content = document.getElementById('errorsContent');
    if (!content) return;

    // Apply client-side agent filter
    const filtered = this._filterAgent
      ? this._errors.filter(e => (e.agent_id || '').toLowerCase() === this._filterAgent.toLowerCase())
      : this._errors;

    if (!filtered || filtered.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="16" stroke="var(--success)" stroke-width="2"/>
              <path d="M16 24l6 6 10-10" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-state-title" style="color:var(--success)">No errors detected</div>
          <div class="empty-state-desc">All agents healthy ✅</div>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="errors-summary" style="
        display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap
      ">
        ${this._renderSummaryCards(filtered)}
      </div>
      <div class="errors-table-wrap" style="
        background:var(--bg-surface);
        border:1px solid var(--border-default);
        border-radius:10px;
        overflow:hidden
      ">
        <table class="errors-table" style="
          width:100%;border-collapse:collapse;font-size:13px
        ">
          <thead>
            <tr style="background:var(--bg-elevated);border-bottom:1px solid var(--border-default)">
              <th style="padding:10px 14px;text-align:left;color:var(--text-tertiary);font-weight:500;white-space:nowrap">Agent</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text-tertiary);font-weight:500;white-space:nowrap">When</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text-tertiary);font-weight:500;white-space:nowrap">Type</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text-tertiary);font-weight:500">Message</th>
            </tr>
          </thead>
          <tbody id="errorsTableBody">
            ${filtered.map((err, i) => this._renderRow(err, i)).join('')}
          </tbody>
        </table>
      </div>
      ${filtered.length >= 100 ? `<div style="text-align:center;padding:12px;color:var(--text-tertiary);font-size:12px">Showing latest 100 errors</div>` : ''}
    `;
  },

  _renderSummaryCards(errors) {
    const errCount = errors.filter(e => e.error_type === 'tool_error' || e.error_type === 'stop_error').length;
    const agentSet = new Set(errors.map(e => e.agent_id));
    const cards = [
      {
        label: 'Total Errors',
        value: errors.length,
        color: 'var(--danger)',
        bg: 'var(--danger-muted)',
        icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
        </svg>`
      },
      {
        label: 'Agents Affected',
        value: agentSet.size,
        color: 'var(--warning)',
        bg: 'var(--warning-muted)',
        icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M1 13c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`
      },
      {
        label: 'Tool Errors',
        value: errors.filter(e => e.error_type === 'tool_error').length,
        color: 'var(--danger)',
        bg: 'var(--danger-muted)',
        icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10.5 3L13 5.5l-7 7L3 10l7-7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M8 5.5L10.5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M2 14l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`
      },
      {
        label: 'Stop Errors',
        value: errors.filter(e => e.error_type === 'stop_error').length,
        color: 'var(--warning)',
        bg: 'var(--warning-muted)',
        icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
          <rect x="5.5" y="5.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>`
      },
    ];
    return cards.map(c => `
      <div style="
        background:${c.bg};
        border:1px solid ${c.color}33;
        border-radius:8px;padding:12px 16px;
        display:flex;align-items:center;gap:10px;
        min-width:130px;flex:1
      ">
        <span style="color:${c.color}">${c.icon}</span>
        <div>
          <div style="font-size:20px;font-weight:700;color:${c.color};line-height:1.1">${c.value}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${c.label}</div>
        </div>
      </div>
    `).join('');
  },

  _renderRow(err, index) {
    const rowBg = index % 2 === 0 ? '' : 'background:var(--bg-elevated)';
    const isStop = err.error_type === 'stop_error';
    const badgeColor = isStop ? 'var(--warning)' : 'var(--danger)';
    const badgeBg = isStop ? 'var(--warning-muted)' : 'var(--danger-muted)';
    const typeLabel = isStop ? 'stop_error' : (err.error_type || 'error');

    const relTime = Utils.relativeTime ? Utils.relativeTime(err.timestamp) : this._relTime(err.timestamp);

    const toolBadge = err.tool_name
      ? `<span style="
          display:inline-block;background:var(--bg-elevated);
          border:1px solid var(--border-default);
          color:var(--text-secondary);font-family:'JetBrains Mono',monospace;
          font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px
        ">${Utils.esc(err.tool_name)}</span>`
      : '';

    return `<tr style="border-bottom:1px solid var(--border-default);${rowBg}">
      <td style="padding:10px 14px;white-space:nowrap">
        <span style="
          display:inline-flex;align-items:center;gap:5px;
          background:var(--accent-muted);color:var(--accent);
          border-radius:5px;padding:2px 8px;font-size:12px;font-weight:500
        ">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" fill="var(--accent)" opacity="0.5"/>
            <circle cx="5" cy="5" r="1.5" fill="var(--accent)"/>
          </svg>
          ${Utils.esc(err.agent_id || '—')}
        </span>
      </td>
      <td style="padding:10px 14px;color:var(--text-secondary);white-space:nowrap;font-size:12px" title="${Utils.esc(err.timestamp || '')}">
        ${Utils.esc(relTime)}
      </td>
      <td style="padding:10px 14px;white-space:nowrap">
        <span style="
          display:inline-block;background:${badgeBg};color:${badgeColor};
          border-radius:5px;padding:2px 8px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace
        ">${Utils.esc(typeLabel)}</span>
      </td>
      <td style="padding:10px 14px;color:var(--text-primary);max-width:480px">
        <span style="word-break:break-word">${Utils.esc(err.message || '—')}</span>${toolBadge}
      </td>
    </tr>`;
  },

  // Fallback relative time if Utils.relativeTime isn't available
  _relTime(ts) {
    if (!ts) return '—';
    try {
      const ms = Date.now() - new Date(ts).getTime();
      if (isNaN(ms)) return ts;
      const s = Math.floor(ms / 1000);
      if (s < 60) return 'just now';
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    } catch (_) {
      return ts;
    }
  },

  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    this._errors = [];
    this._filterAgent = '';
  }
};
