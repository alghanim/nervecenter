/* AgentBoard — Main App Controller */

/* ═══════════════════════════
   THEME MODULE
═══════════════════════════ */
window.Theme = (function () {
  const LS_KEY = 'agentboard-theme';

  function apply(theme) {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
    // Sync SVG theme icons (defined in index.html inline script)
    if (window._syncThemeIcon) window._syncThemeIcon();
  }

  function current() {
    return document.body.classList.contains('theme-light') ? 'light' : 'dark';
  }

  function toggle() {
    const next = current() === 'light' ? 'dark' : 'light';
    localStorage.setItem(LS_KEY, next);
    apply(next);
  }

  async function init() {
    // 1. localStorage takes priority
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      apply(stored);
      return;
    }
    // 2. fallback: server branding
    try {
      const branding = await API.getBranding();
      apply(branding.theme === 'light' ? 'light' : 'dark');
    } catch (_) {
      apply('dark'); // default dark
    }
  }

  return { init, apply, toggle, current };
})();

/* ═══════════════════════════
   BRANDING MODULE
═══════════════════════════ */
window.Branding = (function () {
  let _data = null;

  async function init() {
    try {
      _data = await API.getBranding();
      apply(_data);
    } catch (_) {
      // non-fatal: keep defaults
    }
  }

  function apply(b) {
    if (!b) return;
    // Document title
    if (b.team_name) document.title = b.team_name;
    // Sidebar title
    const titleEl = document.getElementById('sidebarTitle');
    if (titleEl && b.team_name) titleEl.textContent = b.team_name;
    // Sidebar logo
    const logoEl = document.getElementById('sidebarLogo');
    if (logoEl && b.logo_path) {
      logoEl.innerHTML = `<img src="${Utils.esc(b.logo_path)}" alt="logo"
        style="width:28px;height:28px;object-fit:contain;border-radius:4px">`;
    }
    // Accent color
    if (b.accent_color) {
      document.documentElement.style.setProperty('--accent', b.accent_color);
      // derive hover (+10% lightness) and muted (12% opacity) automatically
      document.documentElement.style.setProperty('--accent-hover', b.accent_color);
      document.documentElement.style.setProperty('--accent-muted', b.accent_color + '1F');
    }
  }

  function getData() { return _data; }

  return { init, getData };
})();

/* ═══════════════════════════
   ENVIRONMENT SWITCHER MODULE
═══════════════════════════ */
window.Env = (function () {
  let _envs = [];
  let _open = false;

  async function init() {
    try {
      _envs = await API.getEnvironments();
    } catch (_) {
      _envs = [{ name: 'Local', url: 'http://localhost:8891', active: true }];
    }
    _renderBtn();
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!document.getElementById('envSwitcher')?.contains(e.target)) {
        _close();
      }
    });
  }

  function toggle() {
    _open = !_open;
    const dd = document.getElementById('envDropdown');
    if (dd) {
      dd.style.display = _open ? 'block' : 'none';
      if (_open) _renderList();
    }
  }

  function _close() {
    _open = false;
    const dd = document.getElementById('envDropdown');
    if (dd) dd.style.display = 'none';
  }

  function _renderBtn() {
    const active = _envs.find(e => e.active) || _envs[0];
    const nameEl = document.getElementById('envCurrentName');
    if (nameEl && active) nameEl.textContent = active.name;
  }

  function _renderList() {
    const listEl = document.getElementById('envList');
    if (!listEl) return;
    listEl.innerHTML = _envs.map(env => `
      <div onclick="Env._switch('${Utils.esc(env.url)}')" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.1s;${env.active ? 'background:var(--bg-elevated)' : ''}" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='${env.active ? 'var(--bg-elevated)' : ''}'">
        <span style="width:7px;height:7px;border-radius:50%;background:${env.active ? '#22c55e' : 'var(--border-default)'};flex-shrink:0"></span>
        <span style="flex:1;color:var(--text-primary)">${Utils.esc(env.name)}</span>
        <span style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-display)">${Utils.esc(env.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span>
      </div>`).join('');
  }

  async function _switch(url) {
    try {
      _envs = await API.switchEnvironment(url);
      _renderBtn();
      _close();
      // Update global API base and reload page data
      window.AGENTBOARD_API = url === window.location.origin ? '' : url;
      // Reload current page
      if (window.App && App.reload) App.reload();
    } catch (e) {
      alert('Failed to switch environment: ' + e.message);
    }
  }

  async function addEnvironment(name, url) {
    try {
      _envs = await API.addEnvironment(name, url);
      _renderBtn();
    } catch (e) {
      throw e;
    }
  }

  async function deleteEnvironment(url) {
    try {
      _envs = await API.deleteEnvironment(url);
      _renderBtn();
    } catch (e) {
      throw e;
    }
  }

  function getAll() { return _envs; }

  return { init, toggle, _switch, addEnvironment, deleteEnvironment, getAll };
})();

