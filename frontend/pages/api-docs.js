/* AgentBoard — API Docs Page */

window.Pages = window.Pages || {};

Pages.apiDocs = {
  _endpoints: [],
  _filtered: [],
  _activeCategory: 'all',
  _activeEndpoint: null,

  async render(container) {
    container.innerHTML = `
      <div class="api-docs-layout" id="apiDocsLayout">
        <div class="api-docs-sidebar" id="apiDocsSidebar">
          <div style="padding:12px 16px 8px">
            <div class="search-box" style="position:relative">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);pointer-events:none" aria-hidden="true">
                <circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.5"/>
                <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input
                type="search"
                id="apiSearch"
                placeholder="Search endpoints…"
                style="width:100%;padding:7px 10px 7px 32px;background:var(--bg-base);border:1px solid var(--border-default);border-radius:var(--radius-md);font-size:13px;color:var(--text-primary);outline:none;box-sizing:border-box"
                oninput="Pages.apiDocs._onSearch(this.value)"
                autocomplete="off"
              />
            </div>
          </div>
          <div id="apiCategoryList" style="padding:4px 0 8px"></div>
        </div>
        <div class="api-docs-content" id="apiDocsContent">
          <div class="loading-state"><div class="spinner"></div><span>Loading API docs...</span></div>
        </div>
      </div>`;

    // Inject layout styles
    this._injectStyles();

    try {
      this._endpoints = await API.getAPIDocs();
      this._filtered = this._endpoints;
      this._activeCategory = 'all';
      this._renderSidebar();
      this._renderEndpointList();
    } catch (e) {
      document.getElementById('apiDocsContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Failed to load API docs</div>
          <div class="empty-state-desc">${Utils.esc(e.message)}</div>
        </div>`;
    }
  },

  _injectStyles() {
    if (document.getElementById('apiDocsStyles')) return;
    const style = document.createElement('style');
    style.id = 'apiDocsStyles';
    style.textContent = `
      .api-docs-layout {
        display: flex;
        height: calc(100vh - 64px);
        overflow: hidden;
        gap: 0;
        background: var(--bg-base);
      }
      .api-docs-sidebar {
        width: 240px;
        min-width: 200px;
        border-right: 1px solid var(--border-default);
        overflow-y: auto;
        flex-shrink: 0;
        background: var(--bg-surface);
      }
      .api-docs-content {
        flex: 1;
        overflow-y: auto;
        padding: 0;
      }
      .api-cat-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 7px 16px;
        font-size: 13px;
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: 0;
        font-weight: 500;
        transition: background 0.1s, color 0.1s;
      }
      .api-cat-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
      .api-cat-btn.active {
        background: var(--accent-muted);
        color: var(--accent);
      }
      .api-cat-count {
        margin-left: auto;
        font-size: 11px;
        background: var(--bg-base);
        border-radius: 9px;
        padding: 0 6px;
        color: var(--text-tertiary);
        min-width: 20px;
        text-align: center;
      }
      .api-endpoint-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        cursor: pointer;
        border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
        transition: background 0.1s;
      }
      .api-endpoint-row:hover { background: var(--bg-hover); }
      .api-endpoint-row.active { background: var(--accent-muted); }
      .api-method-badge {
        font-size: 10px;
        font-weight: 700;
        font-family: var(--font-mono, monospace);
        padding: 2px 6px;
        border-radius: 4px;
        min-width: 46px;
        text-align: center;
        letter-spacing: 0.03em;
        flex-shrink: 0;
      }
      .api-method-GET    { background: rgba(59,130,246,0.15); color: #60a5fa; }
      .api-method-POST   { background: rgba(34,197,94,0.15);  color: #4ade80; }
      .api-method-PUT    { background: rgba(251,191,36,0.15); color: #fbbf24; }
      .api-method-DELETE { background: rgba(239,68,68,0.15);  color: #f87171; }
      .api-method-WS     { background: rgba(168,85,247,0.15); color: #c084fc; }
      .api-endpoint-path {
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .api-detail-panel {
        padding: 28px 32px;
        max-width: 820px;
      }
      .api-detail-method-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .api-detail-path {
        font-family: var(--font-mono, monospace);
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        word-break: break-all;
      }
      .api-detail-desc {
        font-size: 14px;
        color: var(--text-secondary);
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .api-section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-tertiary);
        margin-bottom: 10px;
        margin-top: 24px;
      }
      .api-params-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        margin-bottom: 8px;
      }
      .api-params-table th {
        text-align: left;
        padding: 6px 12px;
        border-bottom: 1px solid var(--border-default);
        color: var(--text-tertiary);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .api-params-table td {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
        vertical-align: top;
      }
      .api-params-table tr:last-child td { border-bottom: none; }
      .api-param-name {
        font-family: var(--font-mono, monospace);
        color: var(--accent);
        font-weight: 600;
      }
      .api-param-required {
        font-size: 10px;
        font-weight: 700;
        color: #f87171;
        background: rgba(239,68,68,0.12);
        padding: 1px 5px;
        border-radius: 4px;
        margin-left: 4px;
      }
      .api-param-in-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--bg-base);
        color: var(--text-tertiary);
        border: 1px solid var(--border-default);
      }
      .api-curl-block {
        position: relative;
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-secondary);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .api-curl-copy-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .api-curl-copy-btn:hover { background: var(--accent-muted); color: var(--accent); }
      .api-example-response {
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-secondary);
        overflow-x: auto;
        white-space: pre;
        max-height: 300px;
        overflow-y: auto;
      }
      .api-endpoint-list-header {
        padding: 16px 20px 8px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-tertiary);
      }
      .api-empty-panel {
        padding: 48px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        color: var(--text-tertiary);
      }
      @media (max-width: 700px) {
        .api-docs-sidebar { width: 180px; }
        .api-detail-panel { padding: 16px; }
      }
    `;
    document.head.appendChild(style);
  },

  _categories() {
    const cats = new Set();
    this._endpoints.forEach(e => cats.add(e.category));
    return ['all', ...Array.from(cats).sort()];
  },

  _getCatIcon(cat) {
    const icons = {
      all:        '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
      Agents:     '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 6.5a2 2 0 100-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11.5 12a2 2 0 00-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Tasks:      '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      Alerts:     '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5A3.5 3.5 0 013.5 5c0 2.5 1 3.5 1 3.5H9.5S10.5 7.5 10.5 5A3.5 3.5 0 007 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Webhooks:   '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M5 7a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.5"/><path d="M9 11a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.5"/><path d="M7 5l-1 3 3 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      Logs:       '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4 5h6M4 7h6M4 9h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Reports:    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="8" width="2.5" height="4.5" rx="0.5" stroke="currentColor" stroke-width="1.5"/><rect x="5.5" y="5" width="2.5" height="7.5" rx="0.5" stroke="currentColor" stroke-width="1.5"/><rect x="9.5" y="1.5" width="2.5" height="11" rx="0.5" stroke="currentColor" stroke-width="1.5"/></svg>',
      Graph:      '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.5"/><circle cx="2.5" cy="11" r="1.5" stroke="currentColor" stroke-width="1.5"/><circle cx="11.5" cy="11" r="1.5" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="4" x2="2.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="4" x2="11.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="11" x2="10" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Docs:       '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 1h5.5L12 4.5V13H3V1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 1v3.5H12" stroke="currentColor" stroke-width="1.5"/><path d="M5 7h4M5 9.5h2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Analytics:  '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="1,9 4,5 7,7 10,3 13,5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      Auth:       '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="3" y="6" width="8" height="6.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 6V4.5a2 2 0 014 0V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      Dashboard:  '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
      Snapshots:  '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 7h1.5M11 7h1.5M7 1.5v1.5M7 11v1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3.5 3.5l1 1M9.5 9.5l1 1M3.5 10.5l1-1M9.5 4.5l1-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    return icons[cat] || icons.all;
  },

  _renderSidebar() {
    const cats = this._categories();
    const countByCat = {};
    this._endpoints.forEach(e => {
      countByCat[e.category] = (countByCat[e.category] || 0) + 1;
    });
    countByCat.all = this._endpoints.length;

    const el = document.getElementById('apiCategoryList');
    if (!el) return;

    el.innerHTML = cats.map(cat => {
      const count = countByCat[cat] || 0;
      const isActive = this._activeCategory === cat;
      const label = cat === 'all' ? 'All Endpoints' : cat;
      return `
        <button class="api-cat-btn${isActive ? ' active' : ''}"
                onclick="Pages.apiDocs._selectCategory('${Utils.esc(cat)}')"
                title="${Utils.esc(label)}">
          <span style="flex-shrink:0;color:${isActive ? 'var(--accent)' : 'var(--text-tertiary)'}">${this._getCatIcon(cat)}</span>
          <span>${Utils.esc(label)}</span>
          <span class="api-cat-count">${count}</span>
        </button>`;
    }).join('');
  },

  _selectCategory(cat) {
    this._activeCategory = cat;
    this._activeEndpoint = null;
    const q = (document.getElementById('apiSearch') || {}).value || '';
    this._applyFilter(q);
    this._renderSidebar();
    this._renderEndpointList();
  },

  _onSearch(q) {
    this._applyFilter(q);
    this._renderEndpointList();
  },

  _applyFilter(q) {
    const query = (q || '').toLowerCase().trim();
    let base = this._activeCategory === 'all'
      ? this._endpoints
      : this._endpoints.filter(e => e.category === this._activeCategory);

    if (query) {
      base = base.filter(e =>
        e.path.toLowerCase().includes(query) ||
        e.method.toLowerCase().includes(query) ||
        (e.description || '').toLowerCase().includes(query) ||
        e.category.toLowerCase().includes(query)
      );
    }
    this._filtered = base;
  },

  _renderEndpointList() {
    const contentEl = document.getElementById('apiDocsContent');
    if (!contentEl) return;

    if (this._filtered.length === 0) {
      contentEl.innerHTML = `
        <div class="api-empty-panel">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="18" cy="18" r="12" stroke="currentColor" stroke-width="2"/><line x1="27" y1="27" x2="37" y2="37" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span style="font-size:14px">No endpoints match your search</span>
        </div>`;
      return;
    }

    const catLabel = this._activeCategory === 'all' ? 'All Endpoints' : this._activeCategory;
    const rows = this._filtered.map((ep, i) => {
      const methodClass = ep.path.startsWith('/ws/') ? 'api-method-WS' : ('api-method-' + ep.method);
      const methodLabel = ep.path.startsWith('/ws/') ? 'WS' : ep.method;
      const isActive = this._activeEndpoint === i;
      return `
        <div class="api-endpoint-row${isActive ? ' active' : ''}"
             onclick="Pages.apiDocs._selectEndpoint(${i})">
          <span class="api-method-badge ${Utils.esc(methodClass)}">${Utils.esc(methodLabel)}</span>
          <span class="api-endpoint-path" title="${Utils.esc(ep.path)}">${Utils.esc(ep.path)}</span>
        </div>`;
    }).join('');

    contentEl.innerHTML = `
      <div class="api-endpoint-list-header">${Utils.esc(catLabel)} · ${this._filtered.length} endpoint${this._filtered.length !== 1 ? 's' : ''}</div>
      <div id="apiEndpointRows">${rows}</div>`;
  },

  _selectEndpoint(idx) {
    this._activeEndpoint = idx;
    const ep = this._filtered[idx];
    if (!ep) return;

    // Update active state in list
    document.querySelectorAll('.api-endpoint-row').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });

    const contentEl = document.getElementById('apiDocsContent');
    const listEl = document.getElementById('apiEndpointRows');
    if (!contentEl || !listEl) return;

    const methodClass = ep.path.startsWith('/ws/') ? 'api-method-WS' : ('api-method-' + ep.method);
    const methodLabel = ep.path.startsWith('/ws/') ? 'WS' : ep.method;

    // Build params table
    let paramsHtml = '';
    if (ep.params && ep.params.length > 0) {
      const rows = ep.params.map(p => `
        <tr>
          <td>
            <span class="api-param-name">${Utils.esc(p.name)}</span>
            ${p.required ? '<span class="api-param-required">required</span>' : ''}
          </td>
          <td><span class="api-param-in-badge">${Utils.esc(p.in)}</span></td>
          <td style="color:var(--text-tertiary);font-family:var(--font-mono,monospace);font-size:11px">${Utils.esc(p.type)}</td>
          <td style="color:var(--text-secondary)">${Utils.esc(p.description || '')}</td>
        </tr>`).join('');
      paramsHtml = `
        <div class="api-section-title">Parameters</div>
        <table class="api-params-table">
          <thead><tr>
            <th>Name</th><th>In</th><th>Type</th><th>Description</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // Build curl example
    const curlCmd = this._buildCurl(ep);
    const curlId = 'apiCurl_' + idx;

    // Build example response
    let exampleHtml = '';
    if (ep.example_response !== undefined && ep.example_response !== null) {
      const json = JSON.stringify(ep.example_response, null, 2);
      exampleHtml = `
        <div class="api-section-title">Example Response</div>
        <pre class="api-example-response">${Utils.esc(json)}</pre>`;
    }

    // Create split layout: left = list, right = detail panel
    // We keep the list and append a detail panel in a split view
    const detailId = 'apiDetailPanel';
    const existing = document.getElementById(detailId);
    const splitContainer = document.getElementById('apiDocsSplitInner');

    if (!splitContainer) {
      // Switch to split layout
      contentEl.innerHTML = `
        <div id="apiDocsSplitInner" style="display:flex;height:100%">
          <div style="flex:0 0 340px;border-right:1px solid var(--border-default);overflow-y:auto">
            <div class="api-endpoint-list-header" style="position:sticky;top:0;background:var(--bg-base);z-index:1">${Utils.esc(this._activeCategory === 'all' ? 'All Endpoints' : this._activeCategory)} · ${this._filtered.length}</div>
            <div id="apiEndpointRows2"></div>
          </div>
          <div id="${detailId}" style="flex:1;overflow-y:auto;padding:0"></div>
        </div>`;

      const rows2 = this._filtered.map((e2, i2) => {
        const mc2 = e2.path.startsWith('/ws/') ? 'api-method-WS' : ('api-method-' + e2.method);
        const ml2 = e2.path.startsWith('/ws/') ? 'WS' : e2.method;
        return `
          <div class="api-endpoint-row${i2 === idx ? ' active' : ''}"
               onclick="Pages.apiDocs._selectEndpoint(${i2})">
            <span class="api-method-badge ${Utils.esc(mc2)}">${Utils.esc(ml2)}</span>
            <span class="api-endpoint-path" title="${Utils.esc(e2.path)}">${Utils.esc(e2.path)}</span>
          </div>`;
      }).join('');
      document.getElementById('apiEndpointRows2').innerHTML = rows2;
    } else {
      // Update active row
      document.querySelectorAll('#apiEndpointRows2 .api-endpoint-row').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
      });
    }

    const detailEl = document.getElementById(detailId);
    if (!detailEl) return;

    detailEl.innerHTML = `
      <div class="api-detail-panel">
        <div class="api-detail-method-row">
          <span class="api-method-badge ${Utils.esc(methodClass)}" style="font-size:12px;padding:3px 10px">${Utils.esc(methodLabel)}</span>
          <span class="api-detail-path">${Utils.esc(ep.path)}</span>
        </div>
        <div style="margin-bottom:8px">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-default);color:var(--text-tertiary)">${Utils.esc(ep.category)}</span>
        </div>
        <div class="api-detail-desc">${Utils.esc(ep.description || '')}</div>

        ${paramsHtml}

        <div class="api-section-title">curl Example</div>
        <div class="api-curl-block" id="${curlId}">${Utils.esc(curlCmd)}<button class="api-curl-copy-btn" onclick="Pages.apiDocs._copyCurl('${curlId}')">Copy</button></div>

        ${exampleHtml}
      </div>`;
  },

  _buildCurl(ep) {
    const base = 'http://localhost:8891';
    const hasAuth = ep.category !== 'Auth';
    const authFlag = hasAuth ? '\\\n  -H "Authorization: Bearer $TOKEN"' : '';

    if (ep.path.startsWith('/ws/')) {
      return `wscat -c "ws://localhost:8891${ep.path}"`;
    }

    switch (ep.method) {
      case 'GET':
      case 'DELETE': {
        const flag = ep.method === 'DELETE' ? ' -X DELETE' : '';
        return `curl${flag} "${base}${ep.path}" ${authFlag}`.trim();
      }
      case 'POST':
      case 'PUT': {
        const bodyParams = (ep.params || []).filter(p => p.in === 'body');
        let bodyStr = '';
        if (bodyParams.length > 0) {
          const obj = {};
          bodyParams.forEach(p => {
            if (p.type === 'boolean') obj[p.name] = true;
            else if (p.type === 'integer') obj[p.name] = 0;
            else if (p.type === 'array') obj[p.name] = [];
            else obj[p.name] = '<' + p.name + '>';
          });
          bodyStr = `\\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(obj)}'`;
        }
        return `curl -X ${ep.method} "${base}${ep.path}" ${authFlag} ${bodyStr}`.replace(/\s+$/,'').trim();
      }
      default:
        return `curl "${base}${ep.path}" ${authFlag}`.trim();
    }
  },

  _copyCurl(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    // Extract text content without the button text
    const btn = el.querySelector('.api-curl-copy-btn');
    const text = (el.textContent || '').replace(btn ? (btn.textContent || '') : '', '').trim();
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = 'var(--success, #22c55e)';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.color = '';
        }, 1500);
      }
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }
    });
  },

  destroy() {
    // nothing to clean up
  }
};
