/* AgentBoard — Alerts Page */

window.Pages = window.Pages || {};

Pages.alerts = {
  _rules: [],
  _history: [],
  _agents: [],
  _webhooks: [],
  _showForm: false,
  _refreshTimer: null,
  _tab: 'rules', // 'rules' | 'history'

  async render(container) {
    container.innerHTML = `
      <div class="alerts-page">

        <!-- Tab Bar -->
        <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0">
          <button id="alertsTabRules"
            onclick="Pages.alerts._switchTab('rules')"
            style="padding:8px 16px;background:none;border:none;border-bottom:2px solid var(--accent);color:var(--text-primary);cursor:pointer;font-size:13px;font-weight:600;margin-bottom:-1px">
            Rules
          </button>
          <button id="alertsTabHistory"
            onclick="Pages.alerts._switchTab('history')"
            style="padding:8px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-tertiary);cursor:pointer;font-size:13px;font-weight:500;margin-bottom:-1px">
            Fired Alerts <span id="alertsUnackBadge" style="display:none;background:var(--red,#ef4444);color:#fff;border-radius:9px;font-size:10px;padding:1px 6px;margin-left:4px;font-weight:700"></span>
          </button>
        </div>

        <!-- Rules Tab -->
        <div id="alertsRulesTab">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <span style="color:var(--text-secondary);font-size:13px">
              Alert rules run every 60 seconds and fire when conditions are met.
            </span>
            <button class="btn-primary" onclick="Pages.alerts._openForm()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:6px" aria-hidden="true">
                <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              New Rule
            </button>
          </div>

          <!-- Create Form (hidden by default) -->
          <div id="alertsFormWrap" style="display:none;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:20px">
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:16px">Create Alert Rule</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" id="alertsFormGrid">

              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Rule Name *</label>
                <input class="input" id="alertFormName" type="text" placeholder="e.g. Titan no heartbeat" style="width:100%;box-sizing:border-box">
              </div>

              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Agent</label>
                <select class="select" id="alertFormAgent" style="width:100%;box-sizing:border-box">
                  <option value="">All agents</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Condition *</label>
                <select class="select" id="alertFormCondition" onchange="Pages.alerts._onConditionChange()" style="width:100%;box-sizing:border-box">
                  <option value="no_heartbeat">No Heartbeat</option>
                  <option value="task_stuck">Task Stuck</option>
                  <option value="error_rate">High Error Rate</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px" id="alertFormThresholdLabel">Threshold (minutes)</label>
                <input class="input" id="alertFormThreshold" type="number" min="1" value="30" style="width:100%;box-sizing:border-box">
              </div>

              <div style="grid-column:1/-1">
                <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Notify via Webhook</label>
                <select class="select" id="alertFormWebhook" style="width:100%;box-sizing:border-box">
                  <option value="">None</option>
                </select>
              </div>

            </div>
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
              <button class="btn-secondary" onclick="Pages.alerts._closeForm()">Cancel</button>
              <button class="btn-primary" id="alertsFormSaveBtn" onclick="Pages.alerts._saveRule()">Create Rule</button>
            </div>
            <div id="alertsFormError" style="display:none;color:var(--red,#ef4444);font-size:12px;margin-top:8px"></div>
          </div>

          <!-- Rules List -->
          <div id="alertsRulesList">
            <div class="loading-state"><div class="spinner"></div><span>Loading rules...</span></div>
          </div>
        </div>

        <!-- History Tab -->
        <div id="alertsHistoryTab" style="display:none">
          <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
            <button class="btn-secondary" onclick="Pages.alerts._refreshHistory()" id="alertsHistRefreshBtn">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:4px" aria-hidden="true">
                <path d="M13 2v4H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M1 12v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11.6 5A6 6 0 1 0 12 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Refresh
            </button>
            <button class="btn-secondary" onclick="Pages.alerts._refreshHistory(true)" style="font-size:12px">
              Unacknowledged only
            </button>
            <button class="btn-secondary" onclick="Pages.alerts._refreshHistory(false)" style="font-size:12px">
              All
            </button>
            <span id="alertsHistTs" style="color:var(--text-tertiary);font-size:12px;margin-left:4px"></span>
          </div>
          <div id="alertsHistList">
            <div class="loading-state"><div class="spinner"></div><span>Loading fired alerts...</span></div>
          </div>
        </div>

      </div>`;

    // Load data in parallel
    await Promise.all([
      this._loadAgents(),
      this._loadWebhooks(),
      this._loadRules(),
      this._loadUnackCount(),
    ]);

    // Auto-refresh every 60s
    this._refreshTimer = setInterval(() => {
      if (this._tab === 'rules') {
        this._loadRules(true);
      } else {
        this._refreshHistory(this._histUnackOnly);
      }
      this._loadUnackCount();
    }, 60000);
  },

  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  _switchTab(tab) {
    this._tab = tab;
    const rulesTab = document.getElementById('alertsRulesTab');
    const histTab = document.getElementById('alertsHistoryTab');
    const btnRules = document.getElementById('alertsTabRules');
    const btnHist = document.getElementById('alertsTabHistory');

    if (tab === 'rules') {
      rulesTab.style.display = '';
      histTab.style.display = 'none';
      btnRules.style.borderBottomColor = 'var(--accent)';
      btnRules.style.color = 'var(--text-primary)';
      btnRules.style.fontWeight = '600';
      btnHist.style.borderBottomColor = 'transparent';
      btnHist.style.color = 'var(--text-tertiary)';
      btnHist.style.fontWeight = '500';
    } else {
      rulesTab.style.display = 'none';
      histTab.style.display = '';
      btnRules.style.borderBottomColor = 'transparent';
      btnRules.style.color = 'var(--text-tertiary)';
      btnRules.style.fontWeight = '500';
      btnHist.style.borderBottomColor = 'var(--accent)';
      btnHist.style.color = 'var(--text-primary)';
      btnHist.style.fontWeight = '600';
      this._refreshHistory();
    }
  },

  // ── Data Loading ────────────────────────────────────────────

  async _loadAgents() {
    try {
      const agents = await apiFetch('/api/agents');
      this._agents = agents || [];
      const sel = document.getElementById('alertFormAgent');
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      for (const a of this._agents) {
        const opt = document.createElement('option');
        opt.value = a.id || a.name;
        opt.textContent = a.name || a.id;
        sel.appendChild(opt);
      }
    } catch (_) {}
  },

  async _loadWebhooks() {
    try {
      this._webhooks = await apiFetch('/api/webhooks') || [];
      const sel = document.getElementById('alertFormWebhook');
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      for (const wh of this._webhooks) {
        const opt = document.createElement('option');
        opt.value = wh.id;
        opt.textContent = wh.name || wh.url;
        sel.appendChild(opt);
      }
    } catch (_) {}
  },

  async _loadRules(silent = false) {
    if (!silent) {
      const el = document.getElementById('alertsRulesList');
      if (el) el.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Loading rules...</span></div>`;
    }
    try {
      this._rules = await apiFetch('/api/alerts/rules') || [];
      this._renderRules();
    } catch (e) {
      const el = document.getElementById('alertsRulesList');
      if (el) el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 8L43 40H5L24 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="24" y1="22" x2="24" y2="32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="37" r="1.5" fill="currentColor"/></svg></div>
        <div class="empty-state-title">Failed to load rules</div>
        <div class="empty-state-desc">${Utils.esc(e.message)}</div>
      </div>`;
    }
  },

  async _loadUnackCount() {
    try {
      const data = await apiFetch('/api/alerts/unacknowledged-count');
      const count = data.count || 0;
      // Update badge in sidebar nav
      const badge = document.getElementById('alerts-badge');
      if (badge) {
        badge.style.display = count > 0 ? '' : 'none';
        badge.textContent = count > 99 ? '99+' : count;
      }
      // Update in-page badge
      const tabBadge = document.getElementById('alertsUnackBadge');
      if (tabBadge) {
        tabBadge.style.display = count > 0 ? '' : 'none';
        tabBadge.textContent = count;
      }
    } catch (_) {}
  },

  _histUnackOnly: false,

  async _refreshHistory(unackOnly) {
    if (typeof unackOnly === 'boolean') this._histUnackOnly = unackOnly;
    const btn = document.getElementById('alertsHistRefreshBtn');
    if (btn) btn.disabled = true;
    try {
      const qs = this._histUnackOnly ? '?acknowledged=false' : '';
      this._history = await apiFetch('/api/alerts/history' + qs) || [];
      this._renderHistory();
      const ts = document.getElementById('alertsHistTs');
      if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (e) {
      const el = document.getElementById('alertsHistList');
      if (el) el.innerHTML = `<div class="empty-state">
        <div class="empty-state-title">Failed to load history</div>
        <div class="empty-state-desc">${Utils.esc(e.message)}</div>
      </div>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ── Render ───────────────────────────────────────────────────

  _renderRules() {
    const el = document.getElementById('alertsRulesList');
    if (!el) return;
    if (!this._rules.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M24 6a12 12 0 0 1 12 12c0 8 3 11 3 11H9s3-3 3-11A12 12 0 0 1 24 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19 41a5 5 0 0 0 10 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="empty-state-title">No alert rules yet</div>
          <div class="empty-state-desc">Click "New Rule" to create your first alert.</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Name</th>
            <th>Condition</th>
            <th>Agent</th>
            <th>Threshold</th>
            <th>Webhook</th>
            <th>Status</th>
            <th style="width:80px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this._rules.map(r => this._ruleRow(r)).join('')}
        </tbody>
      </table>`;
  },

  _ruleRow(r) {
    const condLabels = {
      no_heartbeat: 'No Heartbeat',
      task_stuck: 'Task Stuck',
      error_rate: 'High Error Rate',
    };
    const condUnits = {
      no_heartbeat: 'min',
      task_stuck: 'min',
      error_rate: 'errors/hr',
    };
    const statusColor = r.enabled ? 'var(--green,#22c55e)' : 'var(--text-tertiary)';
    const statusText = r.enabled ? '● Active' : '○ Disabled';

    // Find webhook name
    let webhookName = '—';
    if (r.notify_webhook_id) {
      const wh = this._webhooks.find(w => w.id === r.notify_webhook_id);
      webhookName = wh ? Utils.esc(wh.name || wh.url) : '<span style="color:var(--text-tertiary)">Unknown</span>';
    }

    return `<tr>
      <td style="font-weight:500">${Utils.esc(r.name)}</td>
      <td><span class="badge badge--neutral">${Utils.esc(condLabels[r.condition_type] || r.condition_type)}</span></td>
      <td style="color:var(--text-secondary)">${r.agent_id ? Utils.esc(r.agent_id) : '<span style="color:var(--text-tertiary)">All</span>'}</td>
      <td>${r.threshold} <span style="color:var(--text-tertiary);font-size:12px">${condUnits[r.condition_type] || ''}</span></td>
      <td style="font-size:12px;color:var(--text-secondary)">${webhookName}</td>
      <td style="color:${statusColor};font-size:12px;font-weight:600">${statusText}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" title="${r.enabled ? 'Disable' : 'Enable'}"
            onclick="Pages.alerts._toggleRule('${Utils.esc(r.id)}', ${!r.enabled})"
            style="color:${r.enabled ? 'var(--accent)' : 'var(--text-tertiary)'}">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              ${r.enabled
                ? '<rect x="2" y="4" width="4" height="6" rx="1" fill="currentColor"/><rect x="8" y="4" width="4" height="6" rx="1" fill="currentColor"/>'
                : '<polygon points="3,2 11,7 3,12" fill="currentColor"/>'}
            </svg>
          </button>
          <button class="btn-icon" title="Delete rule"
            onclick="Pages.alerts._deleteRule('${Utils.esc(r.id)}', '${Utils.esc(r.name)}')"
            style="color:var(--text-tertiary)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <polyline points="2,3.5 12,3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M5 3.5V2h4v1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M3.5 3.5l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>`;
  },

  _renderHistory() {
    const el = document.getElementById('alertsHistList');
    if (!el) return;
    if (!this._history.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2"/>
              <path d="M24 14v12l6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-state-title">No alerts fired</div>
          <div class="empty-state-desc">${this._histUnackOnly ? 'No unacknowledged alerts.' : 'All quiet — no alerts triggered yet.'}</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Time</th>
            <th>Rule</th>
            <th>Agent</th>
            <th>Message</th>
            <th>Status</th>
            <th style="width:60px"></th>
          </tr>
        </thead>
        <tbody>
          ${this._history.slice(0, 50).map(h => this._histRow(h)).join('')}
        </tbody>
      </table>`;
  },

  _histRow(h) {
    const ts = new Date(h.triggered_at);
    const timeStr = ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusColor = h.acknowledged ? 'var(--text-tertiary)' : 'var(--yellow,#f59e0b)';
    const statusText = h.acknowledged ? '✓ Acked' : '⚠ Active';

    return `<tr style="${h.acknowledged ? 'opacity:0.65' : ''}">
      <td style="font-family:var(--font-display);font-size:11px;color:var(--text-secondary);white-space:nowrap">${Utils.esc(timeStr)}</td>
      <td style="font-weight:500;font-size:12px">${Utils.esc(h.rule_name || '—')}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${h.agent_id ? Utils.esc(h.agent_id) : '—'}</td>
      <td style="font-size:12px;color:var(--text-secondary);max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${Utils.esc(h.message)}">${Utils.esc(h.message || '—')}</td>
      <td style="color:${statusColor};font-size:11px;font-weight:600;white-space:nowrap">${statusText}</td>
      <td>
        ${!h.acknowledged ? `<button class="btn-secondary" style="font-size:11px;padding:2px 8px" onclick="Pages.alerts._ackAlert('${Utils.esc(h.id)}')">Ack</button>` : ''}
      </td>
    </tr>`;
  },

  // ── Form ─────────────────────────────────────────────────────

  _openForm() {
    this._showForm = true;
    const wrap = document.getElementById('alertsFormWrap');
    if (wrap) wrap.style.display = '';
    const errEl = document.getElementById('alertsFormError');
    if (errEl) errEl.style.display = 'none';
    this._onConditionChange();
  },

  _closeForm() {
    this._showForm = false;
    const wrap = document.getElementById('alertsFormWrap');
    if (wrap) wrap.style.display = 'none';
    // Reset form fields
    const fields = ['alertFormName', 'alertFormAgent', 'alertFormCondition', 'alertFormThreshold', 'alertFormWebhook'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else if (el.type === 'number') el.value = '30';
      else el.value = '';
    });
  },

  _onConditionChange() {
    const cond = document.getElementById('alertFormCondition');
    const label = document.getElementById('alertFormThresholdLabel');
    const input = document.getElementById('alertFormThreshold');
    if (!cond || !label || !input) return;

    switch (cond.value) {
      case 'no_heartbeat':
        label.textContent = 'Threshold (minutes without heartbeat)';
        input.value = input.value || '10';
        input.min = '1';
        break;
      case 'task_stuck':
        label.textContent = 'Threshold (minutes task in-progress)';
        input.value = input.value || '60';
        input.min = '1';
        break;
      case 'error_rate':
        label.textContent = 'Threshold (error count per hour)';
        input.value = input.value || '5';
        input.min = '1';
        break;
    }
  },

  async _saveRule() {
    const name = (document.getElementById('alertFormName')?.value || '').trim();
    const agentId = document.getElementById('alertFormAgent')?.value || '';
    const condType = document.getElementById('alertFormCondition')?.value || '';
    const threshold = parseInt(document.getElementById('alertFormThreshold')?.value || '30', 10);
    const webhookId = document.getElementById('alertFormWebhook')?.value || '';

    const errEl = document.getElementById('alertsFormError');
    const saveBtn = document.getElementById('alertsFormSaveBtn');

    if (!name || !condType) {
      if (errEl) { errEl.textContent = 'Name and Condition are required.'; errEl.style.display = ''; }
      return;
    }
    if (isNaN(threshold) || threshold < 1) {
      if (errEl) { errEl.textContent = 'Threshold must be a positive number.'; errEl.style.display = ''; }
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    if (errEl) errEl.style.display = 'none';

    try {
      const body = {
        name,
        condition_type: condType,
        threshold,
        enabled: true,
      };
      if (agentId) body.agent_id = agentId;
      if (webhookId) body.notify_webhook_id = webhookId;

      await apiFetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      this._closeForm();
      await this._loadRules();
    } catch (e) {
      if (errEl) {
        errEl.textContent = 'Failed to create rule: ' + e.message;
        errEl.style.display = '';
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  // ── Actions ──────────────────────────────────────────────────

  async _toggleRule(id, enable) {
    try {
      await apiFetch(`/api/alerts/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      await this._loadRules(true);
    } catch (e) {
      alert('Failed to update rule: ' + e.message);
    }
  },

  async _deleteRule(id, name) {
    if (!confirm(`Delete alert rule "${name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/alerts/rules/${id}`, { method: 'DELETE' });
      await this._loadRules(true);
    } catch (e) {
      alert('Failed to delete rule: ' + e.message);
    }
  },

  async _ackAlert(id) {
    try {
      await apiFetch(`/api/alerts/history/${id}/acknowledge`, { method: 'POST' });
      // Re-render in place
      const h = this._history.find(x => x.id === id);
      if (h) h.acknowledged = true;
      this._renderHistory();
      this._loadUnackCount();
    } catch (e) {
      alert('Failed to acknowledge alert: ' + e.message);
    }
  },
};
