/* AgentBoard — Log Viewer Page (session-file based) */

window.Pages = window.Pages || {};

Pages.logs = {
  _refreshTimer: null,
  _liveRefresh: false,
  _searchDebounce: null,
  _expandedRows: new Set(),
  _currentFilter: { search: '', agent: '', level: '' },
  _entries: [],

  async render(container) {
    container.innerHTML = `
      <div class="logs-page" style="display:flex;flex-direction:column;height:100%;gap:12px">

        <!-- Top Controls -->
        <div style="display:flex;flex-direction:column;gap:10px">

          <!-- Search bar -->
          <div style="display:flex;gap:8px;align-items:center">
            <div style="position:relative;flex:1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/>
                <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input id="logSearchInput" type="text" class="input" placeholder="Search agent logs…"
                style="width:100%;padding-left:34px;box-sizing:border-box"
                oninput="Pages.logs._onSearch(this.value)">
            </div>

            <!-- Live refresh toggle -->
            <button class="btn-secondary" id="btnLive" onclick="Pages.logs._toggleLive()"
              style="white-space:nowrap;min-width:130px">
              ⏸ Live: OFF
            </button>
            <button class="btn-secondary" onclick="Pages.logs._refresh()" style="white-space:nowrap">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:4px;vertical-align:middle">
                <path d="M12 7A5 5 0 1 1 7 2c1.4 0 2.7.6 3.6 1.5L12 2v5h-5l2-2"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Refresh
            </button>
          </div>

          <!-- Filter row -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <!-- Agent filter -->
            <select class="select" id="logAgentFilter" style="min-width:150px"
              onchange="Pages.logs._onAgentFilter(this.value)">
              <option value="">All Agents</option>
            </select>

            <!-- Level chips -->
            <div style="display:flex;gap:4px" id="levelChips">
              ${[
                { value: '',      label: 'All'   },
                { value: 'info',  label: 'Info'  },
                { value: 'tool',  label: 'Tools' },
                { value: 'error', label: 'Errors'},
              ].map(lvl => `
                <button class="log-level-chip ${lvl.value === '' ? 'active' : ''}"
                  data-level="${lvl.value}"
                  onclick="Pages.logs._onLevelFilter('${lvl.value}')"
                  style="padding:3px 12px;border-radius:12px;border:1px solid var(--border);
                    background:var(--bg-inset);font-size:11px;font-weight:600;cursor:pointer;
                    transition:all .15s;color:var(--text-secondary)">
                  ${lvl.label}
                </button>`).join('')}
            </div>

            <span id="logCount" style="font-size:12px;color:var(--text-muted);margin-left:auto"></span>
          </div>
        </div>

        <!-- Results feed -->
        <div class="settings-section" style="padding:0;flex:1;overflow:hidden;display:flex;flex-direction:column">
          <div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="color:var(--text-muted)">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M3 4h8M3 7h8M3 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="font-size:11px;color:var(--text-muted);font-weight:500;letter-spacing:.05em">SESSION LOGS</span>
          </div>
          <div id="logFeed" style="flex:1;overflow-y:auto;padding:4px 0">
            <div class="loading-state"><div class="spinner"></div><span>Loading logs…</span></div>
          </div>
        </div>
      </div>`;

    await this._loadAgentOptions();
    await this._refresh();
  },

  async _loadAgentOptions() {
    try {
      const agents = await API.getAgents();
      const sel = document.getElementById('logAgentFilter');
      if (!sel) return;
      (agents || []).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id || a.name;
        opt.textContent = `${a.emoji || '🤖'} ${a.name || a.id}`;
        sel.appendChild(opt);
      });
    } catch (_) {}
  },

  _onSearch(val) {
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._currentFilter.search = val;
      this._expandedRows.clear();
      this._refresh();
    }, 300);
  },

  _onAgentFilter(val) {
    this._currentFilter.agent = val;
    this._expandedRows.clear();
    this._refresh();
  },

  _onLevelFilter(level) {
    this._currentFilter.level = level;
    this._expandedRows.clear();
    // Chip styling
    document.querySelectorAll('.log-level-chip').forEach(btn => {
      const active = btn.dataset.level === level;
      btn.classList.toggle('active', active);
      const colours = { info: '#3b82f6', tool: '#8b5cf6', error: '#ef4444' };
      if (active && level) {
        btn.style.background   = (colours[level] || '#6b7280') + '22';
        btn.style.borderColor  = colours[level] || '#6b7280';
        btn.style.color        = colours[level] || '#6b7280';
      } else if (active) {
        btn.style.background  = 'var(--accent-muted)';
        btn.style.borderColor = 'var(--accent)';
        btn.style.color       = 'var(--accent)';
      } else {
        btn.style.background  = 'var(--bg-inset)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color       = 'var(--text-secondary)';
      }
    });
    this._refresh();
  },

  async _refresh() {
    const feed = document.getElementById('logFeed');
    if (!feed) return;

    try {
      const f = this._currentFilter;
      const params = { limit: 200 };
      if (f.agent)  params.agent  = f.agent;
      if (f.search) params.search = f.search;
      if (f.level)  params.level  = f.level;

      const result = await API.getLogs(params);
      this._entries = result.entries || [];

      const countEl = document.getElementById('logCount');
      if (countEl) {
        countEl.textContent = this._entries.length
          ? `${this._entries.length} entries`
          : '';
      }

      if (!this._entries.length) {
        feed.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
            height:200px;gap:12px;color:var(--text-muted)">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="4" width="32" height="32" rx="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M12 14h16M12 20h16M12 26h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="font-size:14px;font-weight:500">No logs found</span>
            <span style="font-size:12px">Try adjusting your search or filters</span>
          </div>`;
        return;
      }

      feed.innerHTML = this._entries.map((e, i) => this._rowHTML(e, i)).join('');

    } catch (err) {
      const feed2 = document.getElementById('logFeed');
      if (feed2) feed2.innerHTML = `<div style="color:#ef4444;padding:24px">
        Failed to load logs: ${Utils.esc(err.message)}</div>`;
    }
  },

  _rowHTML(e, idx) {
    const ts    = e.timestamp ? new Date(e.timestamp) : new Date();
    const date  = ts.toLocaleDateString('en-GB', { month: 'short', day: '2-digit' });
    const time  = ts.toLocaleTimeString('en-GB', { hour12: false });

    const levelMeta = {
      info:  { color: '#3b82f6', label: 'INFO' },
      tool:  { color: '#8b5cf6', label: 'TOOL' },
      error: { color: '#ef4444', label: 'ERR'  },
    };
    const lm = levelMeta[e.level] || { color: 'var(--text-muted)', label: (e.level || 'INFO').toUpperCase() };

    const roleEmoji = e.role === 'user' ? '👤' : '🤖';
    const preview   = Utils.esc(e.content_preview || '');
    const agentID   = Utils.esc(e.agent_id || '');
    const sessionID = e.session_id ? e.session_id.slice(0, 8) : '';
    const isExpanded = this._expandedRows.has(idx);

    return `<div class="log-row" id="logrow-${idx}"
        style="padding:6px 16px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));
          cursor:pointer;transition:background .1s"
        onmouseenter="this.style.background='var(--bg-hover,rgba(255,255,255,0.03))'"
        onmouseleave="this.style.background=''"
        onclick="Pages.logs._toggleRow(${idx})">
      <div style="display:flex;gap:10px;align-items:baseline">
        <!-- Timestamp -->
        <span style="color:var(--text-muted);font-size:11px;flex-shrink:0;font-family:var(--font-mono,'JetBrains Mono',monospace);min-width:105px">
          ${Utils.esc(date)} ${Utils.esc(time)}
        </span>

        <!-- Level badge -->
        <span style="color:${lm.color};font-size:10px;font-weight:700;min-width:34px;flex-shrink:0;
          font-family:var(--font-mono,'JetBrains Mono',monospace)">
          ${lm.label}
        </span>

        <!-- Role icon + agent badge -->
        <span style="font-size:12px;flex-shrink:0">${roleEmoji}</span>
        <button class="agent-badge" onclick="event.stopPropagation();Pages.logs._filterAgent('${agentID}')"
          style="background:var(--accent-muted);color:var(--accent);border:none;border-radius:10px;
            padding:1px 8px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0">
          ${agentID}
        </button>

        <!-- Preview -->
        <span style="flex:1;font-size:12px;color:var(--text-secondary);overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono,'JetBrains Mono',monospace)">
          ${preview}
        </span>

        <!-- Session ID + expand indicator -->
        <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;opacity:.6">${Utils.esc(sessionID)}</span>
        <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;transition:transform .15s;
          transform:rotate(${isExpanded ? 90 : 0}deg)">›</span>
      </div>

      ${isExpanded ? this._expandedHTML(e) : ''}
    </div>`;
  },

  _expandedHTML(e) {
    const content = Utils.esc(e.content_preview || '(empty)');
    const sessionFull = Utils.esc(e.session_id || '');
    const role  = Utils.esc(e.role || '');
    const agent = Utils.esc(e.agent_id || '');
    const ts    = e.timestamp ? new Date(e.timestamp).toISOString() : '';

    return `<div style="margin-top:8px;padding:12px;background:var(--bg-inset);border-radius:6px;
        border:1px solid var(--border);font-size:12px;font-family:var(--font-mono,'JetBrains Mono',monospace)">
      <div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
        <span><span style="color:var(--text-muted)">agent:</span> <strong>${agent}</strong></span>
        <span><span style="color:var(--text-muted)">role:</span> <strong>${role}</strong></span>
        <span><span style="color:var(--text-muted)">session:</span>
          <span style="color:var(--accent)">${sessionFull}</span></span>
        <span><span style="color:var(--text-muted)">time:</span> ${Utils.esc(ts)}</span>
      </div>
      <div style="white-space:pre-wrap;word-break:break-word;color:var(--text-primary);
        max-height:300px;overflow-y:auto;line-height:1.6">${content}</div>
    </div>`;
  },

  _toggleRow(idx) {
    if (this._expandedRows.has(idx)) {
      this._expandedRows.delete(idx);
    } else {
      this._expandedRows.add(idx);
    }
    // Re-render just that row
    const e = this._entries[idx];
    const el = document.getElementById(`logrow-${idx}`);
    if (el && e) {
      el.outerHTML = this._rowHTML(e, idx);
    }
  },

  _filterAgent(agentID) {
    this._currentFilter.agent = agentID;
    const sel = document.getElementById('logAgentFilter');
    if (sel) sel.value = agentID;
    this._refresh();
  },

  _toggleLive() {
    this._liveRefresh = !this._liveRefresh;
    const btn = document.getElementById('btnLive');
    if (btn) {
      btn.textContent = this._liveRefresh ? '▶ Live: ON' : '⏸ Live: OFF';
      btn.style.color       = this._liveRefresh ? 'var(--accent)' : '';
      btn.style.borderColor = this._liveRefresh ? 'var(--accent)' : '';
    }
    clearInterval(this._refreshTimer);
    if (this._liveRefresh) {
      this._refreshTimer = setInterval(() => this._refresh(), 5000);
    }
  },

  destroy() {
    clearInterval(this._refreshTimer);
    clearTimeout(this._searchDebounce);
    this._refreshTimer    = null;
    this._searchDebounce  = null;
    this._expandedRows    = new Set();
    this._liveRefresh     = false;
  }
};
