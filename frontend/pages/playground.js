/* AgentBoard — Agent Playground Chat Page */
window.Pages = window.Pages || {};

Pages.playground = {
  _agents: [],
  _selectedAgent: null,
  _messages: {},
  _loading: false,

  async render(container) {
    container.innerHTML = '<div style="display:flex;height:calc(100vh - 80px);gap:0">' +
      '<div id="pgAgentList" style="width:240px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--bg-secondary);padding:8px">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text-primary);padding:8px 8px 12px">Agents</div>' +
        '<div class="loading-state"><div class="spinner"></div></div>' +
      '</div>' +
      '<div id="pgChatArea" style="flex:1;display:flex;flex-direction:column;min-width:0">' +
        '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:14px">Select an agent to start chatting</div>' +
      '</div>' +
    '</div>';
    await this._loadAgents();
  },

  destroy() {},

  async _loadAgents() {
    try {
      this._agents = await apiFetch('/api/agents') || [];
      this._renderAgentList();
    } catch(e) {
      document.getElementById('pgAgentList').innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:12px">Failed to load agents</div>';
    }
  },

  _renderAgentList() {
    var el = document.getElementById('pgAgentList');
    if (!el) return;
    var statusColors = { online:'#22c55e', busy:'#f59e0b', idle:'#6366f1', offline:'#6b7280' };
    var self = this;
    el.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--text-primary);padding:8px 8px 12px">Agents</div>' +
      this._agents.map(function(a) {
        var id = a.id || a.name;
        var sc = statusColors[a.status] || '#6b7280';
        var selected = self._selectedAgent && (self._selectedAgent.id||self._selectedAgent.name) === id;
        return '<div style="padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:2px;display:flex;align-items:center;gap:8px;font-size:13px;' +
          (selected ? 'background:var(--bg-elevated);' : '') + '" ' +
          'onmouseover="this.style.background=\'var(--bg-elevated)\'" onmouseout="this.style.background=\'' + (selected?'var(--bg-elevated)':'') + '\'" ' +
          'onclick="Pages.playground._selectAgent(\'' + Utils.esc(id) + '\')">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:'+sc+';flex-shrink:0"></span>' +
          '<span style="color:var(--text-primary)">' + Utils.esc(a.emoji||'🤖') + ' ' + Utils.esc(a.name||a.id) + '</span>' +
        '</div>';
      }).join('');
  },

  _selectAgent(id) {
    this._selectedAgent = this._agents.find(function(a){ return (a.id||a.name) === id; });
    this._renderAgentList();
    // Load messages from localStorage
    var key = 'pg-chat-' + id;
    try { this._messages[id] = JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) { this._messages[id] = []; }
    this._renderChat();
  },

  _renderChat() {
    var el = document.getElementById('pgChatArea');
    if (!el || !this._selectedAgent) return;
    var agent = this._selectedAgent;
    var id = agent.id || agent.name;
    var msgs = this._messages[id] || [];
    el.innerHTML = '<div style="padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;font-size:14px;color:var(--text-primary)">' +
        Utils.esc(agent.emoji||'🤖') + ' ' + Utils.esc(agent.name||id) +
      '</div>' +
      '<div id="pgMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px">' +
        (msgs.length ? msgs.map(function(m) {
          var isUser = m.role === 'user';
          return '<div style="display:flex;justify-content:' + (isUser?'flex-end':'flex-start') + '">' +
            '<div style="max-width:70%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;' +
              (isUser ? 'background:var(--accent,#6366f1);color:#fff;border-bottom-right-radius:4px' : 'background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-bottom-left-radius:4px') + '">' +
              Utils.esc(m.content) +
            '</div></div>';
        }).join('') : '<div style="color:var(--text-tertiary);font-size:13px;text-align:center;margin-top:40px">No messages yet. Say hello!</div>') +
      '</div>' +
      '<div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px">' +
        '<input class="input" id="pgInput" type="text" placeholder="Type a message..." style="flex:1;box-sizing:border-box" onkeydown="if(event.key===\'Enter\')Pages.playground._send()">' +
        '<button class="btn-primary" id="pgSendBtn" onclick="Pages.playground._send()">Send</button>' +
      '</div>';
    var msgArea = document.getElementById('pgMessages');
    if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
  },

  async _send() {
    if (this._loading || !this._selectedAgent) return;
    var input = document.getElementById('pgInput');
    var msg = (input.value||'').trim();
    if (!msg) return;
    var id = this._selectedAgent.id || this._selectedAgent.name;
    if (!this._messages[id]) this._messages[id] = [];
    this._messages[id].push({ role:'user', content:msg });
    input.value = '';
    this._renderChat();
    this._loading = true;
    document.getElementById('pgSendBtn').disabled = true;
    try {
      var resp = await apiFetch('/api/agents/' + id + '/message', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message:msg })
      });
      var reply = resp.response || resp.message || resp.content || JSON.stringify(resp);
      this._messages[id].push({ role:'agent', content:reply });
    } catch(e) {
      this._messages[id].push({ role:'agent', content:'Error: ' + e.message });
    }
    this._loading = false;
    localStorage.setItem('pg-chat-' + id, JSON.stringify(this._messages[id].slice(-50)));
    this._renderChat();
    document.getElementById('pgSendBtn').disabled = false;
  }
};
