/* AgentBoard — Settings Page */

window.Pages = window.Pages || {};

Pages.settings = {
  _webhooks: [],
  _showWebhookForm: false,
  _editingWebhookId: null,
  _auditRefreshTimer: null,
  _auditActionFilter: '',

  async render(container) {
    container.innerHTML = `
      <div style="max-width:800px">
        <div class="settings-section">
          <div class="settings-section-title">Connection</div>
          <div id="settingsConnection">
            <div class="loading-state"><div class="spinner"></div><span>Checking...</span></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Branding</div>
          <div id="settingsBranding">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Agents</div>
          <div id="settingsAgents">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between">
            <span>Environments</span>
            <button class="btn-secondary" onclick="Pages.settings._openEnvForm()" style="font-size:12px;padding:4px 10px">+ Add Environment</button>
          </div>
          <div id="settingsEnvironments">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
          <div id="envForm" style="display:none"></div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between">
            <span>Webhooks</span>
            <button class="btn-secondary" onclick="Pages.settings._openWebhookForm()" style="font-size:12px;padding:4px 10px">+ Add Webhook</button>
          </div>
          <!-- Webhook info card -->
          <div style="
            background: rgba(34,211,238,0.05);
            border: 1px solid rgba(34,211,238,0.2);
            border-radius: 10px;
            padding: 14px 16px;
            margin-bottom: 14px;
            font-size: 13px;
          ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:16px">🔗</span>
              <span style="font-weight:600;color:var(--text-primary)">How Webhooks Work</span>
            </div>
            <div style="color:var(--text-secondary);line-height:1.6;margin-bottom:10px">
              <strong style="color:var(--text-primary)">What it does:</strong> Sends a POST request to your URL whenever a task is created, updated, or its status changes.<br>
              <strong style="color:var(--text-primary)">Works with:</strong> Any HTTP endpoint — Zapier, Make, Slack, custom servers, or your own backend.
            </div>
            <div style="margin-top:10px">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:6px">Payload example</div>
              <pre style="
                background: var(--bg-elevated);
                border: 1px solid var(--border-default);
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 11px;
                font-family: var(--font-display, monospace);
                color: #22d3ee;
                overflow-x: auto;
                margin: 0;
                line-height: 1.5;
              ">{
  "event": "task.updated",
  "task": {
    "id": "abc-123",
    "title": "Fix login bug",
    "status": "in-progress",
    "assignee": "pixel",
    "priority": "high",
    "updated_at": "2026-02-22T15:00:00Z"
  }
}</pre>
            </div>
          </div>
          <div id="settingsWebhooks">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
          <div id="webhookForm" style="display:none"></div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <span>Audit Log</span>
            <div style="display:flex;align-items:center;gap:8px">
              <select id="auditActionFilter" onchange="Pages.settings._onAuditFilterChange()" style="font-size:12px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:3px 8px;color:var(--text-primary);cursor:pointer">
                <option value="">All actions</option>
                <option value="agent_paused">agent_paused</option>
                <option value="agent_resumed">agent_resumed</option>
                <option value="agent_killed">agent_killed</option>
                <option value="task_transitioned">task_transitioned</option>
                <option value="webhook_created">webhook_created</option>
                <option value="webhook_deleted">webhook_deleted</option>
                <option value="alert_rule_created">alert_rule_created</option>
                <option value="alert_rule_deleted">alert_rule_deleted</option>
              </select>
              <button class="btn-secondary" onclick="Pages.settings._loadAuditLog()" style="font-size:12px;padding:3px 8px" title="Refresh">↺ Refresh</button>
            </div>
          </div>
          <div id="settingsAuditLog">
            <div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">About</div>
          <div class="settings-row">
            <span class="settings-key">product</span>
            <span class="settings-value">AgentBoard</span>
          </div>
          <div class="settings-row">
            <span class="settings-key">version</span>
            <span class="settings-value">2.0.0</span>
          </div>
          <div class="settings-row">
            <span class="settings-key">api_url</span>
            <span class="settings-value" style="font-family:var(--font-display);font-size:12px">${Utils.esc(window.AGENTBOARD_API || '(relative)')}</span>
          </div>
        </div>
      </div>`;

    // Run all loads in parallel
    Promise.all([
      this._loadConnection(),
      this._loadBranding(),
      this._loadAgents(),
      this._loadEnvironments(),
      this._loadWebhooks(),
      this._loadAuditLog(),
    ]);

    // Auto-refresh audit log every 30s
    this._auditRefreshTimer = setInterval(() => this._loadAuditLog(), 30000);
  },

  async _loadConnection() {
    try {
      const res = await fetch((window.AGENTBOARD_API || '') + '/health');
      const ok = res.ok;
      document.getElementById('settingsConnection').innerHTML = `
        <div class="settings-row">
          <span class="settings-key">backend</span>
          <span class="settings-value ${ok ? 'settings-value--ok' : 'settings-value--err'}">${ok ? '● Connected' : '● Error'}</span>
        </div>
        <div class="settings-row">
          <span class="settings-key">websocket</span>
          <span class="settings-value ${WS.isConnected() ? 'settings-value--ok' : 'settings-value--err'}">${WS.isConnected() ? '● Connected' : '● Disconnected'}</span>
        </div>`;
    } catch (e) {
      const el = document.getElementById('settingsConnection');
      if (el) el.innerHTML = `
        <div class="settings-row">
          <span class="settings-key">backend</span>
          <span class="settings-value settings-value--err">● Error: ${Utils.esc(e.message)}</span>
        </div>`;
    }
  },

  async _loadBranding() {
    const el = document.getElementById('settingsBranding');
    if (!el) return;
    try {
      const b = await API.getBranding();
      if (!b || Object.keys(b).length === 0) {
        el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No branding configuration found in agents.yaml</div>`;
        return;
      }
      const rows = [
        ['team_name', b.team_name],
        ['accent_color', b.accent_color],
        ['theme', b.theme],
        ['logo_path', b.logo_path],
      ].filter(([, v]) => v !== undefined && v !== null && v !== '');

      if (rows.length === 0) {
        el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No branding configuration set</div>`;
        return;
      }

      el.innerHTML = rows.map(([key, val]) => `
        <div class="settings-row">
          <span class="settings-key">${Utils.esc(key)}</span>
          <span class="settings-value" style="display:flex;align-items:center;gap:8px">
            ${key === 'accent_color' && val
              ? `<span style="width:14px;height:14px;border-radius:3px;background:${Utils.esc(val)};display:inline-block;flex-shrink:0"></span>`
              : ''}
            ${key === 'logo_path' && val
              ? `<img src="${Utils.esc(val)}" style="height:20px;width:auto;border-radius:3px;margin-right:4px" alt="logo">`
              : ''}
            <span style="font-family:var(--font-display);font-size:12px">${Utils.esc(String(val))}</span>
          </span>
        </div>`).join('');
    } catch (e) {
      el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">Branding config unavailable (${Utils.esc(e.message)})</div>`;
    }
  },

  async _loadAgents() {
    try {
      const agents = await API.getAgents();
      const agentsEl = document.getElementById('settingsAgents');
      if (agentsEl) {
        if (agents.length === 0) {
          agentsEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No agents configured</div>`;
        } else {
          agentsEl.innerHTML = agents.map(a => `
            <div class="settings-row">
              <span class="settings-key" style="font-family:var(--font-body)">${Utils.esc(a.emoji || '🤖')} ${Utils.esc(a.name || a.id)}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="settings-value" style="font-size:12px;color:var(--text-tertiary)">${Utils.esc(a.team || '')}</span>
                <span class="status-dot status-dot--${Utils.statusClass(a.status)}"></span>
              </div>
            </div>`).join('');
        }
      }
    } catch (e) {
      const el = document.getElementById('settingsAgents');
      if (el) el.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:8px 0">${Utils.esc(e.message)}</div>`;
    }
  },

  async _loadEnvironments() {
    const el = document.getElementById('settingsEnvironments');
    if (!el) return;
    try {
      const envs = await API.getEnvironments();
      if (!envs || envs.length === 0) {
        el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No environments configured.</div>`;
        return;
      }
      el.innerHTML = envs.map(env => `
        <div class="settings-row" style="align-items:center">
          <div style="display:flex;align-items:center;gap:8px;flex:1">
            <span style="width:8px;height:8px;border-radius:50%;background:${env.active ? '#22c55e' : 'var(--border-default)'};flex-shrink:0"></span>
            <span class="settings-key" style="font-weight:${env.active ? '600' : '400'};color:${env.active ? 'var(--text-primary)' : 'var(--text-secondary)'}">${Utils.esc(env.name)}</span>
            <span style="font-family:var(--font-display);font-size:11px;color:var(--text-tertiary)">${Utils.esc(env.url)}</span>
            ${env.active ? `<span style="font-size:10px;background:rgba(34,197,94,0.15);color:#22c55e;border-radius:4px;padding:1px 6px;font-weight:600">active</span>` : ''}
          </div>
          <div style="display:flex;gap:4px">
            ${!env.active ? `<button class="btn-secondary" onclick="Pages.settings._switchEnv('${Utils.esc(env.url)}')" style="font-size:11px;padding:3px 8px">Switch</button>` : ''}
            <button class="btn-secondary" onclick="Pages.settings._deleteEnv('${Utils.esc(env.url)}')" style="font-size:11px;padding:3px 8px;color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)" title="Remove">🗑️</button>
          </div>
        </div>`).join('');
    } catch (e) {
      if (el) el.innerHTML = `<div style="color:var(--danger,#ef4444);font-size:13px;padding:8px 0">${Utils.esc(e.message)}</div>`;
    }
  },

  _openEnvForm() {
    const formEl = document.getElementById('envForm');
    if (!formEl) return;
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:16px;margin-top:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary)">Add Environment</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Name <span style="color:var(--danger,#ef4444)">*</span></label>
            <input id="envName" type="text" placeholder="Staging" style="width:100%;box-sizing:border-box;font-size:13px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">AgentBoard URL <span style="color:var(--danger,#ef4444)">*</span></label>
            <input id="envURL" type="url" placeholder="http://staging.example.com:8891" style="width:100%;box-sizing:border-box;font-size:13px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
          </div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn-secondary" onclick="Pages.settings._saveEnvForm()" style="font-size:13px;padding:6px 14px">Add</button>
            <button class="btn-secondary" onclick="Pages.settings._closeEnvForm()" style="font-size:13px;padding:6px 14px;color:var(--text-tertiary)">Cancel</button>
          </div>
        </div>
      </div>`;
  },

  _closeEnvForm() {
    const formEl = document.getElementById('envForm');
    if (formEl) { formEl.style.display = 'none'; formEl.innerHTML = ''; }
  },

  async _saveEnvForm() {
    const name = document.getElementById('envName')?.value?.trim() || '';
    const url  = document.getElementById('envURL')?.value?.trim() || '';
    if (!name || !url) { alert('Name and URL are required'); return; }
    try {
      await Env.addEnvironment(name, url);
      this._closeEnvForm();
      await this._loadEnvironments();
    } catch (e) {
      alert('Failed to add environment: ' + e.message);
    }
  },

  async _switchEnv(url) {
    try {
      await Env._switch(url);
      await this._loadEnvironments();
    } catch (e) {
      alert('Failed to switch environment: ' + e.message);
    }
  },

  async _deleteEnv(url) {
    if (!confirm('Remove this environment?')) return;
    try {
      await Env.deleteEnvironment(url);
      await this._loadEnvironments();
    } catch (e) {
      alert('Failed to remove environment: ' + e.message);
    }
  },

  async _loadWebhooks() {
    const el = document.getElementById('settingsWebhooks');
    if (!el) return;
    try {
      this._webhooks = await API.getWebhooks();
      this._renderWebhookList();
    } catch (e) {
      el.innerHTML = `<div style="color:var(--danger,#ef4444);font-size:13px;padding:8px 0">${Utils.esc(e.message)}</div>`;
    }
  },

  _renderWebhookList() {
    const el = document.getElementById('settingsWebhooks');
    if (!el) return;

    const ALL_EVENTS = ['agent_down', 'task_done', 'task_failed', 'agent_error', 'agent_paused', 'agent_killed'];

    if (!this._webhooks || this._webhooks.length === 0) {
      el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No webhooks configured. Add one to get notified of events.</div>`;
      return;
    }

    el.innerHTML = this._webhooks.map(wh => `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:10px 0;border-bottom:1px solid var(--border-default)" data-webhook-id="${Utils.esc(wh.id)}">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <span style="font-weight:600;font-size:13px;color:var(--text-primary)">${Utils.esc(wh.name || '(unnamed)')}</span>
            <span style="font-family:var(--font-display);font-size:11px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="${Utils.esc(wh.url)}">${Utils.esc(wh.url.length > 40 ? wh.url.slice(0, 40) + '…' : wh.url)}</span>
            <label class="settings-toggle" style="cursor:pointer;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary)">
              <input type="checkbox" ${wh.active ? 'checked' : ''} onchange="Pages.settings._toggleWebhook('${Utils.esc(wh.id)}', this.checked)" style="cursor:pointer">
              ${wh.active ? 'Active' : 'Inactive'}
            </label>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn-secondary" onclick="Pages.settings._testWebhook('${Utils.esc(wh.id)}')" style="font-size:11px;padding:3px 8px" title="Send test event">🔔 Test</button>
            <button class="btn-secondary" onclick="Pages.settings._openWebhookForm('${Utils.esc(wh.id)}')" style="font-size:11px;padding:3px 8px" title="Edit">✏️</button>
            <button class="btn-secondary" onclick="Pages.settings._deleteWebhook('${Utils.esc(wh.id)}')" style="font-size:11px;padding:3px 8px;color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)" title="Delete">🗑️</button>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${(wh.events || []).map(ev => `<span style="font-size:10px;background:var(--bg-elevated,#1e1e2e);border:1px solid var(--border-default);border-radius:4px;padding:2px 6px;color:var(--text-secondary)">${Utils.esc(ev)}</span>`).join('')}
        </div>
      </div>`).join('');
  },

  _openWebhookForm(editId) {
    this._editingWebhookId = editId || null;
    const formEl = document.getElementById('webhookForm');
    if (!formEl) return;

    const existing = editId ? this._webhooks.find(w => w.id === editId) : null;
    const ALL_EVENTS = ['agent_down', 'task_done', 'task_failed', 'agent_error', 'agent_paused', 'agent_killed'];

    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:16px;margin-top:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-primary)">${editId ? 'Edit Webhook' : 'New Webhook'}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Name</label>
            <input id="whName" type="text" value="${Utils.esc(existing ? existing.name || '' : '')}" placeholder="My Webhook" style="width:100%;box-sizing:border-box;font-size:13px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">URL <span style="color:var(--danger,#ef4444)">*</span></label>
            <input id="whURL" type="url" value="${Utils.esc(existing ? existing.url : '')}" placeholder="https://hooks.example.com/..." style="width:100%;box-sizing:border-box;font-size:13px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Events <span style="color:var(--danger,#ef4444)">*</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${ALL_EVENTS.map(ev => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;color:var(--text-secondary)">
                  <input type="checkbox" name="whEvents" value="${Utils.esc(ev)}" ${existing && existing.events && existing.events.includes(ev) ? 'checked' : ''}>
                  ${Utils.esc(ev)}
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Secret (optional — used for HMAC-SHA256 signature)</label>
            <input id="whSecret" type="text" value="" placeholder="leave blank to keep existing" style="width:100%;box-sizing:border-box;font-size:13px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
          </div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn-secondary" onclick="Pages.settings._saveWebhook()" style="font-size:13px;padding:6px 14px">${editId ? 'Save Changes' : 'Create Webhook'}</button>
            <button class="btn-secondary" onclick="Pages.settings._closeWebhookForm()" style="font-size:13px;padding:6px 14px;color:var(--text-tertiary)">Cancel</button>
          </div>
        </div>
      </div>`;
  },

  _closeWebhookForm() {
    const formEl = document.getElementById('webhookForm');
    if (formEl) { formEl.style.display = 'none'; formEl.innerHTML = ''; }
    this._editingWebhookId = null;
  },

  async _saveWebhook() {
    const name = document.getElementById('whName')?.value?.trim() || '';
    const url  = document.getElementById('whURL')?.value?.trim() || '';
    const secret = document.getElementById('whSecret')?.value?.trim() || '';
    const checkedBoxes = document.querySelectorAll('input[name="whEvents"]:checked');
    const events = Array.from(checkedBoxes).map(cb => cb.value);

    if (!url) { alert('URL is required'); return; }
    if (events.length === 0) { alert('Select at least one event'); return; }

    try {
      const payload = { name, url, events };
      if (secret) payload.secret = secret;

      if (this._editingWebhookId) {
        await API.updateWebhook(this._editingWebhookId, payload);
      } else {
        await API.createWebhook(payload);
      }
      this._closeWebhookForm();
      await this._loadWebhooks();
    } catch (e) {
      alert('Failed to save webhook: ' + e.message);
    }
  },

  async _toggleWebhook(id, active) {
    try {
      await API.updateWebhook(id, { active });
      const wh = this._webhooks.find(w => w.id === id);
      if (wh) wh.active = active;
    } catch (e) {
      alert('Failed to update webhook: ' + e.message);
      await this._loadWebhooks();
    }
  },

  async _deleteWebhook(id) {
    if (!confirm('Delete this webhook?')) return;
    try {
      await API.deleteWebhook(id);
      await this._loadWebhooks();
    } catch (e) {
      alert('Failed to delete webhook: ' + e.message);
    }
  },

  async _testWebhook(id) {
    const btn = document.querySelector(`[data-webhook-id="${id}"] button[onclick*="testWebhook"]`);
    if (btn) btn.textContent = '⏳';
    try {
      await API.testWebhook(id);
      alert('Test event sent! Check your webhook endpoint.');
    } catch (e) {
      alert('Failed to send test: ' + e.message);
    }
    if (btn) btn.textContent = '🔔 Test';
  },

  _onAuditFilterChange() {
    const sel = document.getElementById('auditActionFilter');
    this._auditActionFilter = sel ? sel.value : '';
    this._loadAuditLog();
  },

  async _loadAuditLog() {
    const el = document.getElementById('settingsAuditLog');
    if (!el) return;
    try {
      const params = { limit: 100 };
      if (this._auditActionFilter) params.action = this._auditActionFilter;
      const logs = await API.getAuditLog(params);
      this._renderAuditLog(el, logs);
    } catch (e) {
      el.innerHTML = `<div style="color:var(--danger,#ef4444);font-size:13px;padding:8px 0">${Utils.esc(e.message)}</div>`;
    }
  },

  _renderAuditLog(el, logs) {
    if (!logs || logs.length === 0) {
      el.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">No audit log entries yet. Actions like pause/resume/kill, webhook changes, and task transitions will appear here.</div>`;
      return;
    }

    const ACTION_COLORS = {
      agent_paused:        'var(--warning, #f59e0b)',
      agent_resumed:       'var(--success, #22c55e)',
      agent_killed:        'var(--danger, #ef4444)',
      task_transitioned:   'var(--accent, #6366f1)',
      webhook_created:     'var(--text-secondary)',
      webhook_deleted:     'var(--danger, #ef4444)',
      alert_rule_created:  'var(--text-secondary)',
      alert_rule_deleted:  'var(--danger, #ef4444)',
    };

    el.innerHTML = `
      <div style="overflow-x:auto;margin-top:4px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="color:var(--text-tertiary);text-align:left;border-bottom:1px solid var(--border-default)">
              <th style="padding:6px 8px;font-weight:600;white-space:nowrap">Timestamp</th>
              <th style="padding:6px 8px;font-weight:600">Action</th>
              <th style="padding:6px 8px;font-weight:600">Entity</th>
              <th style="padding:6px 8px;font-weight:600">ID</th>
              <th style="padding:6px 8px;font-weight:600">Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(entry => {
              const color = ACTION_COLORS[entry.action] || 'var(--text-secondary)';
              const ts = new Date(entry.timestamp);
              const tsStr = Utils.relTime ? Utils.relTime(entry.timestamp) : ts.toLocaleString();
              const tsAbs = Utils.absTime ? Utils.absTime(entry.timestamp) : ts.toISOString();
              const details = entry.details ? JSON.stringify(entry.details, null, 0).replace(/"/g, '').replace(/[{}]/g, '').replace(/,/g, ', ') : '';
              return `
                <tr style="border-bottom:1px solid var(--border-default);transition:background 0.1s" onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background=''">
                  <td style="padding:6px 8px;color:var(--text-tertiary);white-space:nowrap" title="${Utils.esc(tsAbs)}">${Utils.esc(tsStr)}</td>
                  <td style="padding:6px 8px;white-space:nowrap"><span style="color:${color};font-family:var(--font-display)">${Utils.esc(entry.action)}</span></td>
                  <td style="padding:6px 8px;color:var(--text-secondary)">${Utils.esc(entry.entity_type || '')}</td>
                  <td style="padding:6px 8px;color:var(--text-tertiary);font-family:var(--font-display);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.esc(entry.entity_id || '')}">${Utils.esc(entry.entity_id || '')}</td>
                  <td style="padding:6px 8px;color:var(--text-secondary);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.esc(details)}">${Utils.esc(details)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  destroy() {
    if (this._auditRefreshTimer) clearInterval(this._auditRefreshTimer);
    this._auditRefreshTimer = null;
  }
};
