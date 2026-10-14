// js/lobby.js
// Экран «Игра по сети» (до 4 игроков): хост создаёт игру, друзья присоединяются,
// хост нажимает «Начать игру». Работает только при запуске игры через локальный сервер
// (node tools/serve.mjs), все устройства должны быть в одной Wi-Fi сети.
import { netConnect, netSend, onNet, netClose } from './net.js';
import { session, teamOfCtrl, playerNames } from './session.js';
import { MAPS } from './maps.js';
import { playClick } from './audio.js';
import { showAlert, showPrompt, buildResourceSliders } from './ui.js';
import { getNick, setNick, cleanNick, getStartRes, setStartRes } from './profile.js';

const SERVER_VERSION = 3;     // с какой версии сервера работает эта игра
const STATUS_WAIT_MS = 1500;  // сколько ждём ответа сервера (старый сервер молчит)
const STATUS_POLL_MS = 2000;

let onStart = null;
let showScreenFn = null;
let phase = 'choose';   // connecting | unavailable | outdated | choose | hosting | joined | playing
let mode = 'coop';
let mapId = 'classic';
let addresses = [];
let slots = ['p1'];     // кто сейчас в комнате
let names = {};         // ники по местам
let mySlot = 'p1';
let errorText = '';
let room = { exists: false, started: false, slots: [], names: {} };
let pollTimer = null;
let statusTimer = null;

const MODES = [
  { id: 'coop', icon: '🛡', title: 'Вместе против волн', desc: 'До 4 игроков. У каждого своя база рядом, враги идут со всех 4 сторон. Сколько волн продержитесь?' },
  { id: 'pvp',  icon: '⚔', title: 'Друг против друга',  desc: '2 игрока — один на один. 3 игрока — двое против одного. 4 игрока — две команды по двое.' }
];
const ALL_SLOTS = ['p1', 'p2', 'p3', 'p4'];

function displayName(s) {
  return names[s] || 'Игрок ' + s.slice(1);
}

function modeTitle(id) {
  const m = MODES.find((x) => x.id === id);
  return m ? `${m.icon} ${m.title}` : '';
}

// Уведомления «вошёл / вышел» по изменению списка
function announceChanges(oldSlots, oldNames, newSlots) {
  for (const s of newSlots) {
    if (!oldSlots.includes(s) && s !== mySlot && s !== 'p1') showAlert('✅ ' + displayName(s) + ' присоединился', 'success', 4000);
  }
  for (const s of oldSlots) {
    if (!newSlots.includes(s) && s !== 'p1') showAlert('👋 ' + (oldNames[s] || 'Игрок ' + s.slice(1)) + ' вышел', 'warn', 4000);
  }
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
}

export function initLobby({ startGame, showScreen }) {
  onStart = startGame;
  showScreenFn = showScreen;

  const input = document.getElementById('net-nick');
  if (input) {
    input.value = getNick();
    input.addEventListener('input', () => setNick(input.value));
    // Смена ника в уже созданной комнате — друзья увидят сразу
    input.addEventListener('change', () => {
      if (phase === 'hosting' || phase === 'joined') netSend({ t: 'name', name: getNick() });
    });
  }

  // Ответ сервера о состоянии комнаты (также подтверждает, что сервер новый)
  onNet('room', (msg) => {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if ((msg.ver || 0) < SERVER_VERSION) { phase = 'outdated'; stopPolling(); render(); return; }
    const changed = JSON.stringify(room) !== JSON.stringify(msg);
    room = msg;
    if (phase === 'connecting') phase = 'choose';
    if (phase === 'choose' && changed) render();
    else if (phase === 'choose' && !document.getElementById('net-content').children.length) render();
  });
  onNet('room-taken', (msg) => {
    room = msg;
    errorText = 'На этом сервере уже создана игра. Нажмите «Присоединиться».';
    phase = 'choose';
    render();
  });
  onNet('hosted', (msg) => {
    stopPolling();
    addresses = msg.addresses || [];
    phase = 'hosting';
    mySlot = 'p1';
    render();
  });
  onNet('players', (msg) => {
    const oldSlots = slots;
    const oldNames = names;
    slots = msg.slots || ['p1'];
    names = msg.names || {};
    if (phase === 'hosting' || phase === 'joined') {
      announceChanges(oldSlots, oldNames, slots);
      render();
    }
  });
  onNet('joined', (msg) => {
    stopPolling();
    mySlot = msg.slot;
    mode = msg.mode || mode;
    mapId = msg.mapId || mapId;
    phase = 'joined';
    render();
  });
  onNet('mode', (msg) => {
    mode = msg.mode || mode;
    mapId = msg.mapId || mapId;
    if (phase === 'joined') render();
  });
  onNet('no-host', () => {
    errorText = 'Игра ещё не создана. Пусть хост нажмёт «Создать игру», затем попробуйте снова.';
    phase = 'choose';
    startPolling();
    render();
  });
  onNet('busy', () => {
    errorText = 'Игра уже началась или все 4 места заняты.';
    phase = 'choose';
    startPolling();
    render();
  });
  onNet('peer-left', () => {
    // В лобби: хост закрыл игру
    if (phase === 'joined') {
      errorText = 'Хост закрыл игру.';
      phase = 'choose';
      startPolling();
      render();
    }
  });
  onNet('start', (msg) => {
    if (phase !== 'joined') return;
    launch('guest', msg.mode, msg.mapId, msg.players || slots, msg.names || names, msg.res);
  });
}

