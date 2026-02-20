/* AgentBoard — WebSocket Manager */

(function () {
  const WS_URL = (window.AGENTBOARD_API
    ? window.AGENTBOARD_API.replace(/^http/, 'ws')
    : (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host)
    + '/ws/stream';

  const listeners = {};
  let ws = null;
  let reconnectTimeout = null;
  let reconnectDelay = 2000;
  let connected = false;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectDelay = 2000;
      emit('_connected', {});
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type || 'message';
        emit(type, msg.data || msg);
        emit('_any', msg);
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      connected = false;
      emit('_disconnected', {});
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimeout) return;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(f => f !== fn);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[WS] listener error', e); }
    });
  }

  function isConnected() { return connected; }

  // Start connection
  connect();

  window.WS = { on, off, isConnected };
})();
