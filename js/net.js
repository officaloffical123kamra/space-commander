// js/net.js
// Связь с другом через локальный сервер (tools/serve.mjs, WebSocket /ws).
// На Яндекс Играх такого сервера нет — игра по сети там недоступна.
let ws = null;
let connecting = null;
const handlers = new Map();

export function isNetConnected() {
  return !!ws && ws.readyState === 1;
}

export function netConnect(timeoutMs = 3000) {
  if (isNetConnected()) return Promise.resolve();
  if (connecting) return connecting;

  connecting = new Promise((resolve, reject) => {
    let sock;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      sock = new WebSocket(`${proto}://${location.host}/ws`);
    } catch (e) {
      connecting = null;
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      try { sock.close(); } catch (e) {}
      connecting = null;
      reject(new Error('timeout'));
    }, timeoutMs);

    sock.onopen = () => {
      clearTimeout(timer);
      ws = sock;
      connecting = null;
      resolve();
    };
    sock.onerror = () => {
      clearTimeout(timer);
      connecting = null;
      reject(new Error('ws error'));
    };
    sock.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      const h = handlers.get(msg.t);
      if (h) h(msg);
    };
    sock.onclose = () => {
      const wasOpen = ws === sock;
      ws = null;
      if (wasOpen) {
        const h = handlers.get('closed');
        if (h) h({ t: 'closed' });
      }
    };
  });
  return connecting;
}

export function netSend(obj) {
  if (isNetConnected()) ws.send(JSON.stringify(obj));
}

export function onNet(type, cb) {
  handlers.set(type, cb);
}

export function netClose() {
  if (ws) {
    try { ws.close(); } catch (e) {}
  }
  ws = null;
}
