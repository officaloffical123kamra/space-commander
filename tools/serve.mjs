// Локальный сервер: раздаёт игру и связывает игроков для игры по сети (до 4 человек).
// Запуск:  node tools/serve.mjs   (или npm run serve)
// Затем откройте в браузере адрес, который будет напечатан.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { listSoundFiles } from './sounds-index.mjs';

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
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
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

  // Список звуковых файлов, которые реально лежат в assets/sounds.
  // Игра по нему узнаёт, какие звуки загружать (положили файл — звук появился сам).
  if (url === '/assets/sounds/index.json') {
    const body = JSON.stringify(listSoundFiles(ROOT));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(body);
    return;
  }

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
// ИГРА ПО СЕТИ: одна комната — хост (p1) и до 3 друзей (p2, p3, p4).
// Сервер только пересылает сообщения и подписывает, от кого пришёл приказ.
// ============================================================

const SLOTS = ['p2', 'p3', 'p4'];
const wss = new WebSocketServer({ server, path: '/ws' });
let host = null;
let hostInfo = null;
let started = false;
const guests = new Map(); // слот -> ws
const names = new Map();  // слот -> ник

// Ник: без управляющих символов и скобок, до 16 знаков; пустой — «Игрок N»
function cleanName(raw, slot) {
  const n = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n || 'Игрок ' + slot.slice(1);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function slotsList() {
  return ['p1', ...SLOTS.filter((s) => guests.has(s))];
}

function broadcastPlayers() {
  const slots = slotsList();
  const nm = {};
  for (const s of slots) nm[s] = names.get(s) || 'Игрок ' + s.slice(1);
  const msg = { t: 'players', slots, names: nm };
  send(host, msg);
  for (const ws of guests.values()) send(ws, msg);
}

function slotOf(ws) {
  for (const [slot, g] of guests) if (g === ws) return slot;
  return null;
}

function closeRoom() {
  for (const ws of guests.values()) send(ws, { t: 'peer-left', slot: 'p1' });
  guests.clear();
  names.clear();
  host = null;
  hostInfo = null;
  started = false;
}

function leave(ws) {
  if (ws === host) {
    closeRoom();
    console.log('Хост вышел из игры');
    return;
  }
  const slot = slotOf(ws);
  if (!slot) return;
  guests.delete(slot);
  names.delete(slot);
  send(host, { t: 'peer-left', slot });
  if (!started) broadcastPlayers();
  console.log(`Игрок ${slot} вышел из игры`);
}

// Проверка связи: телефон уснул или пропал Wi-Fi — через ~15 секунд игрок считается вышедшим
const HEARTBEAT_MS = 5000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, HEARTBEAT_MS).unref();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const text = data.toString();
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }

    if (msg.t === 'host') {
      if (host && host !== ws) closeRoom();
      host = ws;
      hostInfo = { mode: msg.mode, mapId: msg.mapId };
      started = false;
      guests.clear();
      names.clear();
      names.set('p1', cleanName(msg.name, 'p1'));
      send(ws, { t: 'hosted', addresses: lanAddresses().map((a) => `${a}:${PORT}`) });
      broadcastPlayers();
      console.log(`Создана игра по сети: ${msg.mode}`);
      return;
    }
    if (msg.t === 'join') {
      if (!host || host === ws || host.readyState !== 1) { send(ws, { t: 'no-host' }); return; }
      if (started || slotOf(ws)) { send(ws, { t: 'busy' }); return; }
      const slot = SLOTS.find((s) => !guests.has(s));
      if (!slot) { send(ws, { t: 'busy' }); return; }
      guests.set(slot, ws);
      names.set(slot, cleanName(msg.name, slot));
      send(ws, { t: 'joined', slot, ...hostInfo });
      broadcastPlayers();
      console.log(`Игрок ${slot} (${names.get(slot)}) присоединился`);
      return;
    }
    if (msg.t === 'name') {
      // Игрок сменил ник в лобби
      const slot = ws === host ? 'p1' : slotOf(ws);
      if (slot && !started) {
        names.set(slot, cleanName(msg.name, slot));
        broadcastPlayers();
      }
      return;
    }
    if (msg.t === 'mode') {
      // Хост поменял режим/карту в лобби — друзья видят актуальное
      if (ws === host) {
        hostInfo = { mode: msg.mode, mapId: msg.mapId };
        for (const g of guests.values()) send(g, { t: 'mode', ...hostInfo });
      }
      return;
    }
    if (msg.t === 'leave') {
      leave(ws);
      return;
    }

    if (ws === host) {
      if (msg.t === 'start') started = true;
      // msg.to — кому (слот или список слотов); без него — всем друзьям
      const to = msg.to == null ? null : [].concat(msg.to);
      for (const [slot, g] of guests) {
        if (!to || to.includes(slot)) send(g, text);
      }
      return;
    }

    // От друга — только хосту, с пометкой кто прислал (подделать нельзя)
    const slot = slotOf(ws);
    if (slot && host) {
      msg.from = slot;
      send(host, msg);
    }
  });
  ws.on('close', () => leave(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Игра: http://localhost:${PORT}/`);
  const addrs = lanAddresses();
  if (addrs.length) {
    console.log(`С телефона / для друзей: http://${addrs[0]}:${PORT}/`);
    for (const a of addrs.slice(1)) console.log(`   (другие адреса компьютера: http://${a}:${PORT}/)`);
  }
});
