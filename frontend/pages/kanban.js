/* AgentBoard — Kanban Board Page */

window.Pages = window.Pages || {};

Pages.kanban = {
  _tasks: {},
  _agents: [],
  _draggedTask: null,
  _draggedFrom: null,
  _filterAgent: '',
  _filterPriority: '',
  _filterTeam: '',
  _searchQuery: '',
  _wsHandlers: [],

  COLUMNS: [
    { id: 'backlog',  label: 'Backlog' },
    { id: 'todo',     label: 'To Do' },
    { id: 'progress', label: 'In Progress' },
    { id: 'review',   label: 'Review' },
    { id: 'done',     label: 'Done' },
  ],

  async render(container) {
    container.innerHTML = `
      <div class="kanban-filters">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input class="input" type="text" placeholder="Search tasks..." id="kanbanSearch"
            oninput="Pages.kanban._onSearch(this.value)">
        </div>
        <select class="select" id="kanbanFilterAgent" onchange="Pages.kanban._onFilter('agent', this.value)">
          <option value="">Agent ▾</option>
        </select>
        <select class="select" id="kanbanFilterPriority" onchange="Pages.kanban._onFilter('priority', this.value)">
          <option value="">Priority ▾</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select class="select" id="kanbanFilterTeam" onchange="Pages.kanban._onFilter('team', this.value)">
          <option value="">Team ▾</option>
        </select>
        <button class="btn-primary" onclick="Pages.kanban._newTask()" style="margin-left:auto">+ New Task</button>
      </div>

      <div class="kanban-board" id="kanbanBoard">
        ${this.COLUMNS.map(col => `
          <div class="kanban-column" id="col-${col.id}" data-status="${col.id}">
            <div class="kanban-column__header">
              <span class="kanban-column__title">${col.label}</span>
              <span class="kanban-column__count" id="count-${col.id}">0</span>
            </div>
            <div class="kanban-column__body" id="tasks-${col.id}"
              ondragover="Pages.kanban._onDragOver(event, '${col.id}')"
              ondragleave="Pages.kanban._onDragLeave(event)"
              ondrop="Pages.kanban._onDrop(event, '${col.id}')">
              <div class="loading-state"><div class="spinner"></div></div>
            </div>
          </div>`).join('')}
      </div>

      <!-- New Task Modal -->
      <div id="taskModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:300;align-items:center;justify-content:center">
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:12px;padding:24px;width:480px;max-width:95vw;max-height:85vh;overflow-y:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <span style="font:600 var(--text-lg)/24px var(--font-body);color:var(--text-primary)">New Task</span>
            <button class="btn-icon" onclick="Pages.kanban._closeModal()">✕</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div>
              <label style="font:500 var(--text-sm)/18px var(--font-body);color:var(--text-secondary);display:block;margin-bottom:6px">Title</label>
              <input class="input" id="newTaskTitle" placeholder="Task title..." style="width:100%">
            </div>
            <div>
              <label style="font:500 var(--text-sm)/18px var(--font-body);color:var(--text-secondary);display:block;margin-bottom:6px">Description</label>
              <textarea class="input" id="newTaskDesc" rows="3" placeholder="Description..."
                style="width:100%;height:auto;padding-top:8px;resize:vertical"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label style="font:500 var(--text-sm)/18px var(--font-body);color:var(--text-secondary);display:block;margin-bottom:6px">Priority</label>
                <select class="select" id="newTaskPriority" style="width:100%">
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label style="font:500 var(--text-sm)/18px var(--font-body);color:var(--text-secondary);display:block;margin-bottom:6px">Status</label>
                <select class="select" id="newTaskStatus" style="width:100%">
                  ${this.COLUMNS.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label style="font:500 var(--text-sm)/18px var(--font-body);color:var(--text-secondary);display:block;margin-bottom:6px">Assign to</label>
              <select class="select" id="newTaskAgent" style="width:100%">
                <option value="">Unassigned</option>
              </select>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
              <button class="btn-secondary" onclick="Pages.kanban._closeModal()">Cancel</button>
              <button class="btn-primary" onclick="Pages.kanban._submitTask()">Create Task</button>
            </div>
          </div>
        </div>
      </div>`;

    await this._loadAll();

    // WS updates
    const taskHandler = () => this._loadTasks();
    WS.on('task_updated', taskHandler);
    WS.on('task_created', taskHandler);
    WS.on('task_deleted', taskHandler);
    this._wsHandlers.push(['task_updated', taskHandler], ['task_created', taskHandler], ['task_deleted', taskHandler]);
  },

  async _loadAll() {
    await Promise.all([this._loadAgents(), this._loadTasks()]);
  },

  async _loadAgents() {
    try {
      this._agents = await API.getAgents();
      const agentSel = document.getElementById('kanbanFilterAgent');
      const newTaskAgent = document.getElementById('newTaskAgent');
      const teamSel = document.getElementById('kanbanFilterTeam');

      const teams = new Set();

      this._agents.forEach(a => {
        const name = a.name || a.displayName || a.id;
        if (agentSel) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `${a.emoji || '🤖'} ${name}`;
          agentSel.appendChild(opt);
        }
        if (newTaskAgent) {
          const opt = document.createElement('option');
          opt.value = a.id || name;
          opt.textContent = `${a.emoji || '🤖'} ${name}`;
          newTaskAgent.appendChild(opt);
        }
        if (a.team) teams.add(a.team);
      });

      if (teamSel) {
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          teamSel.appendChild(opt);
        });
      }
    } catch (_) {}
  },

  async _loadTasks() {
    try {
      const tasks = await API.getTasks();
      this._tasks = {};
      this.COLUMNS.forEach(c => { this._tasks[c.id] = []; });

      tasks.forEach(t => {
        const col = t.status || 'backlog';
        if (!this._tasks[col]) this._tasks[col] = [];
        this._tasks[col].push(t);
      });

      this._renderAll();
    } catch (e) {
      console.error('Kanban load error:', e);
    }
  },

  _renderAll() {
    this.COLUMNS.forEach(col => {
      this._renderColumn(col.id);
    });
  },

  _renderColumn(colId) {
    const body = document.getElementById(`tasks-${colId}`);
    const countEl = document.getElementById(`count-${colId}`);
    if (!body) return;

    let tasks = this._tasks[colId] || [];
    tasks = this._applyFilters(tasks);

    if (countEl) countEl.textContent = tasks.length;

    if (tasks.length === 0) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No tasks</div>`;
      return;
    }

    body.innerHTML = tasks.map(t => this._taskCardHTML(t)).join('');

    // Setup draggable
    body.querySelectorAll('.task-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => this._onDragStart(e, card.dataset.taskId, colId));
      card.addEventListener('dragend', () => this._onDragEnd());
    });
  },

  _applyFilters(tasks) {
    return tasks.filter(t => {
      if (this._searchQuery) {
        const q = this._searchQuery.toLowerCase();
        if (!(t.title || '').toLowerCase().includes(q) &&
            !(t.description || '').toLowerCase().includes(q)) return false;
      }
      if (this._filterAgent) {
        if ((t.assignee || t.assigned_to || t.assignedTo || '') !== this._filterAgent) return false;
      }
      if (this._filterPriority) {
        if ((t.priority || '').toLowerCase() !== this._filterPriority) return false;
      }
      // team filter: direct task.team or via assignee agent lookup
      if (this._filterTeam) {
        const taskTeam = (t.team || '').toLowerCase();
        if (taskTeam === this._filterTeam.toLowerCase()) return true;
        const assignee = t.assignee || t.assigned_to || t.assignedTo || '';
        const agent = this._agents.find(a => (a.id === assignee || a.name === assignee));
        if (!agent || (agent.team || '').toLowerCase() !== this._filterTeam.toLowerCase()) return false;
      }
      return true;
    });
  },

  _taskCardHTML(t) {
    const priority = (t.priority || 'medium').toLowerCase();
    const assignee = t.assignee || t.assigned_to || t.assignedTo || '';
    const agent = this._agents.find(a => a.id === assignee || a.name === assignee);
    const emoji = agent ? (agent.emoji || '🤖') : null;
    const tags = t.labels ? (Array.isArray(t.labels) ? t.labels : [t.labels]) : [];

    return `
      <div class="task-card" data-task-id="${Utils.esc(t.id)}" draggable="true">
        <div class="task-card__title">${Utils.esc(t.title || 'Untitled')}</div>
        <div class="task-card__meta">
          ${emoji ? `<span>${Utils.esc(emoji)} ${Utils.esc(agent?.name || assignee)}</span>` : assignee ? `<span>👤 ${Utils.esc(assignee)}</span>` : ''}
          ${priority ? `<span class="${Utils.priorityClass(priority)}">${Utils.capitalize(priority)}</span>` : ''}
          ${t.estimate ? `<span>⏱ ${Utils.esc(t.estimate)}</span>` : ''}
        </div>
        ${tags.length ? `<div class="task-card__tags">${tags.map(tag => `<span class="task-card__tag">#${Utils.esc(tag)}</span>`).join('')}</div>` : ''}
      </div>`;
  },

  /* ─── Drag & Drop ─── */
  _onDragStart(e, taskId, fromCol) {
    this._draggedTask = taskId;
    this._draggedFrom = fromCol;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setTimeout(() => e.target.classList.add('dragging'), 0);
  },

  _onDragEnd() {
    document.querySelectorAll('.task-card.dragging').forEach(c => c.classList.remove('dragging'));
    document.querySelectorAll('.kanban-column__body.drag-over').forEach(c => c.classList.remove('drag-over'));
    this._draggedTask = null;
    this._draggedFrom = null;
  },

  _onDragOver(e, colId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const body = document.getElementById(`tasks-${colId}`);
    if (body) body.classList.add('drag-over');
  },

  _onDragLeave(e) {
    const body = e.currentTarget;
    if (body) body.classList.remove('drag-over');
  },

  async _onDrop(e, toCol) {
    e.preventDefault();
    const body = document.getElementById(`tasks-${toCol}`);
    if (body) body.classList.remove('drag-over');

    const taskId = this._draggedTask;
    const fromCol = this._draggedFrom;
    if (!taskId || fromCol === toCol) return;

    try {
      // Optimistic update
      const fromList = this._tasks[fromCol] || [];
      const taskIdx = fromList.findIndex(t => String(t.id) === String(taskId));
      if (taskIdx === -1) return;

      const [task] = fromList.splice(taskIdx, 1);
      task.status = toCol;
      if (!this._tasks[toCol]) this._tasks[toCol] = [];
      this._tasks[toCol].push(task);
      this._renderAll();

      // API call
      await API.transitionTask(taskId, toCol);
    } catch (e) {
      console.error('Task transition failed:', e);
      await this._loadTasks(); // Revert
    }
  },

  /* ─── Filters ─── */
  _onSearch(val) {
    this._searchQuery = val;
    this._renderAll();
  },

  _onFilter(type, val) {
    if (type === 'agent') this._filterAgent = val;
    if (type === 'priority') this._filterPriority = val;
    if (type === 'team') this._filterTeam = val;
    this._renderAll();
  },

  /* ─── New Task Modal ─── */
  _newTask() {
    const modal = document.getElementById('taskModal');
    if (modal) modal.style.display = 'flex';
  },

  _closeModal() {
    const modal = document.getElementById('taskModal');
    if (modal) modal.style.display = 'none';
  },

  async _submitTask() {
    const title = document.getElementById('newTaskTitle')?.value?.trim();
    if (!title) { alert('Title is required'); return; }

    const data = {
      title,
      description: document.getElementById('newTaskDesc')?.value || '',
      priority: document.getElementById('newTaskPriority')?.value || 'medium',
      status: document.getElementById('newTaskStatus')?.value || 'todo',
      assignee: document.getElementById('newTaskAgent')?.value || null,
    };

    try {
      await API.createTask(data);
      this._closeModal();
      await this._loadTasks();

      // Reset form
      ['newTaskTitle', 'newTaskDesc'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    } catch (e) {
      alert('Failed to create task: ' + e.message);
    }
  },

  destroy() {
    this._wsHandlers.forEach(([ev, fn]) => WS.off(ev, fn));
    this._wsHandlers = [];
  }
};