/* ═══════════════════════════
   MAIN APP
═══════════════════════════ */
(function () {
  let currentPage = null;
  let currentView = null;

  const PAGE_TITLES = {
    dashboard:   { title: 'Dashboard',  subtitle: 'Overview of your agent fleet' },
    agents:      { title: 'Agents',     subtitle: 'All configured agents and their status' },
    'org-chart': { title: 'Org Chart',  subtitle: 'Team structure and reporting lines' },
    kanban:      { title: 'Kanban',     subtitle: 'Task management and workflow' },
    activity:    { title: 'Activity',   subtitle: 'Real-time agent activity stream' },
    messaging:   { title: 'Messages',   subtitle: 'Send direct instructions to agents' },
    reports:     { title: 'Reports',    subtitle: 'Analytics and performance insights' },
    costs:       { title: 'Costs',      subtitle: 'Token usage and cost tracking' },
    documents:   { title: 'Documents',  subtitle: 'Browse agent-generated files and specs' },
    errors:      { title: 'Errors',     subtitle: 'Error and failure dashboard' },
    logs:        { title: 'Logs',       subtitle: 'Live log viewer with search and filtering' },
    alerts:      { title: 'Alerts',     subtitle: 'Alerting rules and triggered notifications' },
    graph:       { title: 'Graph',      subtitle: 'Agent dependency and collaboration graph' },
    settings:    { title: 'Settings',   subtitle: 'Configuration and preferences' },
    'api-docs':  { title: 'API Reference', subtitle: 'REST API documentation and endpoint reference' },
    marketplace: { title: 'Agent Marketplace', subtitle: 'Deploy pre-built agent configurations in one click' },
  };

  async function init() {
    // Init theme & branding in parallel
    await Promise.all([Theme.init(), Branding.init()]);

    // Init environment switcher
    Env.init().catch(() => {});

    // Auth: show logout button if already logged in
    if (window.Auth) Auth._renderLogoutBtn();

    // Sidebar toggle (desktop collapse)
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // On mobile, also toggle drawer
        if (window.innerWidth <= 959) {
          sidebar.classList.toggle('mobile-open');
          const overlay = document.getElementById('mobileOverlay');
          if (overlay) {
            overlay.classList.toggle('visible', sidebar.classList.contains('mobile-open'));
          }
        }
      });
    }

    // Mobile hamburger button (in page header)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        sidebar.classList.remove('collapsed');
        const overlay = document.getElementById('mobileOverlay');
        if (overlay) overlay.classList.add('visible');
      });
    }

    // Mobile overlay click to close
    const overlay = document.getElementById('mobileOverlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar?.classList.remove('mobile-open');
        overlay.classList.remove('visible');
      });
    }

    // Sidebar nav clicks
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.nav);
      });
    });

    // Bottom nav clicks
    document.querySelectorAll('[data-bottom-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.bottomNav);
      });
    });

    // WS connection indicator
    if (window.WS) {
      WS.on('_connected', () => { if (window._updateWsIndicator) _updateWsIndicator(true, false); });
      WS.on('_disconnected', () => { if (window._updateWsIndicator) _updateWsIndicator(false, false); });
    }

    // Global search shortcut: Cmd+K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (window.Search) Search.toggle();
      }
    });

    // Hash-based routing
    window.addEventListener('hashchange', () => {
      const hash = location.hash.slice(1) || 'dashboard';
      routeTo(hash, false);
    });

    // Initial route
    const hash = location.hash.slice(1) || 'dashboard';
    routeTo(hash, false);
  }

  function navigate(path, updateHash = true) {
    if (updateHash) {
      location.hash = path;
    } else {
      routeTo(path, false);
    }
  }

  function routeTo(path, updateHash = true) {
    const [main, ...subParts] = path.split('/');
    const sub = subParts.join('/');

    if (updateHash) {
      history.replaceState(null, '', '#' + path);
    }

    const pageKey = main.toLowerCase().replace(' ', '-');

    // Update sidebar nav active state
    document.querySelectorAll('[data-nav]').forEach(el => {
      const navKey = el.dataset.nav.split('/')[0];
      el.classList.toggle('active', navKey === pageKey);
    });

    // Update bottom nav active state
    document.querySelectorAll('[data-bottom-nav]').forEach(el => {
      const navKey = el.dataset.bottomNav.split('/')[0];
      el.classList.toggle('active', navKey === pageKey);
    });

    // Update header title + subtitle
    const info = PAGE_TITLES[pageKey] || { title: pageKey, subtitle: '' };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = info.title;
    const subtitleEl = document.getElementById('pageSubtitle');
    if (subtitleEl) {
      subtitleEl.textContent = info.subtitle || '';
      subtitleEl.style.display = info.subtitle ? '' : 'none';
    }

    // Show/hide header info vs breadcrumb
    const headerInfo = document.getElementById('pageHeaderInfo');
    const breadEl = document.getElementById('pageBreadcrumb');
    if (breadEl) {
      if (sub) {
        breadEl.innerHTML = `<a onclick="App.navigate('${Utils.esc(pageKey)}')">${Utils.esc(info.title)}</a> <span>/</span> <span>${Utils.esc(sub)}</span>`;
        breadEl.style.display = '';
        if (headerInfo) headerInfo.style.display = 'none';
      } else {
        breadEl.innerHTML = '';
        breadEl.style.display = 'none';
        if (headerInfo) headerInfo.style.display = '';
      }
    }

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    if (sidebar && window.innerWidth <= 959) {
      sidebar.classList.remove('mobile-open');
      mobileOverlay?.classList.remove('visible');
    }

    renderPage(pageKey, sub);
    currentView = path;
  }

  async function renderPage(pageKey, sub) {
    const content = document.getElementById('content');
    if (!content) return;

    // Destroy previous page
    if (currentPage && currentPage.destroy) {
      try { currentPage.destroy(); } catch (_) {}
    }
    currentPage = null;

    let page = null;

    switch (pageKey) {
      case 'dashboard':  page = Pages.dashboard; break;
      case 'dashboard-builder': page = Pages.dashboardBuilder; break;
      case 'agents':     page = Pages.agents; break;
      case 'org-chart':  page = Pages.orgChart; break;
      case 'kanban':     page = Pages.kanban; break;
      case 'activity':   page = Pages.activity; break;
      case 'messaging':  page = Pages.messaging; break;
      case 'reports':    page = Pages.reports; break;
      case 'costs':      page = Pages.costs; break;
      case 'documents':  page = Pages.documents; break;
      case 'errors':     page = Pages.errors; break;
      case 'logs':       page = Pages.logs; break;
      case 'alerts':     page = Pages.alerts; break;
      case 'graph':      page = Pages.graph; break;
      case 'settings':     page = Pages.settings; break;
      case 'api-docs':     page = Pages.apiDocs; break;
      case 'marketplace':  page = Pages.marketplace; break;
      default:
        content.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="22" cy="22" r="14" stroke="currentColor" stroke-width="2"/><line x1="32" y1="32" x2="44" y2="44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
          <div class="empty-state-title">Page not found</div>
          <div class="empty-state-desc">${Utils.esc(pageKey)}</div>
        </div>`;
        return;
    }

    currentPage = page;
    content.innerHTML = '';
    // Page entrance animation
    content.classList.remove('page-enter');
    void content.offsetWidth;
    content.classList.add('page-enter');

    try {
      await page.render(content, sub);
    } catch (e) {
      console.error('Page render error:', e);
      content.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 8L43 40H5L24 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="24" y1="20" x2="24" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="35" r="1.5" fill="currentColor"/></svg></div>
        <div class="empty-state-title">Error loading page</div>
        <div class="empty-state-desc">${Utils.esc(e.message)}</div>
      </div>`;
    }
  }

  // Expose globally
  function reload() {
    const hash = location.hash.slice(1) || 'dashboard';
    routeTo(hash, false);
  }

  window.App = { navigate, init, reload };

  document.addEventListener('DOMContentLoaded', init);
})();
