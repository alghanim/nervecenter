/* AgentBoard — Main App Controller */

(function () {
  let currentPage = null;
  let currentView = null;

  const PAGE_TITLES = {
    dashboard:  { title: '◉ Dashboard', icon: '◉' },
    agents:     { title: '👥 Agents', icon: '👥' },
    'org-chart': { title: '🗺️ Org Chart', icon: '🗺️' },
    kanban:     { title: '📋 Kanban', icon: '📋' },
    activity:   { title: '📡 Activity', icon: '📡' },
    settings:   { title: '⚙️ Settings', icon: '⚙️' },
  };

  function init() {
    // Sidebar toggle
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // On mobile
        sidebar.classList.toggle('mobile-open');
        const overlay = document.getElementById('mobileOverlay');
        if (overlay) {
          overlay.classList.toggle('visible', sidebar.classList.contains('mobile-open'));
        }
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

    // Nav clicks
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.nav);
      });
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

    // Update nav active state
    document.querySelectorAll('[data-nav]').forEach(el => {
      const navKey = el.dataset.nav.split('/')[0];
      el.classList.toggle('active', navKey === pageKey);
    });

    // Update header title
    const info = PAGE_TITLES[pageKey] || { title: pageKey };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = info.title;

    const breadEl = document.getElementById('pageBreadcrumb');
    if (breadEl) {
      if (sub) {
        breadEl.innerHTML = `<a onclick="App.navigate('${Utils.esc(pageKey)}')">${info.title}</a> <span>/</span> <span>${Utils.esc(sub)}</span>`;
        breadEl.style.display = '';
      } else {
        breadEl.innerHTML = '';
        breadEl.style.display = 'none';
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
      case 'settings':   page = Pages.settings; break;
      default:
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Page not found: ${Utils.esc(pageKey)}</div></div>`;
        return;
    }

    currentPage = page;
    content.innerHTML = '';

    try {
      await page.render(content, sub);
    } catch (e) {
      console.error('Page render error:', e);
      content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error loading page</div><div class="empty-state-desc">${Utils.esc(e.message)}</div></div>`;
    }
  }

  // Expose globally
  window.App = { navigate, init };

  document.addEventListener('DOMContentLoaded', init);
})();
