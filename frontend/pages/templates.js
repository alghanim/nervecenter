/* AgentBoard — Task Templates Page */
window.Pages = window.Pages || {};

Pages.templates = {
  _templates: [],
  _agents: [],
  _editId: null,
  _checklistItems: [],
  _ruleItems: [],

  async render(container) {
    container.innerHTML = `
      <div class="templates-page">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <span style="color:var(--text-secondary);font-size:13px">Reusable task templates with workflow rules.</span>
          <button class="btn-primary" onclick="Pages.templates._openModal()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:6px"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            New Template
          </button>
        </div>
        <div id="tmplList"><div class="loading-state"><div class="spinner"></div><span>Loading templates...</span></div></div>

        <div id="tmplModalOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:500;align-items:center;justify-content:center" onclick="if(event.target===this)Pages.templates._closeModal()">
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:24px;width:90%;max-width:640px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
            <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px" id="tmplModalTitle">New Template</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Name *</label>
                <input class="input" id="tmplName" type="text" placeholder="e.g. Bug Fix" style="width:100%;box-sizing:border-box">
              </div>
              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Default Priority</label>
                <select class="select" id="tmplPriority" style="width:100%;box-sizing:border-box">
                  <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div style="grid-column:1/-1">
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Description</label>
                <textarea class="input" id="tmplDesc" rows="2" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
              </div>
              <div style="grid-column:1/-1">
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Default Assignee</label>
                <select class="select" id="tmplAssignee" style="width:100%;box-sizing:border-box"><option value="">Unassigned</option></select>
              </div>
            </div>
            <div style="margin-top:16px">
              <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Checklist Items</label>
              <div id="tmplChecklist"></div>
              <button class="btn-secondary" style="font-size:12px;margin-top:6px" onclick="Pages.templates._addChecklistItem()">+ Add Item</button>
            </div>
            <div style="margin-top:16px">
              <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Workflow Rules</label>
              <div id="tmplRules"></div>
              <button class="btn-secondary" style="font-size:12px;margin-top:6px" onclick="Pages.templates._addRule()">+ Add Rule</button>
            </div>
            <div id="tmplError" style="display:none;color:var(--red,#ef4444);font-size:12px;margin-top:10px"></div>
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
              <button class="btn-secondary" onclick="Pages.templates._closeModal()">Cancel</button>
              <button class="btn-primary" id="tmplSaveBtn" onclick="Pages.templates._save()">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    await this._loadAgents();
    await this._loadTemplates();
  },

  destroy() {},

  async _loadAgents() {
    try { this._agents = await apiFetch('/api/agents') || []; } catch(_) { this._agents = []; }
  },

  async _loadTemplates() {
    try {
      this._templates = await apiFetch('/api/templates') || [];
      this._renderList();
    } catch(e) {
      document.getElementById('tmplList').innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed to load</div><div class="empty-state-desc">'+Utils.esc(e.message)+'</div></div>';
    }
  },

  _renderList() {
    var el = document.getElementById('tmplList');
    if (!el) return;
    if (!this._templates.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-title">No templates yet</div><div class="empty-state-desc">Create your first reusable task template.</div></div>';
      return;
    }
    var prioColors = { critical:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#6366f1' };
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">' + this._templates.map(function(t) {
      var rules = t.workflow_rules || t.rules || [];
      var pColor = prioColors[t.default_priority] || 'var(--text-tertiary)';
      return '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<span style="font-weight:600;font-size:14px;color:var(--text-primary)">' + Utils.esc(t.name) + '</span>' +
          '<span style="font-size:11px;padding:2px 8px;border-radius:9px;background:' + pColor + '22;color:' + pColor + ';font-weight:600">' + Utils.esc(t.default_priority||'medium') + '</span>' +
        '</div>' +
        (t.description ? '<div style="font-size:12px;color:var(--text-secondary);line-height:1.4">' + Utils.esc(t.description) + '</div>' : '') +
        '<div style="font-size:11px;color:var(--text-tertiary)">Assignee: ' + Utils.esc(t.default_assignee||'None') + ' · ' + rules.length + ' rule' + (rules.length!==1?'s':'') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:auto;padding-top:8px">' +
          '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="Pages.templates._instantiate(\'' + Utils.esc(t.id) + '\')">▶ Instantiate</button>' +
          '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="Pages.templates._edit(\'' + Utils.esc(t.id) + '\')">Edit</button>' +
          '<button class="btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--red,#ef4444)" onclick="Pages.templates._delete(\'' + Utils.esc(t.id) + '\',\'' + Utils.esc(t.name) + '\')">Delete</button>' +
        '</div></div>';
    }).join('') + '</div>';
  },

  _openModal(tmpl) {
    this._editId = tmpl ? tmpl.id : null;
    document.getElementById('tmplModalTitle').textContent = tmpl ? 'Edit Template' : 'New Template';
    document.getElementById('tmplName').value = tmpl ? tmpl.name : '';
    document.getElementById('tmplDesc').value = tmpl ? (tmpl.description||'') : '';
    document.getElementById('tmplPriority').value = tmpl ? (tmpl.default_priority||'medium') : 'medium';
    var sel = document.getElementById('tmplAssignee');
    sel.innerHTML = '<option value="">Unassigned</option>';
    for (var i = 0; i < this._agents.length; i++) {
      var a = this._agents[i];
      var opt = document.createElement('option');
      opt.value = a.id || a.name;
      opt.textContent = a.name || a.id;
      if (tmpl && tmpl.default_assignee === (a.id||a.name)) opt.selected = true;
      sel.appendChild(opt);
    }
    this._checklistItems = tmpl ? [].concat(tmpl.checklist||[]) : [];
    this._renderChecklist();
    this._ruleItems = tmpl ? [].concat(tmpl.workflow_rules||tmpl.rules||[]) : [];
    this._renderRulesEditor();
    document.getElementById('tmplError').style.display = 'none';
    document.getElementById('tmplModalOverlay').style.display = 'flex';
  },

  _closeModal() {
    document.getElementById('tmplModalOverlay').style.display = 'none';
  },

  _addChecklistItem() { this._checklistItems.push(''); this._renderChecklist(); },

  _renderChecklist() {
    var el = document.getElementById('tmplChecklist');
    if (!el) return;
    if (!this._checklistItems.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">No items</div>'; return; }
    el.innerHTML = this._checklistItems.map(function(item, i) {
      return '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">' +
        '<input class="input" type="text" value="' + Utils.esc(item) + '" style="flex:1;box-sizing:border-box;font-size:12px" onchange="Pages.templates._checklistItems[' + i + ']=this.value">' +
        '<button class="btn-icon" style="color:var(--red,#ef4444);font-size:14px" onclick="Pages.templates._checklistItems.splice(' + i + ',1);Pages.templates._renderChecklist()">×</button></div>';
    }).join('');
  },

  _addRule() {
    this._ruleItems.push({ from_status:'todo', to_status:'in-progress', action:'assign', target:'' });
    this._renderRulesEditor();
  },

  _renderRulesEditor() {
    var el = document.getElementById('tmplRules');
    if (!el) return;
    var statuses = ['todo','in-progress','review','done','blocked'];
    var actions = ['assign','notify','create_subtask'];
    if (!this._ruleItems.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">No rules</div>'; return; }
    el.innerHTML = this._ruleItems.map(function(r, i) {
      return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">' +
        '<select class="select" style="font-size:11px;width:auto" onchange="Pages.templates._ruleItems[' + i + '].from_status=this.value">' +
          statuses.map(function(s){ return '<option value="'+s+'"'+(r.from_status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
        '</select>' +
        '<span style="color:var(--text-tertiary);font-size:12px">→</span>' +
        '<select class="select" style="font-size:11px;width:auto" onchange="Pages.templates._ruleItems[' + i + '].to_status=this.value">' +
          statuses.map(function(s){ return '<option value="'+s+'"'+(r.to_status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
        '</select>' +
        '<select class="select" style="font-size:11px;width:auto" onchange="Pages.templates._ruleItems[' + i + '].action=this.value">' +
          actions.map(function(a){ return '<option value="'+a+'"'+(r.action===a?' selected':'')+'>'+a+'</option>'; }).join('') +
        '</select>' +
        '<input class="input" type="text" placeholder="target" value="' + Utils.esc(r.target||'') + '" style="flex:1;font-size:11px;min-width:80px;box-sizing:border-box" onchange="Pages.templates._ruleItems[' + i + '].target=this.value">' +
        '<button class="btn-icon" style="color:var(--red,#ef4444);font-size:14px" onclick="Pages.templates._ruleItems.splice(' + i + ',1);Pages.templates._renderRulesEditor()">×</button></div>';
    }).join('');
  },

  async _save() {
    var name = (document.getElementById('tmplName').value||'').trim();
    if (!name) {
      var err = document.getElementById('tmplError');
      err.textContent = 'Name is required.'; err.style.display = '';
      return;
    }
    var body = {
      name: name,
      description: document.getElementById('tmplDesc').value || '',
      default_assignee: document.getElementById('tmplAssignee').value || '',
      default_priority: document.getElementById('tmplPriority').value || 'medium',
      checklist: this._checklistItems.filter(function(x){return x.trim();}),
      workflow_rules: this._ruleItems
    };
    var btn = document.getElementById('tmplSaveBtn');
    btn.disabled = true;
    try {
      if (this._editId) {
        await apiFetch('/api/templates/' + this._editId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      } else {
        await apiFetch('/api/templates', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      }
      this._closeModal();
      await this._loadTemplates();
    } catch(e) {
      var err2 = document.getElementById('tmplError');
      err2.textContent = 'Error: ' + e.message; err2.style.display = '';
    } finally { btn.disabled = false; }
  },

  async _edit(id) {
    try {
      var t = await apiFetch('/api/templates/' + id);
      this._openModal(t);
    } catch(e) { alert('Failed to load template: ' + e.message); }
  },

  async _delete(id, name) {
    if (!confirm('Delete template "' + name + '"?')) return;
    try {
      await apiFetch('/api/templates/' + id, { method:'DELETE' });
      await this._loadTemplates();
    } catch(e) { alert('Failed: ' + e.message); }
  },

  async _instantiate(id) {
    try {
      var task = await apiFetch('/api/templates/' + id + '/instantiate', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
      alert('Task created: ' + (task.title || task.id));
    } catch(e) { alert('Failed: ' + e.message); }
  }
};
