/* AgentBoard — Settings Page */

window.Pages = window.Pages || {};

Pages.settings = {
  async render(container) {
    container.innerHTML = `
      <div style="max-width:640px">
        <div class="settings-section">
          <div class="settings-section-title">Connection</div>
          <div id="settingsConnection">
            <div class="loading-state"><div class="spinner"></div><span>Checking...</span></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Agents</div>
          <div id="settingsAgents">
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
            <span class="settings-value">1.0.0</span>
          </div>
          <div class="settings-row">
            <span class="settings-key">api_url</span>
            <span class="settings-value" style="font-family:var(--font-display);font-size:12px">${Utils.esc(window.AGENTBOARD_API || '(relative)')}</span>
          </div>
        </div>
      </div>`;

    // Check health
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
      document.getElementById('settingsConnection').innerHTML = `
        <div class="settings-row">
          <span class="settings-key">backend</span>
          <span class="settings-value settings-value--err">● Error: ${Utils.esc(e.message)}</span>
        </div>`;
    }

    // Load agents
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
      if (el) el.innerHTML = `<div style="color:var(--status-error);font-size:13px;padding:8px 0">${Utils.esc(e.message)}</div>`;
    }
  },

  destroy() {}
};
