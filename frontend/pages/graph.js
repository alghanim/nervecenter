/* AgentBoard — Dependency Graph Page (force-directed, HTML5 Canvas) */
window.Pages = window.Pages || {};

Pages.graph = (function () {
  let _container = null;
  let _canvas = null;
  let _ctx = null;
  let _animFrame = null;
  let _nodes = [];
  let _edges = [];
  let _scale = 1;
  let _offsetX = 0;
  let _offsetY = 0;
  let _isDragging = false;
  let _dragNode = null;
  let _lastMouse = { x: 0, y: 0 };
  let _hoveredNode = null;
  let _tooltip = null;

  // Team → color mapping
  const TEAM_COLORS = {
    'Leadership':   '#6366f1',
    'Engineering':  '#06b6d4',
    'Design':       '#ec4899',
    'Data':         '#8b5cf6',
    'DevOps':       '#f59e0b',
    'Marketing':    '#10b981',
    'Sales':        '#f97316',
    'Finance':      '#ef4444',
    'QA':           '#84cc16',
    'Strategy':     '#0ea5e9',
    'Discovered':   '#6b7280',
  };

  const STATUS_COLORS = {
    online:  '#22c55e',
    busy:    '#f59e0b',
    idle:    '#6366f1',
    offline: '#6b7280',
  };

  function teamColor(team) {
    return TEAM_COLORS[team] || '#6366f1';
  }

  // ── Render ──────────────────────────────────────────────────────────────
  async function render(container, sub) {
    _container = container;

    container.innerHTML = `
      <div class="graph-page" style="height:calc(100vh - 80px);display:flex;flex-direction:column;padding:0;position:relative;">
        <!-- Toolbar -->
        <div id="graph-toolbar" style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;">
          <button id="graph-zoom-in"  class="btn btn-ghost btn-sm" title="Zoom in">＋</button>
          <button id="graph-zoom-out" class="btn btn-ghost btn-sm" title="Zoom out">－</button>
          <button id="graph-reset"    class="btn btn-ghost btn-sm" title="Reset layout">↺ Reset</button>
          <div style="flex:1;"></div>
          <!-- Legend -->
          <div style="display:flex;align-items:center;gap:16px;font-size:11px;color:var(--text-secondary);">
            <span><span style="display:inline-block;width:24px;height:2px;background:#999;vertical-align:middle;margin-right:4px;"></span>Parent</span>
            <span><span style="display:inline-block;width:24px;height:2px;background:#999;vertical-align:middle;margin-right:4px;border-top:2px dashed #999;height:0;"></span>Task-flow</span>
          </div>
          <div id="graph-team-legend" style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;"></div>
          <div id="graph-status" style="font-size:12px;color:var(--text-secondary);"></div>
        </div>

        <!-- Canvas -->
        <div style="flex:1;position:relative;overflow:hidden;" id="graph-canvas-wrap">
          <canvas id="graph-canvas" style="display:block;width:100%;height:100%;cursor:grab;"></canvas>
          <div id="graph-tooltip" style="display:none;position:absolute;background:var(--bg-primary,#1a1a2e);border:1px solid var(--border);border-radius:8px;padding:10px 14px;pointer-events:none;min-width:160px;z-index:100;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.4);"></div>
        </div>
      </div>
    `;

    _tooltip = document.getElementById('graph-tooltip');

    // Buttons
    document.getElementById('graph-zoom-in').addEventListener('click', () => { _scale *= 1.2; draw(); });
    document.getElementById('graph-zoom-out').addEventListener('click', () => { _scale /= 1.2; draw(); });
    document.getElementById('graph-reset').addEventListener('click', resetLayout);

    // Load data
    try {
      document.getElementById('graph-status').textContent = 'Loading...';
      const data = await API.getGraphDependencies();
      initGraph(data.nodes || [], data.edges || []);
    } catch (e) {
      document.getElementById('graph-status').textContent = 'Error: ' + e.message;
    }
  }

  // ── Init Graph ───────────────────────────────────────────────────────────
  function initGraph(rawNodes, rawEdges) {
    const wrap = document.getElementById('graph-canvas-wrap');
    _canvas = document.getElementById('graph-canvas');
    if (!_canvas || !wrap) return;

    // Set canvas pixel size
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    _canvas.width = W;
    _canvas.height = H;
    _ctx = _canvas.getContext('2d');

    // Place nodes in a circle initially
    const N = rawNodes.length;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.3;

    _nodes = rawNodes.map((n, i) => ({
      ...n,
      x: cx + radius * Math.cos((2 * Math.PI * i) / N),
      y: cy + radius * Math.sin((2 * Math.PI * i) / N),
      vx: 0, vy: 0,
      radius: 28,
    }));

    _edges = rawEdges.map(e => ({
      ...e,
      source: _nodes.find(n => n.id === e.from),
      target: _nodes.find(n => n.id === e.to),
    })).filter(e => e.source && e.target);

    _scale = 1;
    _offsetX = 0;
    _offsetY = 0;

    // Build team legend
    const teams = [...new Set(_nodes.map(n => n.team).filter(Boolean))];
    const legendEl = document.getElementById('graph-team-legend');
    if (legendEl) {
      legendEl.innerHTML = teams.map(t =>
        `<span style="display:flex;align-items:center;gap:4px;">
           <span style="width:10px;height:10px;border-radius:50%;background:${teamColor(t)};display:inline-block;"></span>
           ${Utils.esc(t)}
         </span>`
      ).join('');
    }

    document.getElementById('graph-status').textContent = `${_nodes.length} agents · ${_edges.length} connections`;

    // Mouse events
    _canvas.addEventListener('mousedown', onMouseDown);
    _canvas.addEventListener('mousemove', onMouseMove);
    _canvas.addEventListener('mouseup', onMouseUp);
    _canvas.addEventListener('mouseleave', onMouseUp);
    _canvas.addEventListener('wheel', onWheel, { passive: false });
    _canvas.addEventListener('click', onClick);
    _canvas.addEventListener('dblclick', onDblClick);

    // Touch support
    _canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    _canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    _canvas.addEventListener('touchend', onMouseUp);

    // Start simulation
    simulate();
  }

  // ── Force Simulation ──────────────────────────────────────────────────────
  let _simStep = 0;
  const MAX_SIM_STEPS = 300;

  function simulate() {
    cancelAnimationFrame(_animFrame);

    function tick() {
      if (_simStep < MAX_SIM_STEPS) {
        const alpha = 1 - _simStep / MAX_SIM_STEPS;
        applyForces(alpha);
        _simStep++;
      }
      draw();
      _animFrame = requestAnimationFrame(tick);
    }

    _simStep = 0;
    tick();
  }

  function applyForces(alpha) {
    const W = _canvas.width, H = _canvas.height;
    const cx = W / 2, cy = H / 2;
    const repulsion = 4000;
    const attraction = 0.04;
    const gravity = 0.015;
    const damping = 0.85;

    // Reset forces
    _nodes.forEach(n => { n.fx = 0; n.fy = 0; });

    // Repulsion between all node pairs
    for (let i = 0; i < _nodes.length; i++) {
      for (let j = i + 1; j < _nodes.length; j++) {
        const a = _nodes[i], b = _nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.fx -= fx; a.fy -= fy;
        b.fx += fx; b.fy += fy;
      }
    }

    // Attraction along edges
    _edges.forEach(e => {
      if (!e.source || !e.target) return;
      const dx = e.target.x - e.source.x;
      const dy = e.target.y - e.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const idealLen = e.type === 'parent' ? 120 : 160;
      const stretch = dist - idealLen;
      const fx = (dx / dist) * stretch * attraction;
      const fy = (dy / dist) * stretch * attraction;
      e.source.fx += fx; e.source.fy += fy;
      e.target.fx -= fx; e.target.fy -= fy;
    });

    // Gravity toward center
    _nodes.forEach(n => {
      n.fx += (cx - n.x) * gravity;
      n.fy += (cy - n.y) * gravity;
    });

    // Integrate
    _nodes.forEach(n => {
      if (n === _dragNode) return;
      n.vx = (n.vx + n.fx * alpha) * damping;
      n.vy = (n.vy + n.fy * alpha) * damping;
      n.x += n.vx;
      n.y += n.vy;

      // Bounds
      const pad = n.radius + 10;
      n.x = Math.max(pad, Math.min(W - pad, n.x));
      n.y = Math.max(pad, Math.min(H - pad, n.y));
    });
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    if (!_ctx || !_canvas) return;
    const W = _canvas.width, H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);

    _ctx.save();
    _ctx.translate(_offsetX, _offsetY);
    _ctx.scale(_scale, _scale);

    // Draw edges first
    _edges.forEach(e => drawEdge(e));

    // Draw nodes on top
    _nodes.forEach(n => drawNode(n));

    _ctx.restore();
  }

  function drawEdge(e) {
    if (!e.source || !e.target) return;
    const ctx = _ctx;
    const { x: x1, y: y1 } = e.source;
    const { x: x2, y: y2 } = e.target;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const r = e.source.radius;

    // Offset start/end to node edge
    const sx = x1 + (dx / dist) * r;
    const sy = y1 + (dy / dist) * r;
    const ex = x2 - (dx / dist) * r;
    const ey = y2 - (dy / dist) * r;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = e.type === 'task-flow' ? 'rgba(99,102,241,0.5)' : 'rgba(156,163,175,0.4)';
    ctx.lineWidth = e.type === 'task-flow' ? 1.5 : 1.5;
    if (e.type === 'task-flow') {
      ctx.setLineDash([5, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    ctx.setLineDash([]);
    const angle = Math.atan2(ey - sy, ex - sx);
    const arrowLen = 8;
    ctx.fillStyle = e.type === 'task-flow' ? 'rgba(99,102,241,0.6)' : 'rgba(156,163,175,0.6)';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - arrowLen * Math.cos(angle - 0.4), ey - arrowLen * Math.sin(angle - 0.4));
    ctx.lineTo(ex - arrowLen * Math.cos(angle + 0.4), ey - arrowLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawNode(n) {
    const ctx = _ctx;
    const isHovered = n === _hoveredNode;
    const color = teamColor(n.team);
    const statusColor = STATUS_COLORS[n.status] || '#6b7280';
    const r = n.radius;

    ctx.save();

    // Glow on hover
    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }

    // Background circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color + '33'; // 20% alpha
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = isHovered ? color : color + 'aa';
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Emoji
    ctx.font = `${r * 0.85}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.emoji || '🤖', n.x, n.y);

    // Status dot
    const dotR = 5;
    ctx.beginPath();
    ctx.arc(n.x + r * 0.65, n.y + r * 0.65, dotR, 0, 2 * Math.PI);
    ctx.fillStyle = statusColor;
    ctx.fill();
    ctx.strokeStyle = '#0a0a14';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Name below
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.75)';
    ctx.fillText(n.name || n.id, n.x, n.y + r + 4);

    ctx.restore();
  }

  // ── Mouse/Touch Events ────────────────────────────────────────────────────
  function canvasPoint(e) {
    const rect = _canvas.getBoundingClientRect();
    const scaleX = _canvas.width / rect.width;
    const scaleY = _canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function worldPoint(cx, cy) {
    return {
      x: (cx - _offsetX) / _scale,
      y: (cy - _offsetY) / _scale,
    };
  }

  function nodeAt(cx, cy) {
    const { x, y } = worldPoint(cx, cy);
    return _nodes.find(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius;
    });
  }

  function onMouseDown(e) {
    const pt = canvasPoint(e);
    const n = nodeAt(pt.x, pt.y);
    if (n) {
      _dragNode = n;
      _canvas.style.cursor = 'grabbing';
      _simStep = 0; // restart sim
    } else {
      _isDragging = true;
      _canvas.style.cursor = 'grabbing';
    }
    _lastMouse = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e) {
    const pt = canvasPoint(e);
    const hovered = nodeAt(pt.x, pt.y);

    if (hovered !== _hoveredNode) {
      _hoveredNode = hovered;
      if (hovered) {
        _canvas.style.cursor = 'pointer';
        showTooltip(e, hovered);
      } else if (!_isDragging && !_dragNode) {
        _canvas.style.cursor = 'grab';
        hideTooltip();
      }
    } else if (hovered) {
      moveTooltip(e);
    }

    const dx = e.clientX - _lastMouse.x;
    const dy = e.clientY - _lastMouse.y;

    if (_dragNode) {
      const rect = _canvas.getBoundingClientRect();
      const scaleX = _canvas.width / rect.width;
      const scaleY = _canvas.height / rect.height;
      _dragNode.x += (dx * scaleX) / _scale;
      _dragNode.y += (dy * scaleY) / _scale;
      _dragNode.vx = 0; _dragNode.vy = 0;
    } else if (_isDragging) {
      const rect = _canvas.getBoundingClientRect();
      _offsetX += dx * (_canvas.width / rect.width);
      _offsetY += dy * (_canvas.height / rect.height);
    }

    _lastMouse = { x: e.clientX, y: e.clientY };
    if (_dragNode || _isDragging) draw();
  }

  function onMouseUp() {
    _dragNode = null;
    _isDragging = false;
    _canvas.style.cursor = _hoveredNode ? 'pointer' : 'grab';
  }

  function onWheel(e) {
    e.preventDefault();
    const pt = canvasPoint(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    // Zoom toward mouse
    _offsetX = pt.x + (_offsetX - pt.x) * factor;
    _offsetY = pt.y + (_offsetY - pt.y) * factor;
    _scale *= factor;
    draw();
  }

  function onClick(e) {
    // Only fire if not dragging significantly
    if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) return;
    const pt = canvasPoint(e);
    const n = nodeAt(pt.x, pt.y);
    if (n) {
      App.navigate('agents/' + n.id);
    }
  }

  function onDblClick(e) {
    const pt = canvasPoint(e);
    const n = nodeAt(pt.x, pt.y);
    if (n) {
      App.navigate('agents/' + n.id);
    }
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onMouseMove({ clientX: touch.clientX, clientY: touch.clientY, movementX: 0, movementY: 0 });
    }
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function showTooltip(e, node) {
    if (!_tooltip) return;
    const statusLabel = node.status ? (node.status.charAt(0).toUpperCase() + node.status.slice(1)) : 'Unknown';
    _tooltip.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${Utils.esc(node.emoji || '🤖')} ${Utils.esc(node.name || node.id)}</div>
      <div style="color:var(--text-secondary);font-size:12px;margin-bottom:2px;">🏷 ${Utils.esc(node.team || 'Unknown')}</div>
      ${node.role ? `<div style="color:var(--text-secondary);font-size:12px;margin-bottom:2px;">📋 ${Utils.esc(node.role)}</div>` : ''}
      <div style="font-size:12px;margin-top:4px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[node.status] || '#6b7280'};margin-right:4px;"></span>
        ${statusLabel}
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Click to view agent</div>
    `;
    _tooltip.style.display = 'block';
    moveTooltip(e);
  }

  function moveTooltip(e) {
    if (!_tooltip) return;
    const wrap = document.getElementById('graph-canvas-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    let tx = e.clientX - rect.left + 16;
    let ty = e.clientY - rect.top - 20;
    const tw = 180, th = 100;
    if (tx + tw > rect.width) tx = e.clientX - rect.left - tw - 8;
    if (ty + th > rect.height) ty = e.clientY - rect.top - th - 8;
    _tooltip.style.left = tx + 'px';
    _tooltip.style.top = ty + 'px';
  }

  function hideTooltip() {
    if (_tooltip) _tooltip.style.display = 'none';
  }

  // ── Reset Layout ──────────────────────────────────────────────────────────
  function resetLayout() {
    if (!_canvas) return;
    const W = _canvas.width, H = _canvas.height;
    const N = _nodes.length;
    const radius = Math.min(W, H) * 0.3;
    _nodes.forEach((n, i) => {
      n.x = W / 2 + radius * Math.cos((2 * Math.PI * i) / N);
      n.y = H / 2 + radius * Math.sin((2 * Math.PI * i) / N);
      n.vx = 0; n.vy = 0;
    });
    _scale = 1; _offsetX = 0; _offsetY = 0;
    simulate();
  }

  // ── Destroy ───────────────────────────────────────────────────────────────
  function destroy() {
    cancelAnimationFrame(_animFrame);
    _container = null;
    _canvas = null;
    _ctx = null;
    _nodes = [];
    _edges = [];
    _dragNode = null;
    _hoveredNode = null;
    _tooltip = null;
  }

  return { render, destroy };
})();
