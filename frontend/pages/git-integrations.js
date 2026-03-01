/* NerveCenter — Git Integrations Settings Page */
window.Pages = window.Pages || {};
Pages.gitIntegrations = {
  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h1>Git Integrations</h1>
        <button class="btn btn-primary" id="addIntegrationBtn">+ Add Integration</button>
      </div>
      <div id="integrationsList" class="card-grid"></div>
      <div id="addIntegrationModal" class="modal hidden">
        <div class="modal-content">
          <h2>Add Git Integration</h2>
          <div class="form-group"><label>Provider</label>
            <select id="gitProvider" class="input"><option value="github">GitHub</option><option value="gitlab">GitLab</option></select>
          </div>
          <div class="form-group"><label>Repository URL</label>
            <input id="gitRepoUrl" class="input" placeholder="https://github.com/owner/repo" />
          </div>
          <div class="form-group"><label>Personal Access Token (optional)</label>
            <input id="gitToken" class="input" type="password" placeholder="ghp_..." />
          </div>
          <div class="form-group"><label>Webhook Secret (optional)</label>
            <input id="gitWebhookSecret" class="input" placeholder="your-secret" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancelIntegration">Cancel</button>
            <button class="btn btn-primary" id="saveIntegration">Save</button>
          </div>
        </div>
      </div>`;

    const list = document.getElementById('integrationsList');
    const modal = document.getElementById('addIntegrationModal');

    document.getElementById('addIntegrationBtn').onclick = () => modal.classList.remove('hidden');
    document.getElementById('cancelIntegration').onclick = () => modal.classList.add('hidden');

    document.getElementById('saveIntegration').onclick = async () => {
      const data = {
        provider: document.getElementById('gitProvider').value,
        repo_url: document.getElementById('gitRepoUrl').value,
        token: document.getElementById('gitToken').value,
        webhook_secret: document.getElementById('gitWebhookSecret').value,
      };
      await apiFetch('/api/integrations/git', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
      });
      modal.classList.add('hidden');
      loadIntegrations();
    };

    async function loadIntegrations() {
      const integrations = await apiFetch('/api/integrations/git');
      if (!integrations.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-title">No integrations</div><div class="empty-state-desc">Add a GitHub or GitLab repo to link PRs to tasks</div></div>';
        return;
      }
      list.innerHTML = integrations.map(g => `
        <div class="card">
          <div class="card-header">
            <span class="badge badge-info">${Utils.esc(g.provider)}</span>
            <button class="btn btn-ghost btn-sm" data-delete="${g.id}" title="Delete">🗑️</button>
          </div>
          <div class="card-body">
            <a href="${Utils.esc(g.repo_url)}" target="_blank" rel="noopener">${Utils.esc(g.repo_url)}</a>
            <div class="text-muted" style="margin-top:4px">Added ${new Date(g.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
          if (confirm('Delete this integration?')) {
            await apiFetch('/api/integrations/git/' + btn.dataset.delete, { method: 'DELETE' });
            loadIntegrations();
          }
        };
      });
    }
    loadIntegrations();
  }
};
