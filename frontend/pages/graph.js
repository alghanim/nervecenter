/* AgentBoard — Dependency Graph (D3.js force-directed SVG) */
window.Pages = window.Pages || {};

Pages.graph = (function () {
  let _container = null;
  let _simulation = null;
  let _svg = null;
  let _g = null;         // main group (zoom target)
  let _zoom = null;
  let _nodes = [];
  let _edges = [];
  let _tooltip = null;
  let _refreshTimer = null;

  // ── Team → color mapping ────────────────────────────────────────────────
  const TEAM_COLORS = {
    'Leadership':   '#6366f1',
    'Command':      '#6366f1',
    'Orchestrator': '#6366f1',
    'Engineering':  '#06b6d4',
    'Design':       '#ec4899',
    'Data':         '#8b5cf6',
    'DevOps':       '#f59e0b',
    'Marketing':    '#10b981',
    'Sales':        '#f97316',
    'Finance':      '#ef4444',
    'QA':           '#84cc16',
    'Strategy':     '#0ea5e9',
    'Business':     '#f97316',
    'Discovered':   '#6b7280',
  };

  const STATUS_COLORS = {
    online:  '#22c55e',
    busy:    '#f59e0b',
    idle:    '#6366f1',
    offline: '#6b7280',
  };

  // Pulsing status: which statuses get a pulse animation
  const PULSE_STATUSES = new Set(['online', 'busy']);

  function teamColor(team) {
    if (!team) return '#6366f1';
    // Exact match
    if (TEAM_COLORS[team]) return TEAM_COLORS[team];
    // Case-insensitive
    const key = Object.keys(TEAM_COLORS).find(k => k.toLowerCase() === team.toLowerCase());
    return key ? TEAM_COLORS[key] : '#6366f1';
  }

  function statusColor(status) {
    return STATUS_COLORS[status] || '#6b7280';
  }

  // ── Render entry point ──────────────────────────────────────────────────
  async function render(container) {
    _container = container;

    container.innerHTML = `
      <div class="graph-page" style="height:calc(100vh - 80px);display:flex;flex-direction:column;padding:0;position:relative;overflow:hidden;">

        <!-- Toolbar -->
        <div id="graph-toolbar" style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;background:var(--bg-primary);">
          <button id="graph-zoom-in"  class="btn btn-ghost btn-sm" title="Zoom in">＋</button>
          <button id="graph-zoom-out" class="btn btn-ghost btn-sm" title="Zoom out">－</button>
          <button id="graph-reset"    class="btn btn-ghost btn-sm" title="Reset layout">↺ Reset</button>
          <button id="graph-reheat"   class="btn btn-ghost btn-sm" title="Re-run simulation">⚡ Shake</button>
          <div style="flex:1;"></div>

          <!-- Edge legend -->
          <div style="display:flex;align-items:center;gap:16px;font-size:11px;color:var(--text-secondary);">
            <span style="display:flex;align-items:center;gap:5px;">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(156,163,175,0.7)" stroke-width="1.5"/><polygon points="24,4 18,1 18,7" fill="rgba(156,163,175,0.7)"/></svg>
              Delegates
            </span>
            <span style="display:flex;align-items:center;gap:5px;">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(99,102,241,0.6)" stroke-width="1.5" stroke-dasharray="4,3"/><polygon points="24,4 18,1 18,7" fill="rgba(99,102,241,0.6)"/></svg>
              Collaborates
            </span>
          </div>

          <!-- Team legend -->
          <div id="graph-team-legend" style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;"></div>
          <div id="graph-status" style="font-size:12px;color:var(--text-secondary);padding-left:8px;"></div>
        </div>

        <!-- SVG canvas -->
        <div id="graph-svg-wrap" style="flex:1;position:relative;overflow:hidden;background:var(--bg-inset);">
          <svg id="graph-svg" style="width:100%;height:100%;display:block;"></svg>
          <!-- Tooltip -->
          <div id="graph-tooltip" style="
            display:none;
            position:absolute;
            background:var(--bg-primary,#1a1a2e);
            border:1px solid var(--border);
            border-radius:8px;
            padding:10px 14px;
            pointer-events:none;
            min-width:180px;
            z-index:200;
            font-size:13px;
            box-shadow:0 4px 20px rgba(0,0,0,0.5);
          "></div>
        </div>
      </div>

      <!-- Pulse keyframe -->
      <style>
        @keyframes graph-pulse {
          0%   { r: 4; opacity: 1; }
          70%  { r: 9; opacity: 0; }
          100% { r: 9; opacity: 0; }
        }
        .graph-pulse-ring {
          animation: graph-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
        .graph-node circle.node-bg {
          transition: filter 0.2s;
        }
        .graph-node:hover circle.node-bg {
          filter: brightness(1.3);
        }
      </style>
    `;

    _tooltip = document.getElementById('graph-tooltip');

    // Toolbar buttons
    document.getElementById('graph-zoom-in').addEventListener('click', () => {
      if (_svg && _zoom) _svg.transition().duration(300).call(_zoom.scaleBy, 1.3);
    });
    document.getElementById('graph-zoom-out').addEventListener('click', () => {
      if (_svg && _zoom) _svg.transition().duration(300).call(_zoom.scaleBy, 0.77);
    });
    document.getElementById('graph-reset').addEventListener('click', resetView);
    document.getElementById('graph-reheat').addEventListener('click', reheat);

    // Load data
    try {
      document.getElementById('graph-status').textContent = 'Loading…';
      const data = await API.getGraphDependencies();
      initGraph(data.nodes || [], data.edges || []);
    } catch (e) {
      document.getElementById('graph-status').textContent = '⚠ ' + e.message;
    }

    // Auto-refresh every 30s to pick up status changes
    _refreshTimer = setInterval(async () => {
      try {
        const data = await API.getGraphDependencies();
        updateStatuses(data.nodes || []);
      } catch (_) {}
    }, 30000);
  }

  // ── Init / build graph ──────────────────────────────────────────────────
  function initGraph(rawNodes, rawEdges) {
    const wrap = document.getElementById('graph-svg-wrap');
    if (!wrap) return;

    const W = wrap.clientWidth  || 900;
    const H = wrap.clientHeight || 600;

    // D3 select SVG
    _svg = d3.select('#graph-svg')
      .attr('width', W)
      .attr('height', H);

    // Arrow marker defs
    const defs = _svg.append('defs');

    function addMarker(id, color) {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -4 10 8')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4Z')
        .attr('fill', color);
    }

    addMarker('arrow-parent',   'rgba(156,163,175,0.8)');
    addMarker('arrow-taskflow', 'rgba(99,102,241,0.8)');

    // Zoom behaviour
    _zoom = d3.zoom()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => _g.attr('transform', event.transform));

    _svg.call(_zoom)
      .on('dblclick.zoom', null); // disable double-click zoom

    _g = _svg.append('g').attr('class', 'graph-root');

    // ── Prepare node + edge data ──
    _nodes = rawNodes.map(n => ({
      ...n,
      x: W / 2 + (Math.random() - 0.5) * 200,
      y: H / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeById = new Map(_nodes.map(n => [n.id, n]));

    _edges = rawEdges
      .map(e => ({
        ...e,
        source: nodeById.get(e.from),
        target: nodeById.get(e.to),
      }))
      .filter(e => e.source && e.target);

    // ── D3 force simulation ──
    _simulation = d3.forceSimulation(_nodes)
      .force('link', d3.forceLink(_edges)
        .id(d => d.id)
        .distance(d => d.type === 'parent' ? 130 : 180)
        .strength(0.4))
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center',  d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(48))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04))
      .alphaDecay(0.025);

    // ── Draw edges ──
    const linkGroup = _g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll('line')
      .data(_edges)
      .enter()
      .append('line')
      .attr('stroke', d => d.type === 'task-flow' ? 'rgba(99,102,241,0.5)' : 'rgba(156,163,175,0.45)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', d => d.type === 'task-flow' ? '5,4' : null)
      .attr('marker-end', d => d.type === 'task-flow' ? 'url(#arrow-taskflow)' : 'url(#arrow-parent)');

    // ── Draw nodes ──
    const nodeGroup = _g.append('g').attr('class', 'nodes');

    const node = nodeGroup.selectAll('g.graph-node')
      .data(_nodes)
      .enter()
      .append('g')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer')
      .call(
        d3.drag()
          .on('start', onDragStart)
          .on('drag',  onDrag)
          .on('end',   onDragEnd)
      )
      .on('click', onClick)
      .on('mouseover', onMouseOver)
      .on('mousemove', onMouseMove)
      .on('mouseout',  onMouseOut);

    const NODE_R = 26;

    // Glow filter per team color would be expensive; use a generic glow
    defs.append('filter').attr('id', 'node-glow')
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');

    // Background circle (fill)
    node.append('circle')
      .attr('class', 'node-bg')
      .attr('r', NODE_R)
      .attr('fill', d => teamColor(d.team) + '2a')
      .attr('stroke', d => teamColor(d.team) + 'cc')
      .attr('stroke-width', 2);

    // Emoji label
    node.append('text')
      .attr('class', 'node-emoji')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '18px')
      .text(d => d.emoji || '🤖');

    // Agent name below
    node.append('text')
      .attr('class', 'node-name')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('dy', NODE_R + 4)
      .attr('font-size', '10px')
      .attr('fill', 'rgba(255,255,255,0.8)')
      .attr('font-family', 'Inter, sans-serif')
      .text(d => d.label || d.name || d.id);

    // Status dot (solid)
    node.append('circle')
      .attr('class', 'node-status-dot')
      .attr('cx', NODE_R * 0.65)
      .attr('cy', NODE_R * 0.65)
      .attr('r', 5)
      .attr('fill', d => statusColor(d.status))
      .attr('stroke', 'var(--bg-inset, #0d0d1a)')
      .attr('stroke-width', 1.5);

    // Pulse ring (only for online/busy)
    node.each(function (d) {
      if (PULSE_STATUSES.has(d.status)) {
        d3.select(this).append('circle')
          .attr('class', 'graph-pulse-ring')
          .attr('cx', NODE_R * 0.65)
          .attr('cy', NODE_R * 0.65)
          .attr('r', 4)
          .attr('fill', 'none')
          .attr('stroke', statusColor(d.status))
          .attr('stroke-width', 1.5)
          .attr('opacity', 1);
      }
    });

    // ── Simulation tick ──
    _simulation.on('tick', () => {
      // Clamp nodes within SVG bounds
      const W2 = +_svg.attr('width')  || W;
      const H2 = +_svg.attr('height') || H;
      _nodes.forEach(n => {
        n.x = Math.max(NODE_R + 4, Math.min(W2 - NODE_R - 4, n.x));
        n.y = Math.max(NODE_R + 4, Math.min(H2 - NODE_R - 4, n.y));
      });

      // Update edges (offset start/end to node radius)
      link.each(function (d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const r = NODE_R + 2; // leave a gap before arrowhead
        d3.select(this)
          .attr('x1', d.source.x + (dx / dist) * r)
          .attr('y1', d.source.y + (dy / dist) * r)
          .attr('x2', d.target.x - (dx / dist) * (r + 10))
          .attr('y2', d.target.y - (dy / dist) * (r + 10));
      });

      // Update nodes
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Initial centering after a short settle
    setTimeout(resetView, 1200);

    // ── Team legend ──
    const teams = [...new Set(_nodes.map(n => n.team).filter(Boolean))];
    const legendEl = document.getElementById('graph-team-legend');
    if (legendEl) {
      legendEl.innerHTML = teams.map(t => `
        <span style="display:flex;align-items:center;gap:4px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${teamColor(t)};display:inline-block;flex-shrink:0;"></span>
          <span>${Utils.esc(t)}</span>
        </span>`).join('');
    }

    document.getElementById('graph-status').textContent =
      `${_nodes.length} agents · ${_edges.length} connections`;
  }

  // ── Update node statuses without full re-render ─────────────────────────
  function updateStatuses(rawNodes) {
    if (!_g) return;
    const byId = new Map(rawNodes.map(n => [n.id, n]));
    _g.selectAll('g.graph-node').each(function (d) {
      const fresh = byId.get(d.id);
      if (!fresh) return;
      d.status = fresh.status;
      d.activityCount = fresh.activityCount;
      const sc = statusColor(d.status);
      d3.select(this).select('.node-status-dot').attr('fill', sc);
      // Update pulse ring
      d3.select(this).select('.graph-pulse-ring').attr('stroke', sc);
      if (PULSE_STATUSES.has(d.status)) {
        if (d3.select(this).select('.graph-pulse-ring').empty()) {
          const NODE_R = 26;
          d3.select(this).append('circle')
            .attr('class', 'graph-pulse-ring')
            .attr('cx', NODE_R * 0.65).attr('cy', NODE_R * 0.65)
            .attr('r', 4).attr('fill', 'none')
            .attr('stroke', sc).attr('stroke-width', 1.5);
        }
      } else {
        d3.select(this).select('.graph-pulse-ring').remove();
      }
    });
  }

  // ── Drag handlers ───────────────────────────────────────────────────────
  function onDragStart(event, d) {
    if (!event.active) _simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    hideTooltip();
  }

  function onDrag(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function onDragEnd(event, d) {
    if (!event.active) _simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // ── Click → navigate ────────────────────────────────────────────────────
  function onClick(event, d) {
    event.stopPropagation();
    App.navigate('agents/' + d.id);
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────
  function onMouseOver(event, d) {
    const wrap = document.getElementById('graph-svg-wrap');
    if (!wrap || !_tooltip) return;

    const sc = statusColor(d.status);
    const statusLabel = d.status
      ? d.status.charAt(0).toUpperCase() + d.status.slice(1)
      : 'Unknown';

    const activityLine = typeof d.activityCount === 'number'
      ? `<div style="color:var(--text-secondary);font-size:12px;">📈 ${d.activityCount} actions (7d)</div>`
      : '';

    _tooltip.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:5px;">${Utils.esc(d.emoji || '🤖')} ${Utils.esc(d.label || d.name || d.id)}</div>
      ${d.team  ? `<div style="color:var(--text-secondary);font-size:12px;margin-bottom:2px;">🏷 ${Utils.esc(d.team)}</div>` : ''}
      ${d.role  ? `<div style="color:var(--text-secondary);font-size:12px;margin-bottom:2px;">📋 ${Utils.esc(d.role)}</div>` : ''}
      ${activityLine}
      <div style="font-size:12px;margin-top:6px;display:flex;align-items:center;gap:5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${sc};display:inline-block;flex-shrink:0;"></span>
        ${Utils.esc(statusLabel)}
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Click to view details</div>
    `;

    _tooltip.style.display = 'block';
    positionTooltip(event);

    // Highlight connected edges
    if (_g) {
      _g.selectAll('line').attr('opacity', e =>
        (e.source.id === d.id || e.target.id === d.id) ? 1 : 0.15);
    }
  }

  function onMouseMove(event) {
    positionTooltip(event);
  }

  function onMouseOut() {
    hideTooltip();
    if (_g) _g.selectAll('line').attr('opacity', 1);
  }

  function positionTooltip(event) {
    if (!_tooltip) return;
    const wrap = document.getElementById('graph-svg-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const tw = 210, th = 120;
    let tx = event.clientX - rect.left + 16;
    let ty = event.clientY - rect.top  - 20;
    if (tx + tw > rect.width)  tx = event.clientX - rect.left - tw - 10;
    if (ty + th > rect.height) ty = event.clientY - rect.top  - th - 10;
    if (ty < 0) ty = 4;
    _tooltip.style.left = tx + 'px';
    _tooltip.style.top  = ty + 'px';
  }

  function hideTooltip() {
    if (_tooltip) _tooltip.style.display = 'none';
  }

  // ── Zoom helpers ────────────────────────────────────────────────────────
  function resetView() {
    if (!_svg || !_zoom) return;
    const wrap = document.getElementById('graph-svg-wrap');
    if (!wrap) return;
    const W = wrap.clientWidth  || 900;
    const H = wrap.clientHeight || 600;

    if (!_nodes.length) {
      _svg.transition().duration(500).call(
        _zoom.transform, d3.zoomIdentity);
      return;
    }

    // Compute bounding box of settled nodes
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    _nodes.forEach(n => {
      x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
      y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
    });

    const pad = 60;
    const scaleX = (W - pad * 2) / Math.max(x1 - x0, 1);
    const scaleY = (H - pad * 2) / Math.max(y1 - y0, 1);
    const scale = Math.min(scaleX, scaleY, 1.5);
    const tx = W / 2 - ((x0 + x1) / 2) * scale;
    const ty = H / 2 - ((y0 + y1) / 2) * scale;

    _svg.transition().duration(700)
      .call(_zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function reheat() {
    if (_simulation) {
      _simulation.alpha(0.6).restart();
    }
  }

  // ── Destroy ─────────────────────────────────────────────────────────────
  function destroy() {
    if (_simulation) { _simulation.stop(); _simulation = null; }
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    hideTooltip();
    _svg = null;
    _g   = null;
    _nodes = [];
    _edges = [];
    _container = null;
    _tooltip = null;
  }

  return { render, destroy };
})();
