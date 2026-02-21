/* AgentBoard — Log Viewer Page */

window.Pages = window.Pages || {};

Pages.logs = {
  _refreshTimer: null,
  _autoScroll: true,
  _paused: false,
  _searchDebounce: null,
  _currentFilter: { q: '', agent_id: '', level: '', file: '' },
  _logFiles: [],

  async render(container) {
    container.innerHTML = `
      <div class="logs-page" style="display:flex;flex-direction:column;height:100%;gap:12px">

        <!-- Top Controls -->
        <div style="display:flex;flex-direction:column;gap:10px">
          <!-- Search Bar -->
          <div style="display:flex;gap:8px;align-items:center">
            <div style="position:relative;flex:1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/>
                <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input id="logSearch" type="text" class="input" placeholder="Search logs…"
                style="width:100%;padding-left:34px;box-sizing:border-box"
                oninput="Pages.logs._onSearch(this.value)">
            </div>
            <button class="btn-secondary" id="btnAutoScroll" onclick="Pages.logs._toggleAutoScroll()"
              title="Auto-scroll" style="white-space:nowrap;min-width:120px">
              📍 Auto-scroll ON
            </button>
            <button class="btn-secondary" id="btnPause" onclick="Pages.logs._togglePause()"
              title="Pause/Resume" style="white-space:nowrap;min-width:110px">
              ⏸ Pause
            </button>
            <button class="btn-secondary" onclick="Pages.logs._refresh()" style="white-space:nowrap">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:4px">
                <path d="M12 7A5 5 0 1 1 7 2c1.4 0 2.7.6 3.6 1.5L12 2v5h-5l2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Refresh
            </button>
          </div>

          <!-- Filter Chips Row -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <!-- Agent filter -->
            <select class="select" id="logAgentFilter" style="min-width:140px" onchange="Pages.logs._onAgentFilter(this.value)">
              <option value="">All Agents</option>
            </select>

            <!-- Level chips -->
            <div style="display:flex;gap:4px">
              ${['', 'debug', 'info', 'warn', 'error'].map(lvl => `
                <button class="log-level-chip ${lvl === '' ? 'active' : ''}" data-level="${lvl}"
                  onclick="Pages.logs._onLevelFilter('${lvl}')"
                  style="padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:var(--bg-inset);
                    font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;color:var(--text-secondary)">
                  ${lvl === '' ? 'All' : lvl.toUpperCase()}
                </button>`).join('')}
            </div>

            <!-- File selector -->
            <select class="select" id="logFileFilter" style="min-width:160px;margin-left:auto" onchange="Pages.logs._onFileFilter(this.value)">
              <option value="">All Files</option>
            </select>
          </div>
        </div>

        <!-- Log Output -->
        <div class="settings-section" style="padding:0;flex:1;overflow:hidden;display:flex;flex-direction:column">
          <div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="color:var(--text-muted)">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M4 5h6M4 7.5h6M4 10h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="font-size:11px;color:var(--text-muted);font-weight:500">LOG OUTPUT</span>
            <span id="logCount" style="font-size:11px;color:var(--text-muted);margin-left:4px"></span>
          </div>
          <div id="logOutput" style="flex:1;overflow-y:auto;padding:8px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;line-height:1.7">
            <div class="loading-state"><div class="spinner"></div><span>Loading logs…</span></div>
          </div>
        </div>
      </div>`;

    // Load file list and agent options in parallel
    await Promise.all([this._loadFiles(), this._loadAgentOptions()]);
    await this._refresh();

    // Auto-refresh every 15s when not paused
    this._refreshTimer = setInterval(() => {
      if (!this._paused) this._refresh();
    }, 15000);
  },

  async _loadFiles() {
    try {
      const files = await API.getLogFiles();
      this._logFiles = files || [];
      const sel = document.getElementById('logFileFilter');
      if (!sel) return;
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.name;
        const kb = (f.size_bytes / 1024).toFixed(1);
        opt.textContent = `📄 ${f.name} (${kb}KB, ${f.line_count} lines)`;
        sel.appendChild(opt);
      });
    } catch (_) {}
  },

  async _loadAgentOptions() {
    try {
      const agents = await API.getAgents();
      const sel = document.getElementById('logAgentFilter');
      if (!sel) return;
      agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id || a.name;
        opt.textContent = `${a.emoji || '🤖'} ${a.name || a.id}`;
        sel.appendChild(opt);
      });
    } catch (_) {}
  },

  _onSearch(val) {
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._currentFilter.q = val;
      this._refresh();
    }, 350);
  },

  _onAgentFilter(val) {
    this._currentFilter.agent_id = val;
    this._refresh();
  },

  _onLevelFilter(level) {
    this._currentFilter.level = level;
    // Update chip styling
    document.querySelectorAll('.log-level-chip').forEach(btn => {
      const active = btn.dataset.level === level;
      btn.classList.toggle('active', active);
      const levelColors = { debug: '#6b7280', info: '#3b82f6', warn: '#eab308', error: '#ef4444' };
      if (active && level) {
        btn.style.background = levelColors[level] + '22';
        btn.style.borderColor = levelColors[level];
        btn.style.color = levelColors[level];
      } else if (active) {
        btn.style.background = 'var(--accent-muted)';
        btn.style.borderColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
      } else {
        btn.style.background = 'var(--bg-inset)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text-secondary)';
      }
    });
    this._refresh();
  },

  _onFileFilter(val) {
    this._currentFilter.file = val;
    this._refresh();
  },

  async _refresh() {
    const output = document.getElementById('logOutput');
    if (!output) return;

    // Remember scroll position
    const wasAtBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40;

    try {
      let entries;
      const f = this._currentFilter;

      if (f.q) {
        const params = { q: f.q };
        if (f.agent_id) params.agent_id = f.agent_id;
        if (f.level) params.level = f.level;
        params.limit = 200;
        const result = await API.searchLogs(params);
        entries = result.entries || [];
      } else {
        const params = { limit: 200 };
        if (f.agent_id) params.agent_id = f.agent_id;
        if (f.level) params.level = f.level;
        if (f.file) params.file = f.file;
        const result = await API.getLogs(params);
        entries = result.entries || [];
      }

      const countEl = document.getElementById('logCount');
      if (countEl) countEl.textContent = `(${entries.length} entries)`;

      if (!entries.length) {
        output.innerHTML = `<div style="color:var(--text-muted);padding:24px;text-align:center">No log entries found</div>`;
        return;
      }

      output.innerHTML = entries.map(e => this._entryHTML(e)).join('');

      // Auto-scroll to bottom if was at bottom
      if (this._autoScroll && (wasAtBottom || !this._paused)) {
        output.scrollTop = output.scrollHeight;
      }
    } catch (err) {
      output.innerHTML = `<div style="color:#ef4444;padding:24px">Failed to load logs: ${Utils.esc(err.message)}</div>`;
    }
  },

  _entryHTML(e) {
    const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : '??:??:??';
    const date = e.timestamp ? new Date(e.timestamp).toLocaleDateString('en-GB', { month: '2-digit', day: '2-digit' }) : '';

    const levelColors = {
      error: '#ef4444',
      fatal: '#dc2626',
      warn:  '#eab308',
      warning: '#eab308',
      info:  '#3b82f6',
      debug: '#6b7280',
    };
    const levelColor = levelColors[e.level?.toLowerCase()] || 'var(--text-muted)';
    const levelLabel = (e.level || 'info').toUpperCase().padEnd(5);

    const agentId = e.agent_id && e.agent_id !== 'system' ? e.agent_id : null;
    const agentSpan = agentId
      ? `<span class="log-agent-link" onclick="Pages.logs._onAgentFilter('${Utils.esc(agentId)}');document.getElementById('logAgentFilter').value='${Utils.esc(agentId)}'"
          style="color:var(--accent);cursor:pointer;text-decoration:underline dotted">${Utils.esc(agentId)}</span> `
      : '';

    const file = e.source_file
      ? `<span style="color:var(--text-muted);opacity:0.6;font-size:10px"> [${Utils.esc(e.source_file)}]</span>`
      : '';

    return `<div class="log-entry" style="padding:1px 4px;border-radius:2px;display:flex;gap:8px;align-items:flex-start"
        onmouseenter="this.style.background='var(--bg-hover,rgba(255,255,255,0.03))'"
        onmouseleave="this.style.background=''">
      <span style="color:var(--text-muted);opacity:0.7;flex-shrink:0;user-select:none">${Utils.esc(date)} ${Utils.esc(ts)}</span>
      <span style="color:${levelColor};font-weight:600;flex-shrink:0;min-width:36px">${Utils.esc(levelLabel.trim())}</span>
      <span style="flex:1;word-break:break-word">${agentSpan}${Utils.esc(e.message || '')}${file}</span>
    </div>`;
  },

  _toggleAutoScroll() {
    this._autoScroll = !this._autoScroll;
    const btn = document.getElementById('btnAutoScroll');
    if (btn) btn.textContent = this._autoScroll ? '📍 Auto-scroll ON' : '📍 Auto-scroll OFF';
    if (this._autoScroll) {
      const output = document.getElementById('logOutput');
      if (output) output.scrollTop = output.scrollHeight;
    }
  },

  _togglePause() {
    this._paused = !this._paused;
    const btn = document.getElementById('btnPause');
    if (btn) {
      btn.textContent = this._paused ? '▶ Resume' : '⏸ Pause';
      btn.style.color = this._paused ? 'var(--accent)' : '';
      btn.style.borderColor = this._paused ? 'var(--accent)' : '';
    }
    if (!this._paused) this._refresh();
  },

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    this._searchDebounce = null;
  }
};
