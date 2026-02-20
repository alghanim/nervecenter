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

  // Show empty state
  showEmpty(container, icon, title, desc = '') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <div class="empty-state-title">${title}</div>
        ${desc ? `<div class="empty-state-desc">${desc}</div>` : ''}
      </div>`;
  },

  // Format model name nicely
  formatModel(model) {
    if (!model || model === 'N/A') return 'Unknown model';
    return model;
  }
};
