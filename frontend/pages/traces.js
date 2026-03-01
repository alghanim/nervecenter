/* AgentBoard — Agent Traces Timeline Page */
window.Pages = window.Pages || {};

Pages.traces = {
  _traces: [],
  _tasks: [],
  _agents: [],
  _autoRefresh: false,
  _refreshTimer: null,
  _selectedTask: '',
  _selectedAgent: '',
  _filters: { tool_call:true, llm_invoke:true, sub_agent_spawn:true, file_change:true, error:true },
  _expanded: {},

  async render(container) {
    container.innerHTML = '<div class="traces-page">' +
      '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">' +
        '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Task</label>' +
          '<select class="select" id="traceTaskSel" onchange="Pages.traces._onTaskChange(this.value)" style="min-width:180px"><option value="">All tasks</option></select></div>' +
        '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Agent</label>' +
          '<select class="select" id="traceAgentSel" onchange="Pages.traces._onAgentChange(this.value)" style="min-width:140px"><option value="">All agents</option></select></div>' +
        '<div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap" id="traceTypeFilters"></div>' +
        '<div style="margin-left:auto;display:flex;gap:8px;align-items:flex-end">' +
          '<button class="btn-secondary" onclick="Pages.traces._load()" style="font-size:12px">↻ Refresh</button>' +
          '<label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;cursor:pointer">' +
            '<input type="checkbox" id="traceAutoRefresh" onchange="Pages.traces._toggleAutoRefresh(this.checked)"> Auto (5s)</label>' +
        '</div>' +
      '</div>' +
      '<div id="traceStats" style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap"></div>' +
      '<div id="traceTimeline"><div class="loading-state"><div class="spinner"></div><span>Loading traces...</span></div></div>' +
    '</div>';

    this._renderTypeFilters();
    await Promise.all([this._loadTasks(), this._loadAgents()]);
    await this._load();
  },

  destroy() {
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  },

  async _loadTasks() {
    try {
      this._tasks = await apiFetch('/api/tasks') || [];
      var sel = document.getElementById('traceTaskSel');
      if (!sel) return;
      for (var i = 0; i < this._tasks.length; i++) {
        var t = this._tasks[i];
        var opt = document.createElement('option');
        opt.value = t.id; opt.textContent = (t.title||t.id).substring(0,40);
        sel.appendChild(opt);
      }
    } catch(_) {}
  },

  async _loadAgents() {
    try {
      this._agents = await apiFetch('/api/agents') || [];
      var sel = document.getElementById('traceAgentSel');
      if (!sel) return;
      for (var i = 0; i < this._agents.length; i++) {
        var a = this._agents[i];
        var opt = document.createElement('option');
        opt.value = a.id || a.name; opt.textContent = a.name || a.id;
        sel.appendChild(opt);
      }
    } catch(_) {}
  },

  _renderTypeFilters() {
    var el = document.getElementById('traceTypeFilters');
    if (!el) return;
    var types = [
      { key:'tool_call', icon:'🔧', label:'Tool' },
      { key:'llm_invoke', icon:'🧠', label:'LLM' },
      { key:'sub_agent_spawn', icon:'🔀', label:'Sub-agent' },
      { key:'file_change', icon:'📁', label:'File' },
      { key:'error', icon:'❌', label:'Error' }
    ];
    var self = this;
    el.innerHTML = types.map(function(t) {
      return '<label style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;cursor:pointer">' +
        '<input type="checkbox" ' + (self._filters[t.key]?'checked':'') + ' onchange="Pages.traces._filters.' + t.key + '=this.checked;Pages.traces._load()">' +
        t.icon + ' ' + t.label + '</label>';
    }).join('');
  },

  _onTaskChange(val) { this._selectedTask = val; this._selectedAgent = ''; document.getElementById('traceAgentSel').value = ''; this._load(); },
  _onAgentChange(val) { this._selectedAgent = val; this._selectedTask = ''; document.getElementById('traceTaskSel').value = ''; this._load(); },

  _toggleAutoRefresh(on) {
    this._autoRefresh = on;
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    if (on) { var self = this; this._refreshTimer = setInterval(function(){ self._load(true); }, 5000); }
  },

  async _load(silent) {
    if (!silent) {
      var el = document.getElementById('traceTimeline');
      if (el) el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>';
    }
    try {
      var activeTypes = Object.keys(this._filters).filter(function(k){ return Pages.traces._filters[k]; });
      var url;
      if (this._selectedTask) {
        url = '/api/tasks/' + this._selectedTask + '/traces?limit=200';
        if (activeTypes.length < 5) url += '&type=' + activeTypes.join(',');
      } else if (this._selectedAgent) {
        url = '/api/agents/' + this._selectedAgent + '/traces?limit=200';
      } else {
        url = '/api/tasks/traces?limit=200';
        if (activeTypes.length < 5) url += '&type=' + activeTypes.join(',');
      }
      this._traces = await apiFetch(url) || [];
      // client-side filter by type
      var f = this._filters;
      this._traces = this._traces.filter(function(t){ return f[t.trace_type] !== false; });
      this._renderStats();
      this._renderTimeline();
    } catch(e) {
      document.getElementById('traceTimeline').innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed to load traces</div><div class="empty-state-desc">'+Utils.esc(e.message)+'</div></div>';
    }
  },

  _renderStats() {
    var el = document.getElementById('traceStats');
    if (!el) return;
    var total = this._traces.length;
    var errors = this._traces.filter(function(t){ return t.trace_type === 'error'; }).length;
    var durations = this._traces.map(function(t){ return t.duration_ms || 0; }).filter(function(d){ return d > 0; });
    var avgDur = durations.length ? Math.round(durations.reduce(function(a,b){return a+b;},0) / durations.length) : 0;
    el.innerHTML =
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:13px"><span style="color:var(--text-tertiary)">Total</span><div style="font-size:20px;font-weight:700;color:var(--text-primary)">' + total + '</div></div>' +
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:13px"><span style="color:var(--text-tertiary)">Avg Duration</span><div style="font-size:20px;font-weight:700;color:var(--text-primary)">' + avgDur + 'ms</div></div>' +
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:13px"><span style="color:var(--text-tertiary)">Errors</span><div style="font-size:20px;font-weight:700;color:' + (errors?'var(--red,#ef4444)':'var(--text-primary)') + '">' + errors + '</div></div>';
  },

  _renderTimeline() {
    var el = document.getElementById('traceTimeline');
    if (!el) return;
    if (!this._traces.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-title">No traces found</div><div class="empty-state-desc">Select a task or agent, or adjust filters.</div></div>';
      return;
    }
    var icons = { tool_call:'🔧', llm_invoke:'🧠', sub_agent_spawn:'🔀', file_change:'📁', error:'❌' };
    var self = this;
    el.innerHTML = '<div style="position:relative;padding-left:28px">' +
      '<div style="position:absolute;left:12px;top:0;bottom:0;width:2px;background:var(--border)"></div>' +
      this._traces.map(function(t, i) {
        var icon = icons[t.trace_type] || '📌';
        var ts = new Date(t.timestamp || t.created_at);
        var timeStr = ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        var dateStr = ts.toLocaleDateString();
        var expanded = self._expanded[i];
        var contentJson = '';
        if (t.content || t.data || t.metadata) {
          try { contentJson = JSON.stringify(t.content || t.data || t.metadata, null, 2); } catch(_) { contentJson = String(t.content || t.data || ''); }
        }
        return '<div style="position:relative;margin-bottom:12px">' +
          '<div style="position:absolute;left:-22px;top:6px;width:12px;height:12px;border-radius:50%;background:var(--bg-secondary);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:8px">' + icon + '</div>' +
          '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;transition:border-color 0.15s' + (t.trace_type==='error'?';border-left:3px solid var(--red,#ef4444)':'') + '" onclick="Pages.traces._toggle(' + i + ')">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<span style="font-size:16px">' + icon + '</span>' +
              '<span style="font-weight:600;font-size:13px;color:var(--text-primary)">' + Utils.esc(t.trace_type) + '</span>' +
              (t.agent_name || t.agent_id ? '<span style="font-size:11px;padding:2px 8px;border-radius:9px;background:var(--accent-muted,rgba(99,102,241,0.12));color:var(--accent,#6366f1)">' + Utils.esc(t.agent_name || t.agent_id) + '</span>' : '') +
              (t.duration_ms ? '<span style="font-size:11px;padding:2px 6px;border-radius:9px;background:var(--bg-elevated,#1a1a2e);color:var(--text-secondary)">' + t.duration_ms + 'ms</span>' : '') +
              '<span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">' + Utils.esc(dateStr + ' ' + timeStr) + '</span>' +
            '</div>' +
            (expanded && contentJson ? '<pre style="margin-top:10px;padding:10px;background:var(--bg-primary);border-radius:6px;font-size:11px;color:var(--text-secondary);overflow-x:auto;white-space:pre-wrap;max-height:300px;overflow-y:auto">' + Utils.esc(contentJson) + '</pre>' : '') +
          '</div></div>';
      }).join('') +
    '</div>';
  },

  _toggle(i) {
    this._expanded[i] = !this._expanded[i];
    this._renderTimeline();
  }
};
