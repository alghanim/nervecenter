/* AgentBoard — Documents Page */
window.Pages = window.Pages || {};
window.Pages.documents = (function () {
  let container = null;
  let fileList = [];
  let selectedFile = null;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function typeBadge(ext) {
    const colors = { md: '#6366F1', pdf: '#EF4444', png: '#10B981', jpg: '#10B981', jpeg: '#10B981', txt: '#8B8B8B' };
    const color = colors[ext] || '#8B8B8B';
    return `<span class="doc-type-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${ext.toUpperCase()}</span>`;
  }

  function typeIcon(type) {
    if (type === 'markdown' || type === 'text') {
      return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/><path d="M12 2v4h4" stroke="currentColor" stroke-width="1.5"/><path d="M6 10h8M6 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }
    if (type === 'image') {
      return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8" r="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 14l4-4 3 3 3-3 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (type === 'pdf') {
      return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/><path d="M12 2v4h4" stroke="currentColor" stroke-width="1.5"/><text x="6" y="15" font-size="6" fill="currentColor" font-weight="bold">PDF</text></svg>';
    }
    return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/></svg>';
  }

  async function render(el) {
    container = el;
    container.innerHTML = `
      <div class="documents-layout">
        <div class="documents-sidebar" id="docSidebar">
          <div class="documents-sidebar-header">
            <h3>Files</h3>
            <button class="btn-icon doc-refresh-btn" id="docRefreshBtn" title="Refresh">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7a6 6 0 0111.5-2.3M13 7A6 6 0 011.5 9.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12.5 1v3.7h-3.7M1.5 13v-3.7h3.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="documents-search">
            <input type="text" id="docSearchInput" placeholder="Search files..." />
          </div>
          <div class="documents-file-list" id="docFileList">
            <div class="loading-state"><div class="spinner"></div></div>
          </div>
        </div>
        <div class="documents-viewer" id="docViewer">
          <div class="documents-empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M12 6h16l8 8v28a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" stroke-width="2"/>
              <path d="M28 6v8h8" stroke="currentColor" stroke-width="2"/>
              <path d="M16 22h16M16 28h12M16 34h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <h3>Select a document</h3>
            <p>Choose a file from the list to preview it here</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('docRefreshBtn').addEventListener('click', loadFiles);
    document.getElementById('docSearchInput').addEventListener('input', renderFileList);

    await loadFiles();
  }

  async function loadFiles() {
    const listEl = document.getElementById('docFileList');
    listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const resp = await fetch('/api/documents');
      fileList = await resp.json();
      renderFileList();
    } catch (e) {
      listEl.innerHTML = '<div class="documents-error">Failed to load documents</div>';
    }
  }

  function renderFileList() {
    const listEl = document.getElementById('docFileList');
    const query = (document.getElementById('docSearchInput')?.value || '').toLowerCase();
    const filtered = fileList.filter(f => f.name.toLowerCase().includes(query));

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="documents-error">No documents found</div>';
      return;
    }

    // Group by type
    const groups = {};
    filtered.forEach(f => {
      const g = f.type === 'markdown' ? 'Markdown' : f.type === 'pdf' ? 'PDF' : f.type === 'image' ? 'Images' : 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });

    let html = '';
    for (const [group, files] of Object.entries(groups)) {
      html += `<div class="doc-group-label">${Utils.esc(group)} <span class="doc-group-count">${files.length}</span></div>`;
      files.forEach(f => {
        const isActive = selectedFile && selectedFile.path === f.path;
        html += `
          <div class="doc-file-item ${isActive ? 'active' : ''}" data-path="${Utils.esc(f.path)}">
            <div class="doc-file-icon">${typeIcon(f.type)}</div>
            <div class="doc-file-info">
              <div class="doc-file-name">${Utils.esc(f.name)}</div>
              <div class="doc-file-meta">${formatSize(f.size)} · ${formatDate(f.modified)}</div>
            </div>
            ${typeBadge(f.ext)}
          </div>
        `;
      });
    }

    listEl.innerHTML = html;
    listEl.querySelectorAll('.doc-file-item').forEach(el => {
      el.addEventListener('click', () => openFile(el.dataset.path));
    });
  }

  async function openFile(path) {
    const viewer = document.getElementById('docViewer');
    viewer.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const resp = await fetch('/api/documents/content?path=' + encodeURIComponent(path));
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      selectedFile = data;
      renderFileList(); // update active state

      const header = `
        <div class="doc-viewer-header">
          <div class="doc-viewer-title">${Utils.esc(data.name)}</div>
          <div class="doc-viewer-meta">${Utils.esc(data.path)} · ${formatSize(data.size)} · ${formatDate(data.modified)}</div>
        </div>
      `;

      if (data.type === 'markdown' || data.type === 'text') {
        const rendered = data.type === 'markdown' && window.marked
          ? DOMPurify.sanitize(marked.parse(data.content))
          : `<pre class="doc-plaintext">${Utils.esc(data.content)}</pre>`;
        viewer.innerHTML = header + `<div class="doc-viewer-content doc-markdown">${rendered}</div>`;
      } else if (data.type === 'image') {
        viewer.innerHTML = header + `
          <div class="doc-viewer-content doc-image-viewer">
            <img src="${data.content}" alt="${Utils.esc(data.name)}" class="doc-image" onclick="this.classList.toggle('doc-image-expanded')" />
          </div>
        `;
      } else if (data.type === 'pdf') {
        viewer.innerHTML = header + `
          <div class="doc-viewer-content doc-pdf-viewer">
            <iframe src="${data.content}" class="doc-pdf-frame"></iframe>
          </div>
        `;
      }
    } catch (e) {
      viewer.innerHTML = `<div class="documents-error">Failed to load: ${Utils.esc(e.message)}</div>`;
    }
  }

  function destroy() {
    container = null;
    fileList = [];
    selectedFile = null;
  }

  return { render, destroy };
})();
