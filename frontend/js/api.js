/* AgentBoard — API Layer */

const API_BASE = window.AGENTBOARD_API || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

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
  getDashboardStats: () => apiFetch('/api/dashboard/stats'),
};
