/* AgentBoard — Direct Agent Messaging Page */

window.Pages = window.Pages || {};

Pages.messaging = {
  _agents: [],
  _selectedAgent: null,
  _tasks: [],
  _expandedTasks: new Set(),
  _wsHandlers: [],
  _refreshTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="messaging-layout" style="
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 0;
        height: calc(100vh - 64px);
        overflow: hidden;
      ">
        <!-- Left panel: agent list -->
        <div class="messaging-sidebar" style="
          border-right: 1px solid var(--border-default);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-secondary);
        ">
          <div style="
            padding: 16px;
            border-bottom: 1px solid var(--border-default);
            flex-shrink: 0;
          ">
            <span style="font: 600 var(--text-sm)/20px var(--font-body); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">Agents</span>
          </div>
          <div id="msgAgentList" style="flex: 1; overflow-y: auto; padding: 8px 0;">
            <div class="loading-state"><div class="spinner"></div><span>Loading agents...</span></div>
          </div>
        </div>

        <!-- Right panel: message compose + task history -->
        <div class="messaging-main" style="
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-primary);
        ">
          <div id="msgCompose" style="flex-shrink: 0; border-bottom: 1px solid var(--border-default);">
            <div style="padding: 40px 40px 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary);">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="margin-bottom:12px; opacity:0.4">
                <path d="M6 6h28a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H12l-8 6V8a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div style="font: 500 var(--text-sm)/20px var(--font-body);">Select an agent to send a message</div>
            </div>
          </div>
          <div id="msgTaskList" style="flex: 1; overflow-y: auto; padding: 24px;"></div>
        </div>
      </div>
    `;

    await this._loadAgents();

    const handler = () => {
      if (this._selectedAgent) this._loadTasks(this._selectedAgent);
    };
    WS.on('task_created', handler);
    WS.on('task_updated', handler);
    this._wsHandlers.push(['task_created', handler], ['task_updated', handler]);

    this._refreshTimer = setInterval(() => {
      if (this._selectedAgent) this._loadTasks(this._selectedAgent);
    }, 30000);
  },

  async _loadAgents() {
    const el = document.getElementById('msgAgentList');
    if (!el) return;
    try {
      this._agents = await API.getAgents();
      this._renderAgentList();
    } catch (e) {
      el.innerHTML = `<div class="empty-state-desc" style="padding:16px;color:var(--text-tertiary)">Failed to load agents</div>`;
    }
  },

  _renderAgentList() {
    const el = document.getElementById('msgAgentList');
    if (!el) return;

    if (!this._agents || this._agents.length === 0) {
      el.innerHTML = `<div class="empty-state-desc" style="padding:16px;color:var(--text-tertiary)">No agents found</div>`;
      return;
    }

    const sorted = [...this._agents].sort((a, b) => {
      const order = { active: 0, idle: 1, offline: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    el.innerHTML = sorted.map(agent => {
      const agentId = agent.id || agent.name;
      const isSelected = this._selectedAgent && (this._selectedAgent.id || this._selectedAgent.name) === agentId;
      const statusCls = Utils.statusClass(agent.status);
      const dotColor = statusCls === 'online' ? 'var(--success)' : statusCls === 'busy' ? 'var(--warning)' : 'var(--text-tertiary)';

      return `
        <div class="msg-agent-item" data-agent-id="${Utils.esc(agentId)}"
          onclick="Pages.messaging._selectAgent('${Utils.esc(agentId)}')"
          style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            cursor: pointer;
            border-radius: 8px;
            margin: 2px 8px;
            background: ${isSelected ? 'var(--accent-muted)' : 'transparent'};
            border: 1px solid ${isSelected ? 'var(--accent)' : 'transparent'};
            transition: background 0.15s, border-color 0.15s;
          "
          onmouseenter="this.style.background='${isSelected ? 'var(--accent-muted)' : 'var(--bg-elevated)'}'"
          onmouseleave="this.style.background='${isSelected ? 'var(--accent-muted)' : 'transparent'}'"
        >
          <span style="font-size:20px;flex-shrink:0;">${Utils.esc(agent.emoji || '🤖')}</span>
          <span style="font: 500 var(--text-sm)/20px var(--font-body); color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${Utils.esc(agent.name || agent.displayName || agentId)}
          </span>
          <span style="
            width: 8px; height: 8px; border-radius: 50%;
            background: ${dotColor};
            flex-shrink: 0;
            box-shadow: 0 0 0 2px var(--bg-secondary);
          "></span>
        </div>`;
    }).join('');
  },

  _selectAgent(agentId) {
    const agent = this._agents.find(a => (a.id || a.name) === agentId);
    if (!agent) return;
    this._selectedAgent = agent;
    this._renderAgentList();
    this._renderCompose(agent);
    this._loadTasks(agent);
  },

  _renderCompose(agent) {
    const el = document.getElementById('msgCompose');
    if (!el) return;

    const agentId = agent.id || agent.name;

    el.innerHTML = `
      <div style="padding: 20px 24px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
          <span style="font-size: 22px;">${Utils.esc(agent.emoji || '🤖')}</span>
          <div>
            <div style="font: 600 var(--text-md)/22px var(--font-body); color: var(--text-primary);">
              ${Utils.esc(agent.name || agent.displayName || agentId)}
            </div>
            <div style="font: 400 var(--text-xs)/16px var(--font-body); color: var(--text-tertiary);">
              ${Utils.esc(agent.role || agent.team || '')}
              ${agent.team ? `<span style="margin-left:6px;padding:2px 8px;border-radius:4px;font-size:11px;${Utils.teamBadgeStyle(agent)}">${Utils.esc(agent.team)}</span>` : ''}
            </div>
          </div>
          <div style="margin-left:auto;">${Utils.statusPill(agent.status)}</div>
        </div>

        <div style="display: flex; gap: 10px; align-items: flex-end;">
          <textarea
            id="msgTextarea"
            class="input"
            rows="2"
            placeholder="Type a message or instruction for ${Utils.esc(agent.name || agentId)}..."
            style="flex: 1; resize: none; min-height: 64px; max-height: 180px; font-family: var(--font-body);"
            onkeydown="Pages.messaging._onTextareaKey(event)"
          ></textarea>
          <button
            class="btn-primary"
            onclick="Pages.messaging._sendMessage()"
            id="msgSendBtn"
            style="flex-shrink: 0; height: 64px; padding: 0 20px; display: flex; align-items: center; gap: 6px;"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M12.5 1.5L1 6l5 2 1.5 5L12.5 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
            Send
          </button>
        </div>
        <div style="margin-top:6px; font-size:11px; color:var(--text-tertiary);">
          Creates a high-priority task assigned to this agent. Press Ctrl+Enter to send.
        </div>
      </div>
    `;
  },

  _onTextareaKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this._sendMessage();
    }
  },

  async _sendMessage() {
    if (!this._selectedAgent) return;

    const textarea = document.getElementById('msgTextarea');
    const sendBtn = document.getElementById('msgSendBtn');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      return;
    }

    const agent = this._selectedAgent;
    const agentId = agent.id || agent.name;

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Sending...`;
    }

    try {
      const task = await API.createTask({
        title: `Direct message from user`,
        description: text,
        assignee: agentId,
        priority: 'high',
        status: 'todo',
        team: agent.team || '',
      });

      // Also post a comment mentioning the agent
      if (task && task.id) {
        try {
          await API.addComment(task.id, `@${agentId} — ${text}`);
        } catch (_) { /* non-fatal */ }
      }

      textarea.value = '';
      textarea.style.height = '';

      // Briefly show success
      if (sendBtn) {
        sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 7.5L5 11L12.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Sent!`;
        setTimeout(() => {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.5 1.5L1 6l5 2 1.5 5L12.5 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Send`;
          }
        }, 1500);
      }

      // Reload task list
      await this._loadTasks(agent);

    } catch (e) {
      console.error('Failed to send message:', e);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.5 1.5L1 6l5 2 1.5 5L12.5 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Send`;
      }
      alert('Failed to send message: ' + e.message);
    }
  },

  async _loadTasks(agent) {
    const el = document.getElementById('msgTaskList');
    if (!el) return;

    const agentId = agent.id || agent.name;

    try {
      const tasks = await API.getTasks({ assignee: agentId, limit: 10 });
      this._tasks = Array.isArray(tasks) ? tasks : (tasks.tasks || []);
      this._renderTaskList(el);
    } catch (e) {
      el.innerHTML = `<div class="empty-state-desc" style="color:var(--text-tertiary)">Failed to load tasks</div>`;
    }
  },

  _renderTaskList(el) {
    if (!el) return;

    if (!this._tasks || this._tasks.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 40px;">
          <div class="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="6" width="32" height="38" rx="3" stroke="currentColor" stroke-width="2"/>
              <line x1="16" y1="18" x2="32" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="16" y1="26" x2="32" y2="26" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="16" y1="34" x2="24" y2="34" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="empty-state-title">No tasks yet</div>
          <div class="empty-state-desc">Messages you send will appear here as tasks</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="margin-bottom: 12px;">
        <span style="font: 600 var(--text-sm)/20px var(--font-body); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">
          Recent Tasks (${this._tasks.length})
        </span>
      </div>
      <div id="msgTaskCards">
        ${this._tasks.map(task => this._renderTaskCard(task)).join('')}
      </div>`;
  },

  _renderTaskCard(task) {
    const isExpanded = this._expandedTasks.has(task.id);
    const statusColors = {
      todo: 'var(--text-tertiary)',
      backlog: 'var(--text-tertiary)',
      progress: 'var(--accent)',
      review: 'var(--warning)',
      done: 'var(--success)',
    };
    const statusLabels = {
      todo: 'To Do',
      backlog: 'Backlog',
      progress: 'In Progress',
      review: 'Review',
      done: 'Done',
    };
    const statusKey = (task.status || 'todo').toLowerCase();
    const statusColor = statusColors[statusKey] || 'var(--text-tertiary)';
    const statusLabel = statusLabels[statusKey] || Utils.capitalize(task.status || 'todo');

    const priorityColors = {
      critical: '#EF4444',
      high: '#F59E0B',
      medium: '#3B82F6',
      low: '#6B7280',
    };
    const priorityColor = priorityColors[(task.priority || '').toLowerCase()] || '#6B7280';

    return `
      <div class="msg-task-card" style="
        background: var(--bg-elevated);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        margin-bottom: 8px;
        overflow: hidden;
        transition: border-color 0.15s;
      ">
        <!-- Task header (always visible, clickable) -->
        <div onclick="Pages.messaging._toggleTask('${Utils.esc(String(task.id))}')" style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          cursor: pointer;
          user-select: none;
        "
          onmouseenter="this.parentElement.style.borderColor='var(--accent)'"
          onmouseleave="this.parentElement.style.borderColor='var(--border-default)'"
        >
          <!-- Status badge -->
          <span style="
            font: 600 10px/14px var(--font-mono);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: ${statusColor};
            background: ${statusColor}20;
            padding: 3px 8px;
            border-radius: 4px;
            flex-shrink: 0;
            min-width: 72px;
            text-align: center;
          ">${statusLabel}</span>

          <!-- Priority dot -->
          <span style="width:8px;height:8px;border-radius:50%;background:${priorityColor};flex-shrink:0;" title="${Utils.esc(task.priority || 'medium')} priority"></span>

          <!-- Title -->
          <span style="font: 500 var(--text-sm)/20px var(--font-body); color: var(--text-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${Utils.esc(task.title || 'Untitled')}
          </span>

          <!-- Timestamp -->
          <span style="font: 400 11px/16px var(--font-body); color: var(--text-tertiary); flex-shrink:0;">
            ${Utils.relTime(task.created_at || task.updatedAt || task.createdAt)}
          </span>

          <!-- Chevron -->
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;transition:transform 0.2s;transform:${isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'}">
            <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Expanded section -->
        ${isExpanded ? this._renderTaskExpanded(task) : ''}
      </div>`;
  },

  _renderTaskExpanded(task) {
    return `
      <div id="task-expanded-${Utils.esc(String(task.id))}" style="
        border-top: 1px solid var(--border-default);
        padding: 16px;
      ">
        ${task.description ? `
          <div style="
            font: 400 var(--text-sm)/20px var(--font-body);
            color: var(--text-secondary);
            margin-bottom: 16px;
            white-space: pre-wrap;
            word-break: break-word;
          ">${Utils.esc(task.description)}</div>` : ''}

        <!-- Comments section -->
        <div style="margin-bottom: 12px;">
          <span style="font: 600 var(--text-xs)/16px var(--font-body); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">Comments</span>
        </div>
        <div id="comments-${Utils.esc(String(task.id))}" style="margin-bottom: 12px;">
          <div class="loading-state" style="padding:8px 0;justify-content:flex-start;">
            <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
            <span style="font-size:12px;">Loading comments...</span>
          </div>
        </div>

        <!-- Add comment -->
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <textarea
            id="comment-input-${Utils.esc(String(task.id))}"
            class="input"
            rows="2"
            placeholder="Add a comment..."
            style="flex:1;resize:none;min-height:52px;font-family:var(--font-body);font-size:13px;"
            onkeydown="Pages.messaging._onCommentKey(event, '${Utils.esc(String(task.id))}')"
          ></textarea>
          <button
            class="btn-secondary"
            onclick="Pages.messaging._addComment('${Utils.esc(String(task.id))}')"
            style="height:52px;padding:0 14px;flex-shrink:0;"
          >Post</button>
        </div>
      </div>
    `;
  },

  async _toggleTask(taskId) {
    if (this._expandedTasks.has(taskId)) {
      this._expandedTasks.delete(taskId);
    } else {
      this._expandedTasks.add(taskId);
    }

    // Re-render task list
    const el = document.getElementById('msgTaskList');
    this._renderTaskList(el);

    // If we just expanded, load comments
    if (this._expandedTasks.has(taskId)) {
      await this._loadComments(taskId);
    }
  },

  async _loadComments(taskId) {
    const el = document.getElementById(`comments-${taskId}`);
    if (!el) return;

    try {
      const comments = await API.getComments(taskId);
      const list = Array.isArray(comments) ? comments : (comments.comments || []);
      this._renderComments(el, list, taskId);
    } catch (e) {
      el.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);">Failed to load comments</div>`;
    }
  },

  _renderComments(el, comments, taskId) {
    if (!comments || comments.length === 0) {
      el.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0;">No comments yet</div>`;
      return;
    }

    el.innerHTML = comments.map(c => `
      <div style="
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 8px 12px;
        margin-bottom: 6px;
        font-size: 13px;
        line-height: 1.5;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-weight:600;color:var(--text-secondary);font-size:12px;">
            ${Utils.esc(c.author || 'system')}
          </span>
          <span style="font-size:11px;color:var(--text-tertiary);">
            ${Utils.relTime(c.created_at || c.createdAt)}
          </span>
        </div>
        <div style="color:var(--text-primary);white-space:pre-wrap;word-break:break-word;">
          ${Utils.esc(c.text || c.content || '')}
        </div>
      </div>`).join('');
  },

  _onCommentKey(e, taskId) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this._addComment(taskId);
    }
  },

  async _addComment(taskId) {
    const input = document.getElementById(`comment-input-${taskId}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }

    const postBtn = input.nextElementSibling;
    if (postBtn) { postBtn.disabled = true; postBtn.textContent = '...'; }
    input.disabled = true;

    try {
      await API.addComment(taskId, text);
      input.value = '';
      // Reload comments
      const commentsEl = document.getElementById(`comments-${taskId}`);
      if (commentsEl) await this._loadComments(taskId);
    } catch (e) {
      alert('Failed to post comment: ' + e.message);
    } finally {
      input.disabled = false;
      if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'Post'; }
      input.focus();
    }
  },

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    this._selectedAgent = null;
    this._tasks = [];
    this._expandedTasks = new Set();
  },
};
