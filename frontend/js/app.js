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
    reports:     { title: 'Reports',    subtitle: 'Analytics and performance insights' },
    costs:       { title: 'Costs',      subtitle: 'Token usage and cost tracking' },
    settings:    { title: 'Settings',   subtitle: 'Configuration and preferences' },
  };

  async function init() {
    // Init theme & branding in parallel
    await Promise.all([Theme.init(), Branding.init()]);

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
      case 'agents':     page = Pages.agents; break;
      case 'org-chart':  page = Pages.orgChart; break;
      case 'kanban':     page = Pages.kanban; break;
      case 'activity':   page = Pages.activity; break;
      case 'reports':    page = Pages.reports; break;
      case 'costs':      page = Pages.costs; break;
      case 'settings':   page = Pages.settings; break;
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
  window.App = { navigate, init };

  document.addEventListener('DOMContentLoaded', init);
})();
