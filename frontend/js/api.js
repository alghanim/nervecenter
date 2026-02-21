/* AgentBoard — API Layer */

const API_BASE = window.AGENTBOARD_API || '';

window.apiFetch = async function apiFetch(path, options = {}) {
  // Inject auth token for write requests
  const isWrite = options.method && options.method !== 'GET';
  if (isWrite && window.Auth) {
    const token = Auth.getToken();
    if (token) {
      options.headers = Object.assign({}, options.headers, {
        'Authorization': 'Bearer ' + token
      });
    }
  }

  const res = await fetch(API_BASE + path, options);

  // On 401 for write requests, show login modal then retry
  if (res.status === 401 && isWrite && window.Auth) {
    return Auth.handle401(() => apiFetch(path, options));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
};

// Live agents (openclaw status)
window.API = {
  getAgents: () => apiFetch('/api/openclaw/agents'),
  getStats: () => apiFetch('/api/openclaw/stats'),
  getStream: (limit = 30) => apiFetch(`/api/openclaw/stream?limit=${limit}`),
  getStructure: () => apiFetch('/api/structure'),
  getTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/tasks' + (qs ? '?' + qs : ''));
  },
  getTask: (id) => apiFetch(`/api/tasks/${id}`),
  createTask: (data) => apiFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  updateTask: (id, data) => apiFetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  transitionTask: (id, status) => apiFetch(`/api/tasks/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  }),
  getActivity: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/activity' + (qs ? '?' + qs : ''));
  },
  getAgentSoul: (id) => apiFetch(`/api/agents/${id}/soul`),
  updateAgentSoul: (id, file, content) => apiFetch(`/api/agents/${id}/soul`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, content })
  }),
  getAgentTimeline: (id, hours = 24) => apiFetch(`/api/agents/${id}/timeline?hours=${hours}`),
  getAgentSkills: (id) => apiFetch(`/api/agents/${id}/skills`),
  getStreamFiltered: (agentId, limit = 50) => apiFetch(`/api/openclaw/stream?agent_id=${encodeURIComponent(agentId)}&limit=${limit}`),
  getDashboardStats: () => apiFetch('/api/dashboard/stats'),

  // Branding
  getBranding: () => apiFetch('/api/branding'),

  // Comments
  getComments: (taskId) => apiFetch(`/api/tasks/${taskId}/comments`),
  addComment: (taskId, text) => apiFetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  }),

  // Stuck tasks
  getStuckTasks: () => apiFetch('/api/tasks/stuck'),

  // Task history
  getTaskHistory: (id) => apiFetch(`/api/tasks/${id}/history`),

  // Search
  search: (q, limit = 20) => apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Analytics
  getAnalyticsThroughput: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/analytics/throughput' + (qs ? '?' + qs : ''));
  },
  getAnalyticsAgents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/analytics/agents' + (qs ? '?' + qs : ''));
  },
  getPerformance: () => apiFetch('/api/analytics/performance'),

  exportCSV: () => {
    const a = document.createElement('a');
    a.href = (window.AGENTBOARD_API || '') + '/api/analytics/export/csv';
    a.download = 'agentboard-export.csv';
    a.click();
  },

  // Agent controls
  pauseAgent: (id) => apiFetch(`/api/agents/${id}/pause`, { method: 'POST' }),
  resumeAgent: (id) => apiFetch(`/api/agents/${id}/resume`, { method: 'POST' }),
  killAgent: (id) => apiFetch(`/api/agents/${id}/kill`, { method: 'POST' }),

  // Webhooks
  getWebhooks: () => apiFetch('/api/webhooks'),
  createWebhook: (data) => apiFetch('/api/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateWebhook: (id, data) => apiFetch(`/api/webhooks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteWebhook: (id) => apiFetch(`/api/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id) => apiFetch(`/api/webhooks/${id}/test`, { method: 'POST' }),

  // Errors & Failures
  getErrors: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/errors' + (qs ? '?' + qs : ''));
  },
  getErrorsSummary: () => apiFetch('/api/errors/summary'),

  // Logs Viewer
  getLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/logs' + (qs ? '?' + qs : ''));
  },
  searchLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/logs/search' + (qs ? '?' + qs : ''));
  },
  getLogFiles: () => apiFetch('/api/logs/files'),

  // Token & Cost Analytics
  getTokenUsage: () => apiFetch('/api/analytics/tokens'),
  getTokenTimeline: (days, agent) => {
    const p = new URLSearchParams();
    if (days)  p.set('days',  days);
    if (agent) p.set('agent', agent);
    return apiFetch('/api/analytics/tokens/timeline?' + p);
  },
  getCostSummary: () => apiFetch('/api/analytics/cost/summary'),

  // Alerts
  getAlertRules: () => apiFetch('/api/alerts/rules'),
  createAlertRule: (data) => apiFetch('/api/alerts/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  updateAlertRule: (id, data) => apiFetch(`/api/alerts/rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteAlertRule: (id) => apiFetch(`/api/alerts/rules/${id}`, { method: 'DELETE' }),
  getAlertHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/alerts/history' + (qs ? '?' + qs : ''));
  },
  acknowledgeAlert: (id) => apiFetch(`/api/alerts/history/${id}/acknowledge`, { method: 'POST' }),
  getAlertUnacknowledgedCount: () => apiFetch('/api/alerts/unacknowledged-count'),

  // Dependency Graph
  getGraphDependencies: () => apiFetch('/api/graph/dependencies'),

  // Audit Log
  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/api/audit' + (qs ? '?' + qs : ''));
  },

  // Efficiency Scores & Latency Metrics
  getEfficiencyScores: () => apiFetch('/api/metrics/efficiency'),
  getLatencyMetrics: () => apiFetch('/api/metrics/latency'),

  // Git Commits
  getAgentCommits: (agentId, limit = 10) =>
    apiFetch(`/api/agents/${encodeURIComponent(agentId)}/commits?limit=${limit}`),

  // Auth
  authLogin: (password) => apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  }),
  authMe: () => apiFetch('/api/auth/me'),

  // Annotations (shared notes on agents)
  getAnnotations: (agentId) => apiFetch(`/api/agents/${encodeURIComponent(agentId)}/annotations`),
  addAnnotation: (agentId, content, author) => apiFetch(`/api/agents/${encodeURIComponent(agentId)}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, author: author || 'ali' })
  }),
  deleteAnnotation: (agentId, annId) => apiFetch(`/api/agents/${encodeURIComponent(agentId)}/annotations/${annId}`, {
    method: 'DELETE'
  }),

  // Agent Health
  getAgentHealth: (id) => apiFetch(`/api/agents/${encodeURIComponent(id)}/health`),
  forceHealthCheck: (id) => apiFetch(`/api/agents/${encodeURIComponent(id)}/health/check`, { method: 'POST' }),
  setAutoRestart: (id, enabled) => apiFetch(`/api/agents/${encodeURIComponent(id)}/health/auto-restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  }),

  // Cost Forecast
  getCostForecast: () => apiFetch('/api/metrics/cost-forecast'),

  // Environments
  getEnvironments: () => apiFetch('/api/environments'),
  addEnvironment: (name, url) => apiFetch('/api/environments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url })
  }),
  switchEnvironment: (url) => apiFetch('/api/environments/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }),
  deleteEnvironment: (url) => apiFetch('/api/environments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }),

  // API Docs
  getAPIDocs: () => apiFetch('/api/docs'),

  // Snapshots
  getSnapshots: (agentId) => apiFetch(`/api/agents/${encodeURIComponent(agentId)}/snapshots`),
  createSnapshot: (agentId, label) => apiFetch(`/api/agents/${encodeURIComponent(agentId)}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: label || '' }),
  }),
  restoreSnapshot: (agentId, snapshotId) => apiFetch(
    `/api/agents/${encodeURIComponent(agentId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    { method: 'POST' }
  ),

  // Custom Dashboards (builder)
  getDashboards: () => apiFetch('/api/dashboards'),
  getDashboard: (id) => apiFetch(`/api/dashboards/${encodeURIComponent(id)}`),
  createDashboard: (name, widgets) => apiFetch('/api/dashboards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, widgets: widgets || [] })
  }),
  updateDashboard: (id, data) => apiFetch(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteDashboard: (id) => apiFetch(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),
};