function startPolling() {
  stopPolling();
  netSend({ t: 'status' });
  pollTimer = setInterval(() => { if (phase === 'choose') netSend({ t: 'status' }); }, STATUS_POLL_MS);
}

export async function openLobby() {
  errorText = '';
  phase = 'connecting';
  room = { exists: false, started: false, slots: [], names: {} };
  showScreenFn('net-screen');
  render();
  try {
    await netConnect();
  } catch (e) {
    phase = 'unavailable';
    render();
    return;
  }
  startPolling();
  // Старый сервер на запрос «status» не отвечает — так его и узнаём
  statusTimer = setTimeout(() => {
    if (phase === 'connecting') { phase = 'outdated'; stopPolling(); render(); }
  }, STATUS_WAIT_MS);
}

function launch(role, m, map, players, nameMap, res) {
  stopPolling();
  for (const k of Object.keys(playerNames)) delete playerNames[k];
  Object.assign(playerNames, nameMap || {});
  session.role = role;
  session.mode = m;
  session.mapId = map;
  session.players = players.slice();
  session.localCtrl = role === 'guest' ? mySlot : 'p1';
  session.localTeam = teamOfCtrl(session.localCtrl);
  session.startRes = res || getStartRes();
  phase = 'playing';
  if (onStart) onStart();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(text, cls, onClick) {
  const b = el('button', 'menu-btn ' + (cls || ''), text);
  b.addEventListener('click', () => { playClick(); onClick(); });
  return b;
}

function modeInfo() {
  let s = modeTitle(mode);
  if (mode === 'pvp' && MAPS[mapId] && slots.length <= 2) s += ` · карта «${MAPS[mapId].name}»`;
  return s;
}

function playersList() {
  const list = el('div', 'net-players');
  for (const s of ALL_SLOTS) {
    const here = slots.includes(s);
    const row = el('div', 'net-player' + (here ? ' here' : ''));
    const you = s === mySlot ? ' (вы)' : '';
    const hostMark = s === 'p1' ? ' 👑' : '';
    let team = '';
    if (mode === 'pvp' && here) {
      team = slots.indexOf(s) % 2 === 0 ? ' · 🔵 синие' : ' · 🔴 красные';
    }
    row.appendChild(el('span', '', here ? '✅ ' + displayName(s) + hostMark + you + team : '⏳ Свободное место'));
    if (!here) row.appendChild(el('span', 'net-wait', 'ждём…'));
    list.appendChild(row);
  }
  return list;
}

function leaveToChoose() {
  netSend({ t: 'leave' });
  phase = 'choose';
  slots = ['p1'];
  names = {};
  startPolling();
  render();
}

// Нужен ник — спрашиваем окном, если ещё не задан
async function ensureNick() {
  let n = getNick();
  if (n) return n;
  const v = await showPrompt('Как вас зовут? Этот ник увидят остальные игроки.', {
    okText: 'Продолжить', placeholder: 'Ваш ник'
  });
  n = cleanNick(v) || 'Игрок';
  setNick(n);
  const input = document.getElementById('net-nick');
  if (input) input.value = n;
  return n;
}

function render() {
  const box = document.getElementById('net-content');
  if (!box) return;
  box.innerHTML = '';

  if (phase === 'connecting') {
    box.appendChild(el('p', 'net-text', 'Подключение…'));
    box.appendChild(backButton());
    return;
  }

  if (phase === 'unavailable') {
    box.appendChild(el('p', 'net-text',
      'Игра по сети работает, когда игра запущена с компьютера через локальный сервер ' +
      '(команда node tools/serve.mjs). Все устройства должны быть в одной Wi-Fi сети.'));
    box.appendChild(backButton());
    return;
  }

  if (phase === 'outdated') {
    box.appendChild(el('p', 'net-error', '⚠ На компьютере запущена СТАРАЯ версия сервера.'));
    const steps = el('div', 'net-steps');
    steps.appendChild(el('div', '', '1. На компьютере хоста найдите окно терминала, где запущен сервер.'));
    steps.appendChild(el('div', '', '2. Нажмите Ctrl+C (остановить сервер).'));
    steps.appendChild(el('div', '', '3. Запустите снова: node tools/serve.mjs'));
    steps.appendChild(el('div', '', '4. Обновите страницу на всех устройствах (Ctrl+F5).'));
    box.appendChild(steps);
    box.appendChild(backButton());
    return;
  }

  if (phase === 'hosting') {
    box.appendChild(el('p', 'net-text', '✅ Игра создана: ' + modeInfo()));
    const hint = el('div', 'net-steps');
    hint.appendChild(el('div', '', '1. Друзья открывают в браузере (ПК или телефон):'));
    const list = addresses.length ? addresses : [location.host];
    for (const a of list) hint.appendChild(el('div', 'net-address', 'http://' + a + '/'));
    hint.appendChild(el('div', '', '2. Нажимают «Игра по сети» → «Присоединиться».'));
    hint.appendChild(el('div', '', '3. Когда все в сборе — нажмите «Начать игру».'));
    box.appendChild(hint);
    box.appendChild(playersList());

    // Стартовые ресурсы выбирает хост — они одинаковы для всех
    box.appendChild(el('div', 'diff-title', 'Стартовые ресурсы (у каждого игрока)'));
    const values = getStartRes();
    box.appendChild(buildResourceSliders(values, (v) => setStartRes(v)));

    box.appendChild(el('p', 'net-text', '⚠ Игру считает этот компьютер: не сворачивайте окно и не переключайте вкладку, пока играете.'));

    const buttons = el('div', 'menu-buttons');
    const start = button(`▶ Начать игру (${slots.length}/4)`, 'primary', () => {
      if (slots.length < 2) return;
      const res = getStartRes();
      netSend({ t: 'start', mode, mapId, players: slots, names, res });
      launch('host', mode, mapId, slots, names, res);
    });
    if (slots.length < 2) {
      start.disabled = true;
      start.style.opacity = '0.45';
      start.textContent = '▶ Начать игру (ждём друзей…)';
    }
    buttons.appendChild(start);
    buttons.appendChild(button('✖ Отмена', '', leaveToChoose));
    box.appendChild(buttons);
    return;
  }

  if (phase === 'joined') {
    box.appendChild(el('p', 'net-text', '✅ Вы подключены: ' + modeInfo()));
    box.appendChild(playersList());
    box.appendChild(el('p', 'net-text', 'Ждём, пока хост начнёт игру…'));
    const buttons = el('div', 'menu-buttons');
    buttons.appendChild(button('✖ Выйти', '', leaveToChoose));
    box.appendChild(buttons);
    return;
  }

  // === Выбор: создать игру или присоединиться ===
  if (errorText) box.appendChild(el('p', 'net-error', errorText));

  if (room.exists) {
    // На сервере уже есть игра — показываем её и предлагаем войти
    const info = el('div', 'net-room');
    const hostName = (room.names && room.names.p1) || 'Игрок 1';
    info.appendChild(el('div', 'net-room-title', (room.started ? '🔴 Игра уже идёт' : '🟢 Открыта игра: ' + hostName)));
    info.appendChild(el('div', 'net-room-sub', `${modeTitle(room.mode)} · игроков ${room.slots.length}/4`));
    const who = (room.slots || []).map((s) => (room.names && room.names[s]) || 'Игрок ' + s.slice(1)).join(', ');
    info.appendChild(el('div', 'net-room-sub', who));
    box.appendChild(info);

    const buttons = el('div', 'menu-buttons');
    const join = button('🔗 Присоединиться', 'primary', async () => {
      errorText = '';
      await ensureNick();
      netSend({ t: 'join', name: getNick() });
    });
    if (room.started || room.slots.length >= 4) {
      join.disabled = true;
      join.style.opacity = '0.45';
    }
    buttons.appendChild(join);
    buttons.appendChild(backButton(true));
    box.appendChild(buttons);
    return;
  }

  const modes = el('div', 'net-modes');
  for (const m of MODES) {
    const card = el('div', 'map-card' + (m.id === mode ? ' selected' : ''));
    card.appendChild(el('div', 'map-name', `${m.icon} ${m.title}`));
    card.appendChild(el('div', 'map-desc', m.desc));
    card.addEventListener('click', () => { playClick(); mode = m.id; render(); });
    modes.appendChild(card);
  }
  box.appendChild(modes);

  if (mode === 'pvp') {
    const maps = el('div', 'diff-block');
    maps.appendChild(el('div', 'diff-title', 'Карта (для 2 игроков; для 3–4 — арена с четырьмя углами)'));
    const row = el('div', 'diff-row');
    for (const id in MAPS) {
      const b = el('button', 'menu-btn diff-btn' + (id === mapId ? ' active' : ''), MAPS[id].name);
      b.addEventListener('click', () => { playClick(); mapId = id; render(); });
      row.appendChild(b);
    }
    maps.appendChild(row);
    box.appendChild(maps);
  }

  const buttons = el('div', 'menu-buttons');
  buttons.appendChild(button('➕ Создать игру', 'primary', async () => {
    errorText = '';
    await ensureNick();
    slots = ['p1'];
    netSend({ t: 'host', mode, mapId, name: getNick() });
  }));
  buttons.appendChild(backButton(true));
  box.appendChild(buttons);
}

function backButton(inline = false) {
  const b = button('← Назад', '', () => {
    stopPolling();
    netSend({ t: 'leave' });
    netClose();
    phase = 'choose';
    showScreenFn('main-menu');
  });
  if (inline) return b;
  const wrap = el('div', 'menu-buttons');
  wrap.appendChild(b);
  return wrap;
}
