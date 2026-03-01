/* AgentBoard — Incidents Page */
window.Pages = window.Pages || {};

Pages.incidents = {
  _incidents: [],
  _detail: null,

  async render(container) {
    container.innerHTML = '<div class="incidents-page">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<span style="color:var(--text-secondary);font-size:13px">Incident tracking and postmortems.</span>' +
        '<button class="btn-primary" onclick="Pages.incidents._showCreate()">+ New Incident</button>' +
      '</div>' +
      '<div id="incCreate" style="display:none;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">' +
        '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Create Incident</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Title *</label><input class="input" id="incTitle" style="width:100%;box-sizing:border-box"></div>' +
          '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Severity</label><select class="select" id="incSeverity" style="width:100%;box-sizing:border-box"><option value="critical">Critical</option><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div>' +
          '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Linked Task IDs (comma-separated)</label><input class="input" id="incTasks" style="width:100%;box-sizing:border-box" placeholder="task-1, task-2"></div>' +
          '<div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Linked Agent IDs</label><input class="input" id="incAgents" style="width:100%;box-sizing:border-box" placeholder="forge, pixel"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end"><button class="btn-secondary" onclick="document.getElementById(\'incCreate\').style.display=\'none\'">Cancel</button><button class="btn-primary" onclick="Pages.incidents._create()">Create</button></div>' +
      '</div>' +
      '<div id="incDetail" style="display:none"></div>' +
      '<div id="incList"><div class="loading-state"><div class="spinner"></div><span>Loading...</span></div></div>' +
    '</div>';
    await this._load();
  },

  destroy() {},

  _showCreate() { document.getElementById('incCreate').style.display = ''; },

  async _create() {
    var title = (document.getElementById('incTitle').value||'').trim();
    if (!title) { alert('Title required'); return; }
    var body = {
      title: title,
      severity: document.getElementById('incSeverity').value,
      linked_tasks: (document.getElementById('incTasks').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean),
      linked_agents: (document.getElementById('incAgents').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean)
    };
    try {
      await apiFetch('/api/incidents', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      document.getElementById('incCreate').style.display = 'none';
      document.getElementById('incTitle').value = '';
      await this._load();
    } catch(e) { alert('Failed: ' + e.message); }
  },

  async _load() {
    try {
      this._incidents = await apiFetch('/api/incidents') || [];
      this._renderList();
    } catch(e) {
      document.getElementById('incList').innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed</div><div class="empty-state-desc">'+Utils.esc(e.message)+'</div></div>';
    }
  },

  _renderList() {
    var el = document.getElementById('incList');
    if (!el) return;
    if (!this._incidents.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-title">No incidents</div></div>';
      return;
    }
    var sevColors = { critical:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#6366f1' };
    el.innerHTML = '<div style="display:grid;gap:10px">' + this._incidents.map(function(inc) {
      var sc = sevColors[inc.severity] || 'var(--text-tertiary)';
      var ts = new Date(inc.created_at);
      var tasks = inc.linked_tasks || [];
      var agents = inc.linked_agents || [];
      return '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:4px solid '+sc+';border-radius:8px;padding:14px 16px;cursor:pointer" onclick="Pages.incidents._openDetail(\''+Utils.esc(inc.id)+'\')">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span style="font-weight:600;font-size:14px;color:var(--text-primary)">' + Utils.esc(inc.title) + '</span>' +
          '<span style="font-size:11px;padding:2px 8px;border-radius:9px;background:'+sc+'22;color:'+sc+';font-weight:600">' + Utils.esc(inc.severity) + '</span>' +
          '<span style="font-size:11px;padding:2px 8px;border-radius:9px;background:var(--bg-elevated);color:var(--text-secondary)">' + Utils.esc(inc.status||'open') + '</span>' +
          '<span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">' + ts.toLocaleDateString() + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">' + tasks.length + ' task(s) · ' + agents.length + ' agent(s)</div>' +
      '</div>';
    }).join('') + '</div>';
  },

  async _openDetail(id) {
    try {
      this._detail = await apiFetch('/api/incidents/' + id);
      this._renderDetail();
    } catch(e) { alert('Failed: ' + e.message); }
  },

  _renderDetail() {
    var d = this._detail;
    if (!d) return;
    var el = document.getElementById('incDetail');
    var listEl = document.getElementById('incList');
    if (!el) return;
    listEl.style.display = 'none';
    el.style.display = '';

    var sevColors = { critical:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#6366f1' };
    var sc = sevColors[d.severity] || 'var(--text-tertiary)';
    var statuses = ['open','investigating','mitigating','resolved','closed'];
    var timeline = d.timeline || [];
    var timelineHtml = '';
    if (timeline.length) {
      try {
        timelineHtml = '<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Timeline</div>' +
          timeline.map(function(ev) {
            var ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '';
            return '<div style="padding:8px;background:var(--bg-primary);border-radius:6px;margin-bottom:6px;font-size:12px">' +
              '<span style="color:var(--text-tertiary)">' + Utils.esc(ts) + '</span> ' +
              '<span style="color:var(--text-primary)">' + Utils.esc(ev.message || JSON.stringify(ev)) + '</span></div>';
          }).join('') + '</div>';
      } catch(_) {}
    }

    el.innerHTML = '<div style="margin-bottom:16px">' +
      '<button class="btn-secondary" onclick="Pages.incidents._closeDetail()" style="font-size:12px;margin-bottom:12px">← Back</button>' +
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:4px solid '+sc+';border-radius:8px;padding:20px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<span style="font-weight:700;font-size:18px;color:var(--text-primary)">' + Utils.esc(d.title) + '</span>' +
          '<span style="font-size:11px;padding:2px 8px;border-radius:9px;background:'+sc+'22;color:'+sc+';font-weight:600">' + Utils.esc(d.severity) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
          '<label style="font-size:12px;color:var(--text-secondary)">Status:</label>' +
          '<select class="select" id="incStatusSel" onchange="Pages.incidents._updateStatus(this.value)" style="font-size:12px">' +
            statuses.map(function(s){ return '<option value="'+s+'"'+(d.status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div style="margin-bottom:12px">' +
          '<label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Root Cause</label>' +
          '<textarea class="input" id="incRootCause" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;font-size:12px" onchange="Pages.incidents._updateRootCause(this.value)">' + Utils.esc(d.root_cause||'') + '</textarea>' +
        '</div>' +
        (d.linked_tasks && d.linked_tasks.length ? '<div style="margin-bottom:8px"><span style="font-size:12px;color:var(--text-secondary)">Linked Tasks: </span>' + d.linked_tasks.map(function(t){ return '<a onclick="App.navigate(\'kanban\')" style="font-size:12px;color:var(--accent);cursor:pointer;margin-right:6px">' + Utils.esc(t) + '</a>'; }).join('') + '</div>' : '') +
        (d.linked_agents && d.linked_agents.length ? '<div style="margin-bottom:8px"><span style="font-size:12px;color:var(--text-secondary)">Linked Agents: </span>' + d.linked_agents.map(function(a){ return '<span style="font-size:12px;color:var(--text-primary);margin-right:6px">' + Utils.esc(a) + '</span>'; }).join('') + '</div>' : '') +
        timelineHtml +
      '</div></div>';
  },

  _closeDetail() {
    document.getElementById('incDetail').style.display = 'none';
    document.getElementById('incList').style.display = '';
    this._detail = null;
  },

  async _updateStatus(status) {
    if (!this._detail) return;
    try {
      await apiFetch('/api/incidents/' + this._detail.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status:status }) });
      this._detail.status = status;
    } catch(e) { alert('Failed: ' + e.message); }
  },

  async _updateRootCause(val) {
    if (!this._detail) return;
    try {
      await apiFetch('/api/incidents/' + this._detail.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ root_cause:val }) });
    } catch(_) {}
  }
};
