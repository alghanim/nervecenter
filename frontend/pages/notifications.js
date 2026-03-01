/* AgentBoard — Notifications Center Page */
window.Pages = window.Pages || {};

Pages.notifications = {
  _items: [],
  _filter: { type:'', agent:'', read:'' },
  _pollTimer: null,

  async render(container) {
    container.innerHTML = '<div class="notifications-page">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<span style="color:var(--text-secondary);font-size:13px">Notification inbox</span>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-secondary" onclick="Pages.notifications._markAllRead()" style="font-size:12px">✓ Mark All Read</button>' +
          '<button class="btn-secondary" onclick="Pages.notifications._load()" style="font-size:12px">↻ Refresh</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
        '<select class="select" id="notifFilterType" onchange="Pages.notifications._filter.type=this.value;Pages.notifications._render()" style="font-size:12px">' +
          '<option value="">All Types</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option><option value="success">Success</option>' +
        '</select>' +
        '<select class="select" id="notifFilterRead" onchange="Pages.notifications._filter.read=this.value;Pages.notifications._render()" style="font-size:12px">' +
          '<option value="">All</option><option value="unread">Unread</option><option value="read">Read</option>' +
        '</select>' +
      '</div>' +
      '<div id="notifList"><div class="loading-state"><div class="spinner"></div><span>Loading...</span></div></div>' +
    '</div>';
    await this._load();
    this._startBadgePoll();
  },

  destroy() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  _startBadgePoll() {
    var self = this;
    this._updateBadge();
    this._pollTimer = setInterval(function(){ self._updateBadge(); }, 30000);
  },

  async _updateBadge() {
    try {
      var data = await apiFetch('/api/notifications/unread-count');
      var count = data.count || 0;
      var badge = document.getElementById('notif-badge');
      if (badge) {
        badge.style.display = count > 0 ? '' : 'none';
        badge.textContent = count > 99 ? '99+' : count;
      }
    } catch(_) {}
  },

  async _load() {
    try {
      this._items = await apiFetch('/api/notifications') || [];
      this._render();
      this._updateBadge();
    } catch(e) {
      document.getElementById('notifList').innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed</div><div class="empty-state-desc">'+Utils.esc(e.message)+'</div></div>';
    }
  },

  _render() {
    var el = document.getElementById('notifList');
    if (!el) return;
    var f = this._filter;
    var items = this._items.filter(function(n) {
      if (f.type && n.type !== f.type) return false;
      if (f.read === 'unread' && n.read) return false;
      if (f.read === 'read' && !n.read) return false;
      return true;
    });
    if (!items.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-title">No notifications</div></div>';
      return;
    }
    var icons = { info:'ℹ️', warning:'⚠️', error:'❌', success:'✅' };
    var colors = { info:'#6366f1', warning:'#f59e0b', error:'#ef4444', success:'#22c55e' };
    el.innerHTML = items.map(function(n) {
      var icon = icons[n.type] || 'ℹ️';
      var color = colors[n.type] || 'var(--text-tertiary)';
      var ts = new Date(n.created_at || n.timestamp);
      var timeStr = ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      return '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;cursor:pointer;opacity:' + (n.read?'0.6':'1') + ';border-left:3px solid ' + color + '" onclick="Pages.notifications._markRead(\'' + Utils.esc(n.id) + '\')">' +
        '<span style="font-size:18px;flex-shrink:0">' + icon + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-weight:600;font-size:13px;color:var(--text-primary)">' + Utils.esc(n.title || n.type) + '</span>' +
            (!n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent,#6366f1);flex-shrink:0"></span>' : '') +
            '<span style="margin-left:auto;font-size:11px;color:var(--text-tertiary);white-space:nowrap">' + Utils.esc(timeStr) + '</span>' +
          '</div>' +
          (n.message ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.4">' + Utils.esc(n.message) + '</div>' : '') +
          (n.agent_id ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Agent: ' + Utils.esc(n.agent_id) + '</div>' : '') +
        '</div>' +
        '<button class="btn-icon" style="color:var(--red,#ef4444);font-size:14px;flex-shrink:0" onclick="event.stopPropagation();Pages.notifications._delete(\'' + Utils.esc(n.id) + '\')" title="Delete">×</button>' +
      '</div>';
    }).join('');
  },

  async _markRead(id) {
    try {
      await apiFetch('/api/notifications/' + id + '/read', { method:'PUT' });
      var n = this._items.find(function(x){ return x.id === id; });
      if (n) n.read = true;
      this._render();
      this._updateBadge();
    } catch(_) {}
  },

  async _markAllRead() {
    try {
      await apiFetch('/api/notifications/read-all', { method:'POST' });
      this._items.forEach(function(n){ n.read = true; });
      this._render();
      this._updateBadge();
    } catch(e) { alert('Failed: ' + e.message); }
  },

  async _delete(id) {
    try {
      await apiFetch('/api/notifications/' + id, { method:'DELETE' });
      this._items = this._items.filter(function(x){ return x.id !== id; });
      this._render();
      this._updateBadge();
    } catch(e) { alert('Failed: ' + e.message); }
  }
};
