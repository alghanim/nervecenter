/* AgentBoard — Auth / Login */

window.Auth = (function () {
  const TOKEN_KEY = 'agentboard_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {}
      });
      const data = await res.json();
      return data.authenticated === true;
    } catch (_) {
      return false;
    }
  }

  async function login(password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    setToken(data.token);
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {}
    }).catch(() => {});
    clearToken();
    // Reload to show login modal
    renderLoginModal();
  }

  // ─── Login Modal ───────────────────────────────────────────────────────────

  function renderLoginModal(onSuccess) {
    let overlay = document.getElementById('authOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'authOverlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal__logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5L12 2Z" stroke="#6366F1" stroke-width="1.5" fill="rgba(99,102,241,0.1)"/>
            <circle cx="12" cy="12" r="3" fill="#6366F1"/>
            <line x1="12" y1="9" x2="12" y2="5" stroke="#6366F1" stroke-width="1.5"/>
            <line x1="14.6" y1="13.5" x2="18" y2="15.5" stroke="#6366F1" stroke-width="1.5"/>
            <line x1="9.4" y1="13.5" x2="6" y2="15.5" stroke="#6366F1" stroke-width="1.5"/>
          </svg>
        </div>
        <h2 class="auth-modal__title">AgentBoard</h2>
        <p class="auth-modal__sub">Enter your admin password to continue</p>
        <form id="authForm" class="auth-modal__form" onsubmit="Auth._submit(event)">
          <div class="auth-modal__field">
            <input
              type="password"
              id="authPassword"
              class="auth-modal__input"
              placeholder="Password"
              autocomplete="current-password"
              autofocus
            />
          </div>
          <button type="submit" class="auth-modal__btn" id="authSubmitBtn">Sign In</button>
          <div id="authError" class="auth-modal__error" style="display:none"></div>
        </form>
      </div>`;

    overlay.style.display = 'flex';
    overlay.classList.add('auth-overlay');

    // Store callback
    overlay._onSuccess = onSuccess;

    // Focus password field
    setTimeout(() => {
      const inp = document.getElementById('authPassword');
      if (inp) inp.focus();
    }, 50);
  }

  async function _submit(e) {
    e.preventDefault();
    const pwd = document.getElementById('authPassword')?.value || '';
    const btn = document.getElementById('authSubmitBtn');
    const errEl = document.getElementById('authError');

    if (!pwd) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    if (errEl) errEl.style.display = 'none';

    try {
      await login(pwd);
      const overlay = document.getElementById('authOverlay');
      if (overlay) overlay.style.display = 'none';
      if (overlay?._onSuccess) overlay._onSuccess();
      _renderLogoutBtn();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Invalid password';
        errEl.style.display = '';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  }

  // ─── Logout button ─────────────────────────────────────────────────────────

  function _renderLogoutBtn() {
    // Remove existing
    document.getElementById('authLogoutBtn')?.remove();

    const token = getToken();
    if (!token) return;

    const actions = document.querySelector('.page-header-actions');
    if (!actions) return;

    const btn = document.createElement('button');
    btn.id = 'authLogoutBtn';
    btn.className = 'btn-icon';
    btn.title = 'Sign out';
    btn.setAttribute('aria-label', 'Sign out');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M10 11l3-3-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="13" y1="8" x2="6" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
    btn.onclick = () => logout();

    // Insert before the theme toggle
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      actions.insertBefore(btn, themeBtn);
    } else {
      actions.appendChild(btn);
    }
  }

  // ─── Interceptor helper ────────────────────────────────────────────────────

  // Returns auth headers for write requests
  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  // Handle 401 from any write call: show login modal, retry original call
  async function handle401(retryFn) {
    return new Promise((resolve, reject) => {
      renderLoginModal(async () => {
        try {
          const result = await retryFn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    getToken,
    login,
    logout,
    checkAuth,
    renderLoginModal,
    authHeaders,
    handle401,
    _submit,
    _renderLogoutBtn,
  };
})();
