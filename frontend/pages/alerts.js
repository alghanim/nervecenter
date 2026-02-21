/* AgentBoard — Alerts Page */
window.Pages = window.Pages || {};

Pages.alerts = (function () {
  let _container = null;
  let _tab = 'rules';
  let _pollInterval = null;

  const CONDITION_LABELS = {
    no_heartbeat: 'No Heartbeat',
    error_rate:   'Error Rate',
    task_stuck:   'Task Stuck',
  };

  const CONDITION_DESCRIPTIONS = {
    no_heartbeat: 'Agent inactive for N minutes',
    error_rate:   'More than N errors in 1 hour',
    task_stuck:   'Task in-progress for more than N minutes',
  };

  // ── Render ──────────────────────────────────────────────────────────────
  async function render(container, sub) {
    _container = container;
    _tab = sub === 'history' ? 'history' : 'rules';

    container.innerHTML = `
      <div class="alerts-page" style="padding:24px;max-width:1100px;">
        <div class="alerts-tabs" style="display:flex;gap:8px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0;">
          <button class="tab-btn ${_tab === 'rules' ? 'active' : ''}" data-tab="rules"
            style="padding:8px 20px;border:none;background:none;cursor:pointer;color:${_tab==='rules'?'var(--accent)':'var(--text-secondary)'};border-bottom:2px solid ${_tab==='rules'?'var(--accent)':'transparent'};font-size:14px;font-weight:600;transition:all 0.15s;">
            📋 Rules
          </button>
          <button class="tab-btn ${_tab === 'history' ? 'active' : ''}" data-tab="history"
            style="padding:8px 20px;border:none;background:none;cursor:pointer;color:${_tab==='history'?'var(--accent)':'var(--text-secondary)'};border-bottom:2px solid ${_tab==='history'?'var(--accent)':'transparent'};font-size:14px;font-weight:600;transition:all 0.15s;">
            🔔 History
          </button>
        </div>
        <div id="alerts-tab-content"></div>
      </div>
    `;

    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        container.querySelectorAll('.tab-btn').forEach(b => {
          b.style.color = 'var(--text-secondary)';
          b.style.borderBottom = '2px solid transparent';
        });
        btn.style.color = 'var(--accent)';
        btn.style.borderBottom = '2px solid var(--accent)';
        renderTab();
      });
    });

    renderTab();
    updateBadge();

    // Poll badge every 30s
    _pollInterval = setInterval(updateBadge, 30000);
  }

  async function renderTab() {
    const el = document.getElementById('alerts-tab-content');
    if (!el) return;
    el.innerHTML = `<div class="loading-state" style="padding:40px 0;"><div class="spinner"></div><span>Loading...</span></div>`;

    if (_tab === 'rules') {
      await renderRules(el);
    } else {
      await renderHistory(el);
    }
  }

  // ── Rules Tab ────────────────────────────────────────────────────────────
  async function renderRules(el) {
    let rules = [];
    let agents = [];
    try {
      [rules, agents] = await Promise.all([API.getAlertRules(), API.getAgents()]);
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load rules</div><div class="empty-state-desc">${Utils.esc(e.message)}</div></div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;">Alert Rules <span style="color:var(--text-secondary);font-weight:400;font-size:13px;">(${rules.length})</span></h3>
        <button id="btn-add-rule" class="btn btn-primary" style="display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Add Rule
        </button>
      </div>
      <div id="rules-list"></div>
    `;

    document.getElementById('btn-add-rule').addEventListener('click', () => showRuleModal(null, agents, () => renderTab()));
    renderRulesList(rules, agents);
  }

  function renderRulesList(rules, agents) {
    const list = document.getElementById('rules-list');
    if (!list) return;

    if (rules.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:60px 0;">
          <div class="empty-state-icon">🔔</div>
          <div class="empty-state-title">No alert rules</div>
          <div class="empty-state-desc">Create a rule to get notified when something goes wrong</div>
        </div>
      `;
      return;
    }

    const agentMap = {};
    (agents || []).forEach(a => { agentMap[a.id] = a; });

    list.innerHTML = rules.map(rule => {
      const agent = rule.agent_id ? (agentMap[rule.agent_id] || { display_name: rule.agent_id }) : null;
      const agentLabel = agent ? `${agent.emoji || '🤖'} ${agent.display_name || rule.agent_id}` : 'All Agents';
      const condLabel = CONDITION_LABELS[rule.condition_type] || rule.condition_type;
      const thresholdUnit = rule.condition_type === 'error_rate' ? 'errors/hr' : 'min';

      return `
        <div class="rule-card" data-id="${Utils.esc(rule.id)}" style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:16px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${Utils.esc(rule.name)}</div>
            <div style="font-size:12px;color:var(--text-secondary);display:flex;gap:12px;flex-wrap:wrap;">
              <span>🎯 ${Utils.esc(agentLabel)}</span>
              <span>⚡ ${Utils.esc(condLabel)}</span>
              <span>📊 Threshold: ${rule.threshold} ${thresholdUnit}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <label class="toggle-switch" title="${rule.enabled ? 'Enabled' : 'Disabled'}" style="cursor:pointer;">
              <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-action="toggle" data-id="${Utils.esc(rule.id)}" style="display:none;">
              <span class="toggle-track" style="display:inline-block;width:36px;height:20px;border-radius:10px;background:${rule.enabled ? 'var(--accent)' : 'var(--border)'};position:relative;transition:background 0.15s;">
                <span style="position:absolute;top:3px;left:${rule.enabled ? '19px' : '3px'};width:14px;height:14px;border-radius:50%;background:#fff;transition:left 0.15s;"></span>
              </span>
            </label>
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${Utils.esc(rule.id)}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 2l2 2-7.5 7.5L2 12l.5-2.5L10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${Utils.esc(rule.id)}" title="Delete" style="color:var(--red,#ef4444);">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="1,3 13,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 3V1.5h4V3M2.5 3l1 9.5h7L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind actions
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const rule = rules.find(r => r.id === id);

      if (action === 'edit') {
        showRuleModal(rule, agents, () => renderTab());
      } else if (action === 'delete') {
        if (!confirm(`Delete rule "${rule.name}"?`)) return;
        try {
          await API.deleteAlertRule(id);
          renderTab();
        } catch (e) {
          alert('Delete failed: ' + e.message);
        }
      }
    });

    // Toggle handlers
    list.querySelectorAll('[data-action="toggle"]').forEach(checkbox => {
      checkbox.addEventListener('change', async () => {
        const id = checkbox.dataset.id;
        const rule = rules.find(r => r.id === id);
        try {
          await API.updateAlertRule(id, { enabled: checkbox.checked });
          // Update visual
          const track = checkbox.parentElement.querySelector('.toggle-track');
          const knob = track.querySelector('span');
          track.style.background = checkbox.checked ? 'var(--accent)' : 'var(--border)';
          knob.style.left = checkbox.checked ? '19px' : '3px';
        } catch (e) {
          checkbox.checked = !checkbox.checked;
          alert('Update failed: ' + e.message);
        }
      });
    });
  }

  // ── Rule Modal ───────────────────────────────────────────────────────────
  function showRuleModal(rule, agents, onSave) {
    const isEdit = !!rule;
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;`;

    const agentOptions = agents.map(a =>
      `<option value="${Utils.esc(a.id)}" ${rule && rule.agent_id === a.id ? 'selected' : ''}>
        ${Utils.esc(a.emoji || '🤖')} ${Utils.esc(a.display_name || a.id)}
      </option>`
    ).join('');

    modal.innerHTML = `
      <div style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border);border-radius:12px;padding:28px;width:480px;max-width:95vw;">
        <h3 style="margin:0 0 20px;font-size:16px;font-weight:700;">${isEdit ? 'Edit Alert Rule' : 'New Alert Rule'}</h3>
        <form id="rule-form">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">RULE NAME</label>
            <input name="name" value="${Utils.esc(rule?.name || '')}" required placeholder="e.g. Forge heartbeat check"
              style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,#111);color:var(--text);font-size:14px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">AGENT (leave blank for all)</label>
            <select name="agent_id"
              style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,#111);color:var(--text);font-size:14px;box-sizing:border-box;">
              <option value="">— All Agents —</option>
              ${agentOptions}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">CONDITION TYPE</label>
            <select name="condition_type"
              style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,#111);color:var(--text);font-size:14px;box-sizing:border-box;">
              <option value="no_heartbeat" ${rule?.condition_type === 'no_heartbeat' ? 'selected' : ''}>No Heartbeat — inactive for N minutes</option>
              <option value="error_rate"   ${rule?.condition_type === 'error_rate'   ? 'selected' : ''}>Error Rate — &gt;N errors in last hour</option>
              <option value="task_stuck"   ${rule?.condition_type === 'task_stuck'   ? 'selected' : ''}>Task Stuck — in-progress for &gt;N minutes</option>
            </select>
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">THRESHOLD</label>
            <input name="threshold" type="number" min="1" value="${rule?.threshold ?? 30}" required
              style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,#111);color:var(--text);font-size:14px;box-sizing:border-box;">
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Minutes (or errors for error_rate)</div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="modal-cancel" class="btn btn-ghost">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Rule'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#modal-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        name: fd.get('name'),
        condition_type: fd.get('condition_type'),
        threshold: parseInt(fd.get('threshold')),
        agent_id: fd.get('agent_id') || null,
        enabled: rule?.enabled ?? true,
      };

      try {
        if (isEdit) {
          await API.updateAlertRule(rule.id, data);
        } else {
          await API.createAlertRule(data);
        }
        modal.remove();
        onSave();
      } catch (err) {
        alert('Failed to save rule: ' + err.message);
      }
    });
  }

  // ── History Tab ──────────────────────────────────────────────────────────
  async function renderHistory(el) {
    let history = [];
    try {
      history = await API.getAlertHistory();
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load history</div></div>`;
      return;
    }

    const unacked = history.filter(h => !h.acknowledged).length;

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;">
          Alert History
          ${unacked > 0 ? `<span style="background:var(--red,#ef4444);color:#fff;border-radius:9px;font-size:12px;padding:2px 8px;margin-left:8px;">${unacked} new</span>` : ''}
        </h3>
        <div style="display:flex;gap:8px;">
          <button id="btn-filter-all" class="btn btn-ghost btn-sm" style="font-size:12px;">All</button>
          <button id="btn-filter-unacked" class="btn btn-ghost btn-sm" style="font-size:12px;">Unacknowledged</button>
        </div>
      </div>
      <div id="history-list"></div>
    `;

    let showAll = true;
    const renderList = () => {
      const items = showAll ? history : history.filter(h => !h.acknowledged);
      renderHistoryList(items);
    };

    document.getElementById('btn-filter-all').addEventListener('click', () => { showAll = true; renderList(); });
    document.getElementById('btn-filter-unacked').addEventListener('click', () => { showAll = false; renderList(); });

    renderList();

    // Bind ack on delegation
    document.getElementById('history-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-ack]');
      if (!btn) return;
      const id = btn.dataset.ack;
      try {
        await API.acknowledgeAlert(id);
        const item = history.find(h => h.id === id);
        if (item) item.acknowledged = true;
        renderList();
        updateBadge();
      } catch (err) {
        alert('Ack failed: ' + err.message);
      }
    });
  }

  function renderHistoryList(items) {
    const list = document.getElementById('history-list');
    if (!list) return;

    if (items.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:60px 0;">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">No alerts</div>
          <div class="empty-state-desc">All clear — no alerts to show</div>
        </div>
      `;
      return;
    }

    list.innerHTML = items.map(h => {
      const time = new Date(h.triggered_at).toLocaleString();
      const agentLabel = h.agent_id || 'System';
      const ackBadge = h.acknowledged
        ? `<span style="font-size:11px;background:var(--bg-secondary,#111);color:var(--text-secondary);padding:2px 8px;border-radius:4px;">Acknowledged</span>`
        : `<button class="btn btn-ghost btn-sm" data-ack="${Utils.esc(h.id)}" style="font-size:11px;color:var(--accent);">Acknowledge</button>`;

      return `
        <div style="background:var(--card-bg);border:1px solid ${h.acknowledged ? 'var(--border)' : 'var(--accent)'};border-radius:8px;padding:14px 16px;margin-bottom:10px;${h.acknowledged ? 'opacity:0.7;' : ''}">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:20px;flex-shrink:0;">${h.acknowledged ? '✅' : '🔔'}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${Utils.esc(h.rule_name || 'Alert')}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;word-break:break-word;">${Utils.esc(h.message || '')}</div>
              <div style="font-size:11px;color:var(--text-secondary);display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                <span>🤖 ${Utils.esc(agentLabel)}</span>
                <span>🕐 ${time}</span>
                ${ackBadge}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Badge Update ─────────────────────────────────────────────────────────
  async function updateBadge() {
    try {
      const data = await API.getAlertUnacknowledgedCount();
      const badge = document.getElementById('alerts-badge');
      if (!badge) return;
      if (data.count > 0) {
        badge.textContent = data.count;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    } catch (_) {}
  }

  // ── Destroy ──────────────────────────────────────────────────────────────
  function destroy() {
    if (_pollInterval) clearInterval(_pollInterval);
    _container = null;
  }

  return { render, destroy };
})();
