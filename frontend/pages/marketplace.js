/* AgentBoard — Marketplace Page */

window.Pages = window.Pages || {};

Pages.marketplace = {
  _templates: [],
  _filtered: [],
  _activeCategory: 'all',
  _searchQuery: '',
  _slideoverOpen: false,
  _currentTemplate: null,
  _styleInjected: false,
  _keyHandler: null,

  async render(container) {
    if (!this._styleInjected) {
      this._injectStyles();
      this._styleInjected = true;
    }

    container.innerHTML = `
      <div class="mp-wrapper">
        <!-- Filter Bar -->
        <div class="mp-filter-bar">
          <div class="mp-pills" id="mpPills">
            <button class="mp-pill active" data-cat="all">All</button>
            <button class="mp-pill" data-cat="productivity">Productivity</button>
            <button class="mp-pill" data-cat="devops">DevOps</button>
            <button class="mp-pill" data-cat="data">Data</button>
            <button class="mp-pill" data-cat="support">Support</button>
          </div>
          <div class="mp-search-wrap">
            <svg class="mp-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="6.5" cy="6.5" r="4"/>
              <line x1="10" y1="10" x2="14" y2="14" stroke-linecap="round"/>
            </svg>
            <input class="mp-search" id="mpSearch" type="text" placeholder="Search templates…" autocomplete="off">
          </div>
        </div>

        <!-- Grid -->
        <div class="mp-grid" id="mpGrid">
          <div class="loading-state"><div class="spinner"></div><span>Loading templates…</span></div>
        </div>
      </div>

      <!-- Slide-over Backdrop -->
      <div class="mp-backdrop" id="mpBackdrop"></div>

      <!-- Slide-over Panel -->
      <aside class="mp-slideover" id="mpSlideover" role="dialog" aria-modal="true" aria-label="Template details">
        <div class="mp-slideover-inner" id="mpSlideoverInner"></div>
      </aside>
    `;

    // Bind filter pills
    document.getElementById('mpPills').addEventListener('click', (e) => {
      const btn = e.target.closest('.mp-pill');
      if (!btn) return;
      document.querySelectorAll('.mp-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      this._activeCategory = btn.dataset.cat;
      this._applyFilters();
    });

    // Bind search
    document.getElementById('mpSearch').addEventListener('input', (e) => {
      this._searchQuery = e.target.value.trim().toLowerCase();
      this._applyFilters();
    });

    // Backdrop click closes panel
    document.getElementById('mpBackdrop').addEventListener('click', () => this._closePanel());

    // Keyboard handler
    this._keyHandler = (e) => {
      if (e.key === 'Escape' && this._slideoverOpen) this._closePanel();
    };
    document.addEventListener('keydown', this._keyHandler);

    // Load templates
    try {
      this._templates = await apiFetch('/api/marketplace/templates');
      this._filtered = [...this._templates];
      this._renderGrid();
    } catch (e) {
      const grid = document.getElementById('mpGrid');
      if (grid) Utils.showEmpty(grid, '⚠️', 'Failed to load templates', e.message);
    }
  },

  destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    // Remove any lingering toasts
    document.querySelectorAll('.mp-toast').forEach(t => t.remove());
  },

  _applyFilters() {
    const cat = this._activeCategory;
    const q = this._searchQuery;
    this._filtered = this._templates.filter(t => {
      const matchCat = cat === 'all' || (t.category || '').toLowerCase() === cat;
      const matchQ = !q ||
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.author || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
    this._renderGrid();
  },

  _renderGrid() {
    const grid = document.getElementById('mpGrid');
    if (!grid) return;

    if (this._filtered.length === 0) {
      Utils.showEmpty(grid, '🏪', 'No templates found', 'Try a different category or search term.');
      return;
    }

    grid.innerHTML = this._filtered.map(t => this._cardHTML(t)).join('');

    // Bind card clicks
    grid.querySelectorAll('.mp-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const tpl = this._templates.find(t => String(t.id) === String(id));
        if (tpl) this._openPanel(tpl);
      });
    });
  },

  _cardHTML(t) {
    const cat = (t.category || 'other').toLowerCase();
    const agentCount = Array.isArray(t.agents) ? t.agents.length : (t.agent_count || 0);
    const stars = this._fmt(t.stars || 0);
    const deploys = this._fmt(t.deploys || t.deploy_count || 0);
    const icon = t.icon || '📦';

    return `
      <div class="mp-card" data-id="${Utils.esc(String(t.id))}" tabindex="0" role="button" aria-label="View ${Utils.esc(t.name)}">
        <div class="mp-card-top">
          <span class="mp-badge mp-badge--${Utils.esc(cat)}">${Utils.esc(this._capFirst(cat))}</span>
          <span class="mp-stars">★ ${Utils.esc(stars)}</span>
        </div>
        <div class="mp-card-title">${Utils.esc(icon)} ${Utils.esc(t.name || 'Untitled')}</div>
        <div class="mp-card-desc">${Utils.esc(t.description || '')}</div>
        <div class="mp-agent-badge">${agentCount} agent${agentCount !== 1 ? 's' : ''}</div>
        <div class="mp-card-divider"></div>
        <div class="mp-card-footer">
          <span class="mp-author">By @${Utils.esc(t.author || 'unknown')}</span>
          <span class="mp-deploys">${Utils.esc(deploys)} deploys</span>
        </div>
      </div>
    `;
  },

  _openPanel(tpl) {
    this._currentTemplate = tpl;
    this._slideoverOpen = true;

    const backdrop = document.getElementById('mpBackdrop');
    const panel = document.getElementById('mpSlideover');
    const inner = document.getElementById('mpSlideoverInner');

    if (!backdrop || !panel || !inner) return;

    inner.innerHTML = this._panelHTML(tpl);

    backdrop.classList.add('mp-backdrop--open');
    panel.classList.add('mp-slideover--open');

    // Bind close button
    inner.querySelector('.mp-panel-close')?.addEventListener('click', () => this._closePanel());

    // Bind config preview toggle
    const toggleBtn = inner.querySelector('.mp-config-toggle');
    const configBlock = inner.querySelector('.mp-config-block');
    if (toggleBtn && configBlock) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = configBlock.style.display !== 'none';
        configBlock.style.display = isOpen ? 'none' : 'block';
        toggleBtn.textContent = isOpen ? '▶ Show' : '▼ Hide';
      });
    }

    // Bind deploy button
    inner.querySelector('.mp-deploy-btn')?.addEventListener('click', () => this._deploy(tpl));

    // Focus close button for accessibility
    setTimeout(() => inner.querySelector('.mp-panel-close')?.focus(), 50);
  },

  _closePanel() {
    this._slideoverOpen = false;
    this._currentTemplate = null;

    const backdrop = document.getElementById('mpBackdrop');
    const panel = document.getElementById('mpSlideover');

    backdrop?.classList.remove('mp-backdrop--open');
    panel?.classList.remove('mp-slideover--open');
  },

  _panelHTML(t) {
    const cat = (t.category || 'other').toLowerCase();
    const agents = Array.isArray(t.agents) ? t.agents : [];
    const requirements = Array.isArray(t.requirements) ? t.requirements : [];
    const version = t.version || '1.0.0';
    const stars = this._fmt(t.stars || 0);
    const icon = t.icon || '📦';

    const agentsHTML = agents.length
      ? agents.map(a => `
          <div class="mp-agent-row">
            <span class="mp-agent-dot"></span>
            <div>
              <div class="mp-agent-name">${Utils.esc(a.name || a.id || 'Agent')}</div>
              <div class="mp-agent-role">${Utils.esc(a.role || a.description || '')}</div>
            </div>
          </div>`).join('')
      : '<div style="color:var(--text-tertiary);font-size:13px">No agents listed.</div>';

    const requirementsHTML = requirements.length
      ? requirements.map(r => `<li class="mp-req-item">${Utils.esc(typeof r === 'string' ? r : r.name || JSON.stringify(r))}</li>`).join('')
      : '<li class="mp-req-item" style="color:var(--text-tertiary)">No special requirements.</li>';

    const yamlPreview = this._buildYaml(t, agents);

    return `
      <div class="mp-panel-header">
        <button class="mp-panel-close" aria-label="Close panel">×</button>
        <div class="mp-panel-hero">
          <div style="font-size:32px;margin-bottom:8px">${Utils.esc(icon)}</div>
          <h2 class="mp-panel-title">${Utils.esc(t.name || 'Template')}</h2>
          <div class="mp-panel-meta">
            <span class="mp-badge mp-badge--${Utils.esc(cat)}">${Utils.esc(this._capFirst(cat))}</span>
            <span class="mp-panel-stars">★ ${Utils.esc(stars)}</span>
            <span class="mp-panel-version">v${Utils.esc(version)}</span>
          </div>
        </div>
      </div>

      <div class="mp-panel-body">
        <section class="mp-panel-section">
          <div class="mp-panel-section-title">DESCRIPTION</div>
          <p class="mp-panel-desc">${Utils.esc(t.description || 'No description provided.')}</p>
        </section>

        <section class="mp-panel-section">
          <div class="mp-panel-section-title">INCLUDED AGENTS</div>
          <div class="mp-agents-list">
            ${agentsHTML}
          </div>
        </section>

        <section class="mp-panel-section">
          <div class="mp-panel-section-title" style="display:flex;align-items:center;justify-content:space-between">
            <span>CONFIGURATION PREVIEW</span>
            <button class="mp-config-toggle" style="font-size:12px;color:var(--text-tertiary);background:none;border:none;cursor:pointer;padding:0">▼ Hide</button>
          </div>
          <div class="mp-config-block">
            <pre class="mp-config-pre"><code>${Utils.esc(yamlPreview)}</code></pre>
          </div>
        </section>

        <section class="mp-panel-section">
          <div class="mp-panel-section-title">REQUIREMENTS</div>
          <ul class="mp-req-list">
            ${requirementsHTML}
          </ul>
        </section>
      </div>

      <div class="mp-panel-footer">
        <button class="mp-deploy-btn" id="mpDeployBtn">
          <span class="mp-deploy-label">🚀 Deploy Template</span>
          <span class="mp-deploy-spinner" style="display:none"><div class="spinner" style="width:16px;height:16px"></div></span>
        </button>
      </div>
    `;
  },

  async _deploy(tpl) {
    const btn = document.getElementById('mpDeployBtn');
    if (!btn) return;

    const label = btn.querySelector('.mp-deploy-label');
    const spinner = btn.querySelector('.mp-deploy-spinner');

    btn.disabled = true;
    if (label) label.style.display = 'none';
    if (spinner) spinner.style.display = 'flex';

    try {
      const result = await apiFetch(`/api/marketplace/templates/${tpl.id}/deploy`, { method: 'POST' });
      const agentCount = result?.agents_added ?? result?.agent_count ?? (Array.isArray(tpl.agents) ? tpl.agents.length : 1);
      this._closePanel();
      this._showToast(`✅ Template deployed! ${agentCount} agent${agentCount !== 1 ? 's' : ''} added.`);
    } catch (e) {
      this._showToast(`❌ Deploy failed: ${e.message}`, true);
    } finally {
      btn.disabled = false;
      if (label) label.style.display = '';
      if (spinner) spinner.style.display = 'none';
    }
  },

  _showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'mp-toast' + (isError ? ' mp-toast--error' : '');
    toast.textContent = msg;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('mp-toast--in'));
    });

    setTimeout(() => {
      toast.classList.remove('mp-toast--in');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3000);
  },

  _buildYaml(t, agents) {
    const lines = [];
    lines.push(`template:`);
    lines.push(`  name: "${t.name || 'Untitled'}"`);
    lines.push(`  version: "${t.version || '1.0.0'}"`);
    lines.push(`  category: "${t.category || 'other'}"`);
    lines.push(`  author: "${t.author || 'unknown'}"`);
    lines.push(``);
    lines.push(`agents:`);
    if (agents.length === 0) {
      lines.push(`  # No agents configured`);
    } else {
      agents.forEach(a => {
        lines.push(`  - id: "${a.id || a.name || 'agent'}"`);
        lines.push(`    name: "${a.name || a.id || 'Agent'}"`);
        if (a.role) lines.push(`    role: "${a.role}"`);
        if (a.model) lines.push(`    model: "${a.model}"`);
        if (a.description) lines.push(`    description: "${a.description}"`);
        if (a.tools && Array.isArray(a.tools)) {
          lines.push(`    tools:`);
          a.tools.forEach(tool => lines.push(`      - ${tool}`));
        }
        lines.push(``);
      });
    }
    if (t.config && typeof t.config === 'object') {
      lines.push(`config:`);
      Object.entries(t.config).forEach(([k, v]) => {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      });
    }
    return lines.join('\n');
  },

  _fmt(n) {
    if (typeof n !== 'number') n = parseInt(n, 10) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  },

  _capFirst(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  _injectStyles() {
    const style = document.createElement('style');
    style.id = 'mp-styles';
    style.textContent = `
      /* ── Marketplace Wrapper ── */
      .mp-wrapper {
        padding: 0;
        position: relative;
      }

      /* ── Filter Bar ── */
      .mp-filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }
      .mp-pills {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .mp-pill {
        padding: 6px 16px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 500;
        border: 1px solid var(--border-default);
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .mp-pill:hover {
        border-color: var(--border-hover);
        color: var(--text-primary);
      }
      .mp-pill.active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }
      .mp-search-wrap {
        position: relative;
        margin-left: auto;
      }
      .mp-search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 14px;
        height: 14px;
        color: var(--text-tertiary);
        pointer-events: none;
      }
      .mp-search {
        padding: 7px 12px 7px 30px;
        border-radius: 8px;
        border: 1px solid var(--border-default);
        background: var(--bg-surface);
        color: var(--text-primary);
        font-size: 13px;
        width: 220px;
        transition: border-color 0.15s;
        outline: none;
      }
      .mp-search:focus {
        border-color: var(--accent);
      }
      .mp-search::placeholder {
        color: var(--text-tertiary);
      }

      /* ── Grid ── */
      .mp-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
      }
      @media (max-width: 1100px) {
        .mp-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 640px) {
        .mp-grid { grid-template-columns: 1fr; }
        .mp-search { width: 160px; }
      }

      /* ── Card ── */
      .mp-card {
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .mp-card:hover {
        border-color: var(--border-hover);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      }
      .mp-card:focus {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .mp-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mp-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .mp-badge--productivity {
        background: color-mix(in srgb, var(--accent) 15%, transparent);
        color: var(--accent);
        border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      }
      .mp-badge--devops {
        background: color-mix(in srgb, var(--success) 15%, transparent);
        color: var(--success);
        border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
      }
      .mp-badge--data {
        background: rgba(20, 184, 166, 0.12);
        color: #14b8a6;
        border: 1px solid rgba(20, 184, 166, 0.25);
      }
      .mp-badge--support {
        background: rgba(168, 85, 247, 0.12);
        color: #a855f7;
        border: 1px solid rgba(168, 85, 247, 0.25);
      }
      .mp-badge--other {
        background: color-mix(in srgb, var(--text-tertiary) 12%, transparent);
        color: var(--text-tertiary);
        border: 1px solid color-mix(in srgb, var(--text-tertiary) 20%, transparent);
      }
      .mp-stars {
        font-size: 13px;
        color: #f59e0b;
        font-weight: 600;
        white-space: nowrap;
      }
      .mp-card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.3;
      }
      .mp-card-desc {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        flex: 1;
      }
      .mp-agent-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        background: var(--bg-elevated, rgba(0,0,0,0.03));
        border-radius: 6px;
        font-size: 11px;
        color: var(--text-tertiary);
        font-weight: 500;
        width: fit-content;
      }
      .mp-card-divider {
        height: 1px;
        background: var(--border-default);
        margin: 4px 0;
      }
      .mp-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: var(--text-tertiary);
      }
      .mp-author { font-weight: 500; }
      .mp-deploys { white-space: nowrap; }

      /* ── Backdrop ── */
      .mp-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0);
        z-index: 300;
        pointer-events: none;
        transition: background 0.25s ease;
      }
      .mp-backdrop--open {
        background: rgba(0,0,0,0.5);
        pointer-events: all;
      }

      /* ── Slide-over Panel ── */
      .mp-slideover {
        position: fixed;
        top: 0;
        right: 0;
        width: 480px;
        max-width: 100vw;
        height: 100vh;
        background: var(--bg-surface);
        border-left: 1px solid var(--border-default);
        z-index: 301;
        transform: translateX(100%);
        transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .mp-slideover--open {
        transform: translateX(0);
      }
      .mp-slideover-inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      /* ── Panel Header ── */
      .mp-panel-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid var(--border-default);
        position: relative;
        flex-shrink: 0;
      }
      .mp-panel-close {
        position: absolute;
        top: 16px;
        right: 20px;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--border-default);
        background: transparent;
        color: var(--text-secondary);
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transition: all 0.15s;
      }
      .mp-panel-close:hover {
        background: var(--bg-elevated, rgba(0,0,0,0.03));
        color: var(--text-primary);
        border-color: var(--border-hover);
      }
      .mp-panel-hero {
        text-align: center;
        padding-top: 4px;
      }
      .mp-panel-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 10px;
      }
      .mp-panel-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .mp-panel-stars {
        font-size: 13px;
        color: #f59e0b;
        font-weight: 600;
      }
      .mp-panel-version {
        font-size: 12px;
        color: var(--text-tertiary);
        background: var(--bg-elevated, rgba(0,0,0,0.03));
        padding: 2px 8px;
        border-radius: 999px;
      }

      /* ── Panel Body ── */
      .mp-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .mp-panel-section {}
      .mp-panel-section-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--text-tertiary);
        margin-bottom: 10px;
      }
      .mp-panel-desc {
        font-size: 14px;
        color: var(--text-secondary);
        line-height: 1.6;
        margin: 0;
      }

      /* ── Agents List ── */
      .mp-agents-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mp-agent-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .mp-agent-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        margin-top: 5px;
        flex-shrink: 0;
      }
      .mp-agent-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .mp-agent-role {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 2px;
      }

      /* ── Config Block ── */
      .mp-config-block {
        background: var(--bg-base, #f8fafc);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        padding: 14px 16px;
        overflow: auto;
        max-height: 260px;
      }
      .mp-config-pre {
        margin: 0;
        font-size: 12px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
        color: var(--text-secondary);
        white-space: pre;
        line-height: 1.6;
      }

      /* ── Requirements List ── */
      .mp-req-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mp-req-item {
        font-size: 13px;
        color: var(--text-secondary);
        padding: 6px 10px;
        background: var(--bg-elevated, rgba(0,0,0,0.02));
        border-radius: 6px;
        border-left: 3px solid var(--accent);
        padding-left: 12px;
      }

      /* ── Panel Footer ── */
      .mp-panel-footer {
        flex-shrink: 0;
        padding: 16px 24px;
        border-top: 1px solid var(--border-default);
        background: var(--bg-surface);
      }
      .mp-deploy-btn {
        width: 100%;
        padding: 12px;
        border-radius: 10px;
        background: var(--accent);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: opacity 0.15s, transform 0.1s;
      }
      .mp-deploy-btn:hover:not(:disabled) {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      .mp-deploy-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .mp-deploy-spinner {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ── Toast ── */
      .mp-toast {
        position: fixed;
        top: 20px;
        right: 24px;
        z-index: 9999;
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: 10px;
        padding: 12px 18px;
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
        max-width: 340px;
      }
      .mp-toast--in {
        opacity: 1;
        transform: translateY(0);
      }
      .mp-toast--error {
        border-color: var(--danger);
        color: var(--danger);
      }
    `;
    document.head.appendChild(style);
  },
};
