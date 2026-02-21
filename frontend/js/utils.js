/* AgentBoard — Utility Functions */

window.Utils = {
  // Escape HTML
  esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Relative time
  relTime(dateStr) {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const diff = Date.now() - d.getTime();
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (secs < 60) return 'just now';
    if (mins < 60) return mins === 1 ? '1 min ago' : `${mins} mins ago`;
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    return days === 1 ? '1 day ago' : `${days} days ago`;
  },

  // Absolute time
  absTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString();
  },

  // Status display
  statusLabel(status) {
    const map = {
      active: 'Online', online: 'Online',
      idle: 'Idle', busy: 'Busy',
      offline: 'Offline'
    };
    return map[status] || status || 'Unknown';
  },

  statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'active' || s === 'online') return 'online';
    if (s === 'idle' || s === 'busy') return 'busy';
    return 'offline';
  },

  // Team color helpers
  teamColor(agent) {
    if (agent.teamColor) return agent.teamColor;
    const t = (agent.team || '').toLowerCase();
    if (t.includes('command')) return '#8B5CF6';
    if (t.includes('engineer')) return '#3B82F6';
    if (t.includes('creative')) return '#EC4899';
    if (t.includes('ops')) return '#F59E0B';
    return '#8888A0';
  },

  teamBadgeStyle(agent) {
    const color = this.teamColor(agent);
    return `background: ${color}26; color: ${color};`;
  },

  // Priority color
  priorityClass(priority) {
    const p = (priority || '').toLowerCase();
    if (p === 'critical') return 'task-card__priority--critical';
    if (p === 'high') return 'task-card__priority--high';
    if (p === 'medium') return 'task-card__priority--medium';
    return 'task-card__priority--low';
  },

  // Truncate
  truncate(str, max = 100) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  },

  // Capitalize
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Show loading in container
  showLoading(container, msg = 'Loading...') {
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <span>${msg}</span>
      </div>`;
  },

  // Show empty state — icon can be SVG string or emoji
  showEmpty(container, icon, title, desc = '') {
    // Map common emoji/keywords to SVG icons
    const svgMap = {
      '👥': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="18" cy="15" r="7" stroke="currentColor" stroke-width="2"/><path d="M3 40c0-8.3 6.7-15 15-15s15 6.7 15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M33 22.5c4.1 0 7.5 3.4 7.5 7.5v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="33" cy="15" r="4.5" stroke="currentColor" stroke-width="2"/></svg>',
      '📡': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><polyline points="4,24 12,24 18,8 24,40 30,16 36,24 44,24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '📄': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M12 4h18l10 10v30H12V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 4v10h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="22" x2="32" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="30" x2="32" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="38" x2="26" y2="38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      '🛠️': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M34 8c-4.4 0-8 3.6-8 8 0 1.1.2 2.1.6 3L10 35.4c-.9.9-.9 2.3 0 3.2l1.4 1.4c.9.9 2.3.9 3.2 0L31 23.4c.9.4 1.9.6 3 .6 4.4 0 8-3.6 8-8 0-.7-.1-1.3-.2-2L38 18l-4-4 4-4c-.7-.1-1.3-.2-2-.2-.3 0-.7 0-1 .1V8H34Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '⚠️': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 8L43 40H5L24 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="24" y1="20" x2="24" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="35" r="1.5" fill="currentColor"/></svg>',
      '🔍': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="21" cy="21" r="13" stroke="currentColor" stroke-width="2"/><line x1="30" y1="30" x2="43" y2="43" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      '📋': '<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="6" width="32" height="38" rx="3" stroke="currentColor" stroke-width="2"/><line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="32" x2="24" y2="32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 6v-2h12v2" stroke="currentColor" stroke-width="2"/></svg>',
    };
    const iconHtml = svgMap[icon] ? svgMap[icon] : (icon && icon.startsWith('<svg') ? icon : `<span style="font-size:40px;line-height:1">${icon}</span>`);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${iconHtml}</div>
        <div class="empty-state-title">${title}</div>
        ${desc ? `<div class="empty-state-desc">${desc}</div>` : ''}
      </div>`;
  },

  // Status pill HTML helper
  statusPill(status) {
    const cls = this.statusClass(status);
    const label = this.statusLabel(status);
    return `<span class="status-pill status-pill--${cls}"><span class="status-pill__dot"></span>${label}</span>`;
  },

  // Format model name nicely
  formatModel(model) {
    if (!model || model === 'N/A') return 'Unknown model';
    return model;
  }
};
