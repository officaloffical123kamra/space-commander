// Локальный сервер: раздаёт игру и связывает двух игроков для игры по сети.
// Запуск:  node tools/serve.mjs   (или npm run serve)
// Затем откройте в браузере адрес, который будет напечатан.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Адреса компьютера в домашней сети (192.168.x.x и т.п.) — первыми
function lanAddresses() {
  const all = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) all.push(ni.address);
    }
  }
  const isHome = (a) => a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
  return [...all.filter(isHome), ...all.filter((a) => !isHome(a))];
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    // Range-запросы нужны для <audio> в Safari
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ============================================================
// ИГРА ПО СЕТИ: одна комната — хост и друг. Сервер только пересылает сообщения.
// ============================================================

const wss = new WebSocketServer({ server, path: '/ws' });
let host = null;
let guest = null;
let hostInfo = null;

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function leave(ws) {
  if (ws === host) {
    host = null;
    hostInfo = null;
    if (guest) send(guest, { t: 'peer-left' });
    guest = null;
    console.log('Хост вышел из игры');
  } else if (ws === guest) {
    guest = null;
    if (host) send(host, { t: 'peer-left' });
    console.log('Друг вышел из игры');
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const text = data.toString();
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }

    if (msg.t === 'host') {
      if (host && host !== ws) leave(host);
      host = ws;
      hostInfo = { mode: msg.mode, mapId: msg.mapId };
      guest = null;
      send(ws, { t: 'hosted', addresses: lanAddresses().map((a) => `${a}:${PORT}`) });
      console.log(`Создана игра по сети: ${msg.mode}`);
      return;
    }
    if (msg.t === 'join') {
      if (!host || host === ws || host.readyState !== 1) { send(ws, { t: 'no-host' }); return; }
      if (guest && guest !== ws && guest.readyState === 1) { send(ws, { t: 'busy' }); return; }
      guest = ws;
      send(ws, { t: 'joined', ...hostInfo });
      send(host, { t: 'guest-joined' });
      console.log('Друг присоединился');
      return;
    }
    if (msg.t === 'leave') {
      leave(ws);
      return;
    }

    // Всё остальное (старт, снимки, приказы, подсказки) — пересылаем второму игроку
    const peer = ws === host ? guest : ws === guest ? host : null;
    if (peer && peer.readyState === 1) peer.send(text);
  });
  ws.on('close', () => leave(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Игра: http://localhost:${PORT}/`);
  const addrs = lanAddresses();
  if (addrs.length) {
    console.log(`С телефона / для друга: http://${addrs[0]}:${PORT}/`);
    for (const a of addrs.slice(1)) console.log(`   (другие адреса компьютера: http://${a}:${PORT}/)`);
  }
});
