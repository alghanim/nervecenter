/* AgentBoard — Token & Cost Tracker Page */

window.Pages = window.Pages || {};

Pages.costs = {
  _days: 30,
  _agentFilter: '',
  _agentList: [],   // populated after first load
  _chartCleanup: null,

  /* ─── helpers ─── */
  _fmtUSD(v) {
    if (v == null || isNaN(v)) return '$0.00';
    if (v === 0)   return '$0.00';
    if (v < 0.01)  return '$' + Number(v).toFixed(4);
    if (v < 1)     return '$' + Number(v).toFixed(3);
    return '$' + Number(v).toFixed(2);
  },

  _fmtTokens(v) {
    if (v == null) return '0';
    v = Number(v);
    if (v >= 1e9)  return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6)  return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3)  return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  },

  _fmtTokensFull(v) {
    if (v == null) return '0';
    return Number(v).toLocaleString();
  },

  /* ─── render ─── */
  async render(container) {
    container.innerHTML = `
      <div class="costs-page" style="display:flex;flex-direction:column;gap:28px;">

        <!-- KPI Cards -->
        <div id="costsKpiGrid" class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));">
          <div class="kpi-card"><div class="kpi-spinner"><div class="spinner"></div></div></div>
          <div class="kpi-card"><div class="kpi-spinner"><div class="spinner"></div></div></div>
          <div class="kpi-card"><div class="kpi-spinner"><div class="spinner"></div></div></div>
          <div class="kpi-card"><div class="kpi-spinner"><div class="spinner"></div></div></div>
        </div>

        <!-- Per-Agent Table -->
        <div class="chart-card">
          <div class="chart-card__title">Per-Agent Token Usage</div>
          <div id="costsAgentTable" style="overflow-x:auto;">
            <div class="loading-state"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Timeline Chart with controls -->
        <div class="chart-card">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
            <div class="chart-card__title" style="margin-bottom:0;">Daily Cost Timeline</div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <!-- Agent filter -->
              <select id="costsAgentFilter" class="costs-select" style="
                background:var(--bg-inset,#12121e);
                color:var(--text-primary,#e5e7eb);
                border:1px solid var(--border-default,#2a2a3a);
                border-radius:8px;padding:5px 10px;
                font-size:13px;cursor:pointer;
              ">
                <option value="">All Agents</option>
              </select>
              <!-- Range picker -->
              <div class="range-picker" style="display:flex;gap:6px;">
                <button class="range-btn" data-days="7"  onclick="Pages.costs._setRange(7,this)">7d</button>
                <button class="range-btn active" data-days="30" onclick="Pages.costs._setRange(30,this)">30d</button>
                <button class="range-btn" data-days="90" onclick="Pages.costs._setRange(90,this)">90d</button>
              </div>
            </div>
          </div>
          <div id="costsTimelineChart" class="chart-area" style="min-height:260px;position:relative;"></div>
        </div>

      </div>`;

    // Agent filter change → reload timeline
    const filterEl = document.getElementById('costsAgentFilter');
    if (filterEl) {
      filterEl.addEventListener('change', () => {
        this._agentFilter = filterEl.value;
        this._loadTimeline();
      });
    }

    // Inject keyframe style once
    if (!document.getElementById('costsAnimStyle')) {
      const s = document.createElement('style');
      s.id = 'costsAnimStyle';
      s.textContent = `
        @keyframes fadeInKPI { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .costs-page .range-btn {
          background: var(--bg-inset, #12121e);
          color: var(--text-secondary, #9ca3af);
          border: 1px solid var(--border-default, #2a2a3a);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          cursor: pointer;
          transition: background 150ms, color 150ms;
        }
        .costs-page .range-btn.active,
        .costs-page .range-btn:hover {
          background: var(--accent, #B5CC18);
          color: #000;
          border-color: var(--accent, #B5CC18);
        }
        .costs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .costs-table th {
          text-align: left;
          padding: 10px 14px;
          color: var(--text-tertiary, #6b7280);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid var(--border-default, #2a2a3a);
          white-space: nowrap;
        }
        .costs-table td {
          padding: 11px 14px;
          color: var(--text-primary, #e5e7eb);
          border-bottom: 1px solid var(--border-default, #1e1e2e);
        }
        .costs-table tr:last-child td { border-bottom: none; }
        .costs-table tr:hover td { background: var(--bg-inset, #12121e); }
        .costs-table td.cost { color: #10b981; font-family: monospace; font-weight: 600; }
        .costs-table td.num  { font-family: monospace; color: var(--text-secondary, #9ca3af); }
        .costs-rank {
          display:inline-flex;align-items:center;justify-content:center;
          width:22px;height:22px;border-radius:50%;
          background:var(--bg-inset,#12121e);
          font-size:11px;color:var(--text-tertiary,#6b7280);
          margin-right:6px;font-weight:600;
        }
      `;
      document.head.appendChild(s);
    }

    await this._loadAll();
  },

  async _loadAll() {
    await Promise.all([
      this._loadKPIs(),
      this._loadAgentTable(),
      this._loadTimeline(),
    ]);
  },

  /* ─── Range picker ─── */
  _setRange(days, btn) {
    this._days = days;
    document.querySelectorAll('.costs-page .range-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this._loadTimeline();
  },

  /* ─── KPI Cards ─── */
  async _loadKPIs() {
    const grid = document.getElementById('costsKpiGrid');
    if (!grid) return;

    try {
      const summary = await API.getCostSummary();
      const s = summary || {};
      const week    = s.cost_this_week    ?? 0;
      const month   = s.cost_this_month   ?? 0;
      const allTime = s.cost_all_time     ?? 0;
      const tokens  = s.tokens_all_time   ?? 0;

      grid.innerHTML = `
        <div class="kpi-card" style="animation:fadeInKPI 200ms ease both;">
          <div class="kpi-label">Cost This Week</div>
          <div class="kpi-number" style="color:#10b981;font-size:1.8rem;">${this._fmtUSD(week)}</div>
        </div>
        <div class="kpi-card" style="animation:fadeInKPI 200ms ease 60ms both;">
          <div class="kpi-label">Cost This Month</div>
          <div class="kpi-number" style="color:#10b981;font-size:1.8rem;">${this._fmtUSD(month)}</div>
        </div>
        <div class="kpi-card" style="animation:fadeInKPI 200ms ease 120ms both;">
          <div class="kpi-label">All-Time Cost</div>
          <div class="kpi-number" style="color:#10b981;font-size:1.8rem;">${this._fmtUSD(allTime)}</div>
        </div>
        <div class="kpi-card" style="animation:fadeInKPI 200ms ease 180ms both;">
          <div class="kpi-label">All-Time Tokens</div>
          <div class="kpi-number" style="font-size:1.8rem;">${this._fmtTokens(tokens)}</div>
        </div>`;
    } catch (e) {
      const grid2 = document.getElementById('costsKpiGrid');
      if (grid2) grid2.innerHTML = `<div style="color:var(--danger,#ef4444);padding:16px;grid-column:1/-1;">Failed to load summary: ${Utils.esc(e.message)}</div>`;
    }
  },

  /* ─── Per-Agent Table ─── */
  async _loadAgentTable() {
    const el = document.getElementById('costsAgentTable');
    if (!el) return;

    try {
      const raw = await API.getTokenUsage();
      const data = Array.isArray(raw) ? raw : [];

      // Sort by cost descending
      const sorted = data.slice().sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));

      // Populate agent filter dropdown
      this._agentList = sorted;
      const filterEl = document.getElementById('costsAgentFilter');
      if (filterEl) {
        const current = this._agentFilter;
        filterEl.innerHTML = '<option value="">All Agents</option>' +
          sorted.map(a => {
            const id   = DOMPurify.sanitize(String(a.agent_id || ''));
            const name = DOMPurify.sanitize(String(a.name || a.agent_id || 'Unknown'));
            const sel  = id === current ? ' selected' : '';
            return `<option value="${id}"${sel}>${name}</option>`;
          }).join('');
      }

      if (sorted.length === 0) {
        el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-tertiary);">No token usage data yet</div>';
        return;
      }

      const rows = sorted.map((a, i) => {
        const name    = DOMPurify.sanitize(String(a.name || a.agent_id || 'Unknown'));
        const tokIn   = this._fmtTokensFull(a.tokens_in);
        const tokOut  = this._fmtTokensFull(a.tokens_out);
        const total   = this._fmtTokensFull(a.total_tokens);
        const cost    = this._fmtUSD(a.cost_usd || 0);
        const rankCls = i === 0 ? 'color:#f59e0b;' : i === 1 ? 'color:#9ca3af;' : i === 2 ? 'color:#b45309;' : '';
        return `
          <tr>
            <td>
              <span class="costs-rank" style="${rankCls}">${i + 1}</span>
              ${name}
            </td>
            <td class="num">${tokIn}</td>
            <td class="num">${tokOut}</td>
            <td class="num">${total}</td>
            <td class="cost">${cost}</td>
          </tr>`;
      }).join('');

      el.innerHTML = `
        <table class="costs-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Tokens In</th>
              <th>Tokens Out</th>
              <th>Total Tokens</th>
              <th>Cost (USD)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (e) {
      el.innerHTML = `<div style="color:var(--danger,#ef4444);padding:16px;">Failed to load token usage: ${Utils.esc(e.message)}</div>`;
    }
  },

  /* ─── Timeline Chart ─── */
  async _loadTimeline() {
    const el = document.getElementById('costsTimelineChart');
    if (!el) return;
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const raw = await API.getTokenTimeline(this._days, this._agentFilter || undefined);
      const data = Array.isArray(raw) ? raw : [];
      this._drawTimeline(el, data);
    } catch (e) {
      el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--danger,#ef4444);">Failed to load timeline: ${Utils.esc(e.message)}</div>`;
    }
  },

  _drawTimeline(el, data) {
    el.innerHTML = '';

    if (!data || data.length === 0) {
      el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--text-tertiary);">No timeline data yet</div>';
      return;
    }

    const margin = { top: 20, right: 20, bottom: 36, left: 64 };
    const W = el.clientWidth || 700;
    const H = 260;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const accent      = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#B5CC18';
    const textTertiary = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#6b7280';

    const parseDate = d3.timeParse('%Y-%m-%d');
    const parsed = data.map(d => ({
      date:     parseDate(d.date) || new Date(d.date),
      cost_usd: +(d.cost_usd || 0),
    })).sort((a, b) => a.date - b.date);

    const svg = d3.select(el).append('svg')
      .attr('width', '100%')
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const defs = svg.append('defs');
    const gradId = 'costsTimelineGrad';
    const grad = defs.append('linearGradient').attr('id', gradId).attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1');
    grad.append('stop').attr('offset','0%').attr('stop-color', accent).attr('stop-opacity', 0.3);
    grad.append('stop').attr('offset','100%').attr('stop-color', accent).attr('stop-opacity', 0.02);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime().domain(d3.extent(parsed, d => d.date)).range([0, w]);
    const maxCost = d3.max(parsed, d => d.cost_usd) || 0.01;
    const y = d3.scaleLinear().domain([0, maxCost * 1.2]).range([h, 0]);

    // Gridlines
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''))
      .call(ax => {
        ax.select('.domain').remove();
        ax.selectAll('line').attr('stroke', '#1e1e2e').attr('stroke-dasharray', '3,3');
      });

    // Area
    const area = d3.area()
      .x(d => x(d.date))
      .y0(h)
      .y1(d => y(d.cost_usd))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(parsed)
      .attr('fill', `url(#${gradId})`)
      .attr('d', area);

    // Line
    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.cost_usd))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', accent)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Dots
    g.selectAll('circle').data(parsed).enter().append('circle')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.cost_usd))
      .attr('r', 3)
      .attr('fill', accent);

    // X axis
    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(Math.min(parsed.length, 8)).tickFormat(d3.timeFormat('%b %d')))
      .call(ax => {
        ax.select('.domain').remove();
        ax.selectAll('line').remove();
        ax.selectAll('text').attr('fill', textTertiary).attr('font-size', '11px');
      });

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(v => this._fmtUSD(v)))
      .call(ax => {
        ax.select('.domain').remove();
        ax.selectAll('line').remove();
        ax.selectAll('text').attr('fill', textTertiary).attr('font-size', '11px');
      });

    // Tooltip
    const tooltip = d3.select(el).append('div')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#1a1a2e')
      .style('border', '1px solid #2a2a3a')
      .style('border-radius', '10px')
      .style('padding', '10px 14px')
      .style('font-size', '12px')
      .style('color', 'var(--text-primary)')
      .style('display', 'none')
      .style('z-index', '100');

    const crosshair = g.append('line')
      .attr('stroke', '#6b7280')
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1)
      .attr('y1', 0).attr('y2', h)
      .attr('display', 'none');

    g.append('rect')
      .attr('width', w).attr('height', h)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const bisect = d3.bisector(d => d.date).left;
        const x0 = x.invert(mx);
        const i  = bisect(parsed, x0, 1);
        const d0 = parsed[i - 1];
        const d1 = parsed[i] || d0;
        const d  = (d1 && (x0 - d0.date) > (d1.date - x0)) ? d1 : d0;
        if (!d) return;

        const px = x(d.date);
        crosshair.attr('x1', px).attr('x2', px).attr('display', null);

        const elRect = el.getBoundingClientRect();
        tooltip
          .style('left', (event.clientX - elRect.left + 14) + 'px')
          .style('top',  (event.clientY - elRect.top  + 14) + 'px')
          .style('display', 'block')
          .html(`
            <div style="color:#9090a8;margin-bottom:5px;">${d3.timeFormat('%b %d, %Y')(d.date)}</div>
            <div>Cost: <span style="color:#10b981;font-weight:700;">${this._fmtUSD(d.cost_usd)}</span></div>
          `);
      })
      .on('mouseleave', () => {
        crosshair.attr('display', 'none');
        tooltip.style('display', 'none');
      });
  },

  destroy() {
    this._agentFilter = '';
    this._agentList   = [];
    this._days        = 30;
  },
};
